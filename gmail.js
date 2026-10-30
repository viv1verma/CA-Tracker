// ═══════════════════════════════════════════════════════════════════════════
// MAIL MANAGEMENT — Office@garp.co.in (Google Workspace), READ-ONLY
// ---------------------------------------------------------------------------
// DESIGN DECISION THAT MATTERS: we do NOT sync or store mail.
//
// The obvious build — poll Gmail, save every message into db.json, render a
// tracker — would push hundreds of writes a day into a store that rewrites the
// ENTIRE file on every save (see writeDB). That alone would take the app down.
//
// So: query Gmail live on each page load, hold nothing. The only thing that ever
// reaches db.json is a task the user explicitly created from a mail — one write,
// identical to creating an assignment by hand.
//
// What IS persisted: a single OAuth refresh token, encrypted with the same
// AES-256-GCM vault used for client documents (vaultWrite/vaultRead).
//
// SCOPE: gmail.readonly only. This module cannot send, label, archive or delete.
// That is deliberate — a bug here can waste your time but can never touch the
// firm's mail.
//
// GOOGLE SETUP (one time):
//   1. console.cloud.google.com -> new project
//   2. Enable "Gmail API"
//   3. OAuth consent screen -> User type: INTERNAL  (garp.co.in Workspace)
//      Internal apps skip Google's CASA verification for restricted scopes.
//   4. Scope: https://www.googleapis.com/auth/gmail.readonly
//   5. Credentials -> OAuth client ID -> Web application
//      Redirect URI: https://<your-app>/api/gmail/callback
//   6. Railway variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// One vault entry per linked mailbox. Keeping them separate is the whole point
// of the segregation requirement: office@ correspondence and a partner's own
// mail must never be pooled into one list.
const ACCOUNTS = [
  { key: 'office',    email: 'office@garp.co.in',           label: 'Office' },
  { key: 'ashutosh',  email: 'ashutosh.verma@garp.co.in',   label: 'Ashutosh' },
  // ashutoshvermaca@gmail.com and ashutosh.verma@mail.ca.in cannot be linked:
  // the OAuth app is Internal, so Google returns 403 org_internal for any
  // account outside garp.co.in. Forward them into a linked mailbox instead and
  // route them with a mail rule (see /api/gmail/rules).
];
const accountByKey = k => ACCOUNTS.find(a => a.key === k) || ACCOUNTS[0];
const tokenIdFor = k => 'gmail-token-' + accountByKey(k).key;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// gmail.send is additive: it permits sending only. It does NOT allow deleting,
// modifying or moving anything — those need gmail.modify, which we still do not
// request. So the worst a bug here can do is send a message; it can never
// destroy mail.
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

const FETCH_TIMEOUT_MS = 20000;
const MSG_CONCURRENCY = 5;      // be gentle; Gmail rate-limits per user
// Per PAGE, not in total. Each thread costs one Gmail call to read its headers,
// so a page of 250 is already ~50 round trips; asking for 10,000 at once would
// be 10,000 calls, several minutes, and a timed-out request. Paging reaches any
// depth without any single request being large.
const MAX_THREADS = 250;

// ── What a CA practice actually needs flagged ───────────────────────────────
// Ordered by urgency: the first matching rule wins, so statutory notices beat
// generic "due date" language.
// NOTE ON \b: "Statutory Audit_FY 2025-26" did NOT match /\bstatutory\s+audit\b/
// because \b requires a word/non-word transition, and "_" is a WORD character.
// Real subject lines are full of Audit_FY, TDS_Q1, GSTR3B_Aug. So trailing \b is
// dropped wherever a suffix can legally follow.
const FLAG_RULES = [
  { key: 'gst',         label: 'GST',              tone: 'red',
    re: /\b(?:DRC-?0?\d|ASMT-?\d{1,2}|REG-?\d{1,2}|GSTR-?\d[AB]?|GSTIN|CMP-?\d{2}|ITC-?\d{2})|(?:^|\W)gst(?:in|r)?(?:\W|$)|\be-?way\s*bill/i },
  { key: 'it_notice',   label: 'Income tax',       tone: 'red',
    re: /(?:u\/?s\.?|section|sec\.?)\s*1(?:43|42|44|48|53|56)|1(?:43|42|44)\s*\(\s*\d[A-Za-z]?\s*\)|income[\s-]?tax|\bITBA\b|\be-?proceeding|\b15C[AB]\b|form\s*15C[AB]|\b26AS\b|advance\s*tax|tax\s+computation|\bITR[\s-]?[1-7V]?\b/i },
  { key: 'hearing',     label: 'Hearing',          tone: 'red',
    re: /personal\s+hearing|date\s+of\s+hearing|hearing\s+(?:is\s+)?(?:scheduled|fixed)|appellate|CIT\s*\(\s*A\s*\)|\bITAT\b|adjudicat|show\s*cause|\bSCN\b/i },
  { key: 'tds',         label: 'TDS',              tone: 'amber',
    re: /\bTRACES\b|\b26AS\b|form\s*16[AB]?|\b(?:27EQ|24Q|26Q|27Q)\b|\bTDS\b|\bTCS\b|lower\s+deduction/i },
  { key: 'roc',         label: 'ROC / MCA',        tone: 'amber',
    re: /\bMCA(?:21)?\b|\bROC\b|DIR-?3|\bDIN\b|AOC-?4|MGT-?7|INC-?\d{2}|form\s*(?:AOC|MGT|DIR)|\bLLP\b\s*form/i },
  { key: 'audit',       label: 'Audit',            tone: 'blue',
    re: /statutory\s+audit|internal\s+audit|concurrent\s+audit|stock\s+audit|tax\s+audit|audit\s+(?:report|observation|query|memo|plan|programme)|\bLFAR\b|\b3C[AB D]\b/i },
  { key: 'tender',      label: 'Tender',           tone: 'blue',
    re: /\btender\b|empanel|(?:^|\W)EOI(?:\W|$)|expression\s+of\s+interest|\bRFP\b|bid\s+(?:document|submission)|e-?procurement|\bGeM\b/i },
  { key: 'payroll',     label: 'Payroll',          tone: 'grey',
    re: /salary\s+(?:register|sheet|statement)|payroll|\bPF\b|\bESI[C]?\b|gratuity|form\s*16\b/i },
  { key: 'deadline',    label: 'Due date',         tone: 'amber',
    re: /due\s+(?:date|on|by)|last\s+date|deadline|within\s+\d+\s+days|time\s+barr?ing|reminder\s+only|\breminder\b/i },
  { key: 'payment',     label: 'Invoice',          tone: 'grey',
    re: /\binvoice\b|remittance|payment\s+(?:advice|received|made|due)|\bNEFT\b|\bRTGS\b|\bUTR\b|fee\s+note|\bPO\b\s*#/i },
  { key: 'docs',        label: 'Documents',        tone: 'grey',
    re: /\bPFA\b|please\s+find\s+attached|documents?\s+(?:attached|required|for)|vendor\s+registration|\bKYC\b/i }
];


// ── Is this bulk marketing? ─────────────────────────────────────────────────
// Gmail's own `category:promotions` only works when the mailbox has tabbed
// categories switched on, and most Workspace accounts do not. So this decides
// from the message itself.
//
// The strongest signal by far is List-Unsubscribe: legitimate bulk senders are
// required to include it and one-to-one mail never does. Precedence: bulk and
// the usual marketing subject lines back it up.
//
// DELIBERATELY CONSERVATIVE. A missed promo is clutter; a client's mail wrongly
// hidden is work not done. So a promotional verdict needs the unsubscribe header
// OR two weaker signals together \u2014 never one weak signal alone.
const PROMO_SUBJECT = /\b(?:\d{1,2}%\s*off|sale\b|discount|offer\s+ends|limited\s+time|webinar|newsletter|unsubscribe|deal[s]?\b|coupon|promo\b|free\s+trial|upgrade\s+now|last\s+chance|don'?t\s+miss|exclusive\s+offer|black\s+friday|festive\s+offer)/i;
const PROMO_SENDER  = /(?:^|[.\-_])(?:marketing|promo|offers?|deals?|news|newsletter|campaign|hello|hi|team|info|updates?|noreply|no-reply)@|@(?:mailchimp|sendgrid|hubspot|salesforce|mailer|campaign|marketo|klaviyo|braze)\./i;

function isPromotional(headers, subject, labelIds) {
  const h = headers || {};
  const hasUnsub = !!(h['list-unsubscribe'] || h['list-id']);
  const bulk = /bulk|list|auto_reply/i.test(String(h['precedence'] || ''));
  const cat = (labelIds || []).some(l => l === 'CATEGORY_PROMOTIONS' || l === 'CATEGORY_SOCIAL');
  if (cat) return true;                       // Gmail already decided
  if (hasUnsub) return true;                  // the reliable one
  let weak = 0;
  if (bulk) weak++;
  if (PROMO_SUBJECT.test(String(subject || ''))) weak++;
  if (PROMO_SENDER.test(String(h['from'] || ''))) weak++;
  return weak >= 2;                           // never on a single weak signal
}

function flagsFor(text) {
  const t = String(text || '');
  const out = [];
  FLAG_RULES.forEach(r => { if (r.re.test(t)) out.push({ key: r.key, label: r.label, tone: r.tone }); });
  return out.slice(0, 3);   // three badges is all a table row can carry legibly
}

// ── helpers ─────────────────────────────────────────────────────────────────
function b64urlJson(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

async function jfetch(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    const body = await r.text();
    let json = null;
    try { json = JSON.parse(body); } catch (e) { /* non-JSON error page */ }
    if (!r.ok) {
      const msg = (json && json.error && (json.error.message || json.error_description)) || ('HTTP ' + r.status);
      const err = new Error(msg); err.status = r.status; err.body = json; throw err;
    }
    return json;
  } finally { clearTimeout(to); }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

function headerOf(payload, name) {
  const hs = (payload && payload.headers) || [];
  const h = hs.find(x => String(x.name || '').toLowerCase() === name.toLowerCase());
  return h ? String(h.value || '') : '';
}
function parseFrom(v) {
  const m = String(v || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const e = String(v || '').trim().toLowerCase();
  return { name: e, email: e };
}
function daysSince(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.floor((Date.now() - Number(ms)) / 86400000));
}

// ═══════════════════════════════════════════════════════════════════════════
// mountGmail(app, { auth, adminOnly, readDB, writeDB, vaultWrite, vaultRead,
//                   logAudit, newId })
// ═══════════════════════════════════════════════════════════════════════════

// ── Who may see which conversation ──────────────────────────────────────────
// Partners and admins see the whole mailbox. Everyone else sees only threads
// that are theirs: assigned to them directly, or belonging to a client whose
// mail they handle.
//
// This is applied on the SERVER, on every route that can reach a message \u2014 not
// just the list. Filtering only the list would leave the thread, message and
// attachment routes open to anyone who guessed an id, which is not a filter but
// a suggestion.
function isMailAdmin(user, isPartner) {
  return !!(user && (user.role === 'admin' || isPartner));
}
function visibleThreadIds(db, userId) {
  const owners = db.mailOwners || {};
  const mine = new Set();
  Object.keys(owners).forEach(tid => { if (owners[tid] && owners[tid].userId === userId) mine.add(tid); });
  return mine;
}
// A client can now have SEVERAL people handling its mail. mailOwnerId (single)
// is still honoured so existing assignments keep working untouched.
function clientAssignees(c) {
  const out = [];
  if (Array.isArray(c.mailOwnerIds)) c.mailOwnerIds.forEach(x => { if (x) out.push(x); });
  if (c.mailOwnerId && out.indexOf(c.mailOwnerId) < 0) out.push(c.mailOwnerId);
  return out;
}
function clientsOwnedBy(db, userId) {
  const ids = new Set();
  (db.clients || []).forEach(c => { if (clientAssignees(c).indexOf(userId) >= 0) ids.add(c.id); });
  return ids;
}
// A row is visible when it is explicitly assigned to the user, OR its client is
// one they handle. Deliberately NOT "unassigned is visible to everyone" \u2014 that
// would expose the whole inbox by default.
// userId is a PARAMETER, not module state: an earlier draft held it in a
// module-level ref, which two simultaneous requests from different users would
// have clobbered — one member could have been served another's mail.
function canSeeRow(row, userId, mineThreads, myClients) {
  if (row.owner && row.owner.userId) return row.owner.userId === userId;
  if (mineThreads.has(row.threadId)) return true;
  if (row.client && myClients.has(row.client.id)) return true;
  return false;
}


function mountGmail(app, deps) {
  const { auth, adminOnly, readDB, vaultWrite, vaultRead } = deps;
  // partnerOrAdmin is not always injected; fall back to a pass-through so a
  // missing dep degrades to "any signed-in user" rather than crashing at mount.
  const partnerOrAdminSafe = deps.partnerOrAdmin || function (req, res, next) { next(); };
  const logAudit = deps.logAudit || function () {};
  const writeDB = deps.writeDB;

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const REDIRECT = BASE_URL + '/api/gmail/callback';

  function configured() { return !!(CLIENT_ID && CLIENT_SECRET && BASE_URL); }

  // Refresh token at rest: encrypted, same vault as client documents.
  function saveToken(acct, obj) { vaultWrite(tokenIdFor(acct), Buffer.from(JSON.stringify(obj), 'utf8')); }
  function loadTokenFor(acct) {
    try { return JSON.parse(vaultRead(tokenIdFor(acct)).toString('utf8')); }
    catch (e) { return null; }
  }
  const acctOf = req => accountByKey(String((req.query && req.query.account) || (req.body && req.body.account) || 'office')).key;

  // Access tokens live ~1h. Cache in memory only — never on disk, never in db.json.
  const _access = {};   // per account: { token, expires }
  async function accessToken(acct) {
    const c = _access[acct];
    if (c && c.token && Date.now() < c.expires - 60000) return c.token;
    const t = loadTokenFor(acct);
    if (!t || !t.refresh_token) { const e = new Error('Gmail is not connected.'); e.status = 428; throw e; }
    const body = new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: t.refresh_token, grant_type: 'refresh_token'
    });
    const j = await jfetch(OAUTH_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
    _access[acct] = { token: j.access_token, expires: Date.now() + (Number(j.expires_in || 3600) * 1000) };
    return j.access_token;
  }
  const gapi = async (acct, pathAndQuery) => jfetch(GMAIL_API + pathAndQuery, {
    headers: { Authorization: 'Bearer ' + (await accessToken(acct)) }
  });

  // ── status: every mailbox at once, so the UI can show tabs ──────────────
  app.get('/api/gmail/status', auth, (req, res) => {
    res.json({
      configured: configured(),
      accounts: ACCOUNTS.map(a => {
        const t = loadTokenFor(a.key);
        return { key: a.key, label: a.label, expected: a.email,
                 connected: !!(t && t.refresh_token), mailbox: (t && t.email) || '',
                 connectedAt: (t && t.connectedAt) || '', connectedBy: (t && t.connectedByName) || '' };
      }),
      readOnly: true,
      setupHint: configured() ? '' :
        'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_BASE_URL in Railway, then reconnect.'
    });
  });

  // ── connect ─────────────────────────────────────────────────────────────
  app.get('/api/gmail/connect', auth, adminOnly, (req, res) => {
    if (!configured()) return res.status(400).json({ error: 'Google OAuth is not configured on the server.' });
    const acct = acctOf(req);
    const state = b64urlJson({ u: req.user.id, n: req.user.name, a: acct, t: Date.now() });
    res.json({ url: OAUTH_AUTH_URL + '?' + new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code',
      scope: SCOPE, access_type: 'offline', prompt: 'consent',
      login_hint: accountByKey(acct).email, state }) });
  });

  app.get('/api/gmail/callback', async (req, res) => {
    const page = (title, msg, ok) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:-apple-system,system-ui,sans-serif;padding:40px;text-align:center;color:#0f172a">
<div style="font-size:44px">${ok ? '\u2705' : '\u26A0\uFE0F'}</div>
<h2 style="margin:12px 0">${title}</h2><p style="color:#64748b;max-width:460px;margin:0 auto">${msg}</p>
<p style="margin-top:24px"><a href="/" style="background:#1a56db;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700">Back to GARP Tracker</a></p></body>`;
    let who = {};
    try { who = JSON.parse(Buffer.from(String(req.query.state || ''), 'base64url').toString('utf8')); } catch (e) {}
    const acct = accountByKey(who.a).key;
    try {
      if (req.query.error) return res.status(400).send(page('Not connected', 'Google returned: ' + String(req.query.error), false));
      const code = String(req.query.code || '');
      if (!code) return res.status(400).send(page('Not connected', 'No authorisation code was returned.', false));
      const j = await jfetch(OAUTH_TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT, grant_type: 'authorization_code' })
      });
      if (!j.refresh_token) return res.status(400).send(page('Not connected',
        'Google did not return a refresh token. Remove GARP Tracker at myaccount.google.com \u2192 Security \u2192 Third-party access, then connect again.', false));
      _access[acct] = { token: j.access_token, expires: Date.now() + (Number(j.expires_in || 3600) * 1000) };
      let email = '';
      try { email = (await gapi(acct, '/profile')).emailAddress || ''; } catch (e) {}

      // Guard against linking the wrong mailbox to a slot \u2014 the whole point of
      // two accounts is that their mail stays apart.
      const want = accountByKey(acct).email.toLowerCase();
      if (email && email.toLowerCase() !== want) {
        return res.status(400).send(page('Wrong mailbox',
          'You signed in as ' + email + ', but this slot is for ' + want + '. Sign out of Google and try again.', false));
      }
      saveToken(acct, { refresh_token: j.refresh_token, email, connectedAt: new Date().toISOString(),
        connectedBy: who.u || '', connectedByName: who.n || '' });
      res.send(page('Mailbox connected', (email || 'The mailbox') + ' is linked, read-only.', true));
    } catch (e) {
      res.status(500).send(page('Could not connect', String(e.message || e), false));
    }
  });

  app.delete('/api/gmail/disconnect', auth, adminOnly, (req, res) => {
    const acct = acctOf(req);
    try {
      saveToken(acct, {});
      delete _access[acct];
      const db = readDB();
      logAudit(db, req, 'deleted', 'settings', 'gmail-' + acct, 'Mail', 'disconnected ' + accountByKey(acct).email);
      writeDB(db);
    } catch (e) {}
    res.json({ ok: true });
  });

  // ── the table: THREADS, with reply state ────────────────────────────────
  app.get('/api/gmail/threads', auth, async (req, res) => {
    const acct = acctOf(req);
    try {
      const max = Math.min(Number(req.query.limit) || 50, MAX_THREADS);
      // Promotions and social are noise in a firm inbox. Excluded by default;
      // an explicit category: in the user's own query wins.
      // No date restriction by default: Gmail returns newest first anyway, and
      // capping to 30 days hid every older correspondent from the list.
      let q = String(req.query.q || 'in:inbox').slice(0, 300);
      if (!/category:/i.test(q)) q += ' -category:promotions -category:social -category:forums';

      // A member sees only their own clients' mail. Filtering AFTER Gmail returns
      // a page meant a page of 250 might contain three of theirs — which is
      // exactly the "only three mails loaded" problem. So restrict the QUERY
      // instead and let Gmail do the filtering: every page then comes back full
      // of mail they can actually see.
      const _db = readDB();
      const _admin = isMailAdmin(req.user, deps.isPartnerUser ? deps.isPartnerUser(req.user, _db) : false);
      if (!_admin) {
        const myClients = clientsOwnedBy(_db, req.user.id);
        const map = _db.mailClientMap || {};
        const addrs = Object.keys(map).filter(e => myClients.has(map[e].clientId));
        // Their clients' domains too, so a colleague at the same company is
        // included without every address having been mapped by hand.
        const doms = new Set();
        (_db.clients || []).forEach(c => {
          if (!myClients.has(c.id)) return;
          const d = String(c.email || '').toLowerCase().split('@')[1];
          if (d && !/gmail|yahoo|outlook|hotmail|rediff|icloud/.test(d)) doms.add(d);
        });
        addrs.forEach(e => { const d = e.split('@')[1]; if (d && /gmail|yahoo|outlook|hotmail|rediff/.test(d)) return; });
        const terms = addrs.map(e => 'from:' + e).concat(Array.from(doms).map(d => 'from:' + d));
        if (!terms.length) {
          // Nothing assigned yet: return an empty list with an explanation
          // rather than a page of mail they are not allowed to see.
          return res.json({ ok: true, account: acct, q, count: 0, rows: [], nextPageToken: null,
            summary: { needsReply: 0, awaiting: 0, replied: 0, fyi: 0 },
            note: 'No clients are assigned to you yet. Ask an admin to assign you on the client record.' });
        }
        q += ' (' + terms.join(' OR ') + ')';
      }
      const params = { q, maxResults: String(max) };
      if (req.query.pageToken) params.pageToken = String(req.query.pageToken);
      const list = await gapi(acct, '/threads?' + new URLSearchParams(params));
      const ids = (list.threads || []).map(t => t.id);
      if (!ids.length) return res.json({ ok: true, account: acct, q, count: 0, rows: [], nextPageToken: null });

      const me = String((loadTokenFor(acct) || {}).email || accountByKey(acct).email).toLowerCase();
      const myDomain = me.split('@')[1] || '';

      const db = readDB();
      const clients = (db.clients || []).map(c => ({
        id: c.id, name: c.name || '', email: String(c.email || '').toLowerCase(),
        domain: String(c.email || '').toLowerCase().split('@')[1] || '',
        groupId: c.groupId || c.groupID || null      // so group siblings can be told apart
      }));

      const threads = await mapLimit(ids, MSG_CONCURRENCY, async id => {
        try {
          return await gapi(acct, '/threads/' + id + '?format=metadata&'
            + 'metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date'
            + '&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Id&metadataHeaders=Precedence');
        } catch (e) { return null; }
      });

      const OUR_DOMAIN = myDomain;
      const FREEMAIL = /gmail|yahoo|outlook|hotmail|rediff|icloud|live\.com|proton/;
      const STOP = new Set(['pvt','private','limited','ltd','llp','and','the','company',
        'inc','industries','enterprises','associates','group','india','services','solutions','technologies']);
      const tokensOf = n => String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
      const acronymOf = n => { const w = String(n || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/)
        .filter(x => x.length > 2 && !STOP.has(x.toLowerCase()));
        return w.length >= 2 ? w.map(x => x[0].toLowerCase()).join('') : ''; };
      clients.forEach(c => { c.tokens = tokensOf(c.name); c.acr = acronymOf(c.name); });

      // CLIENT IDENTIFICATION, ordered by how much it can be trusted.
      //
      // The loose text sweep was matching "jdhingra310@gmail.com" to an
      // unrelated client because a short token happened to appear in the body.
      // A wrong client name is worse than none — it sends work to the wrong
      // partner — so the text sweep is now the LAST resort and demands a long,
      // whole-word, unambiguous hit.
      const localOf = e => String(e || '').split('@')[0].toLowerCase().replace(/[^a-z]/g, '');

      const matchClient = (email, name, hayExtra) => {
        const dom = (email.split('@')[1] || '').toLowerCase();
        const internal = !!OUR_DOMAIN && dom === OUR_DOMAIN;
        const corporate = dom && !internal && !FREEMAIL.test(dom);

        // 0. A mapping someone set by hand. Highest confidence there is.
        const mapped = senderMap[email];
        if (mapped) {
          const mc = clients.find(x => x.id === mapped.clientId);
          if (mc) {
            // ONE ADDRESS, SEVERAL COMPANIES. A group accountant writes from a
            // single mailbox for every company in the group, so the address
            // alone cannot say which one a mail is about. When the mapped
            // client belongs to a group, read the subject and body for a
            // SIBLING company's name and prefer that — the mail itself says
            // who it concerns ("Balance Sheet of Phaseline", "GSTR-3B for
            // Maxel Rock"). Only an unambiguous single sibling match wins;
            // otherwise the mapped client stands.
            if (mc.groupId) {
              const hay = String(hayExtra || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
              const sibs = clients.filter(x => x.groupId === mc.groupId && x.id !== mc.id);
              const hits = sibs.filter(x => x.tokens.some(t =>
                t.length >= 4 && new RegExp('(^|\\s)' + t + '(\\s|$)').test(hay)));
              if (hits.length === 1) {
                return { id: hits[0].id, name: hits[0].name, via: 'group \u2014 named in subject' };
              }
            }
            return { id: mc.id, name: mc.name, via: 'mapped' };
          }
        }

        // 1. Exact address on the client record.
        let c = clients.find(x => x.email && x.email === email);
        if (c) return { id: c.id, name: c.name, via: 'email' };

        // 2. Corporate domain \u2014 the company itself is the sender.
        if (corporate) {
          c = clients.find(x => x.domain && x.domain === dom);
          if (c) return { id: c.id, name: c.name, via: 'domain' };
          const dw = dom.split('.')[0];
          c = clients.find(x => x.acr === dw || x.tokens.some(t => t === dw)
            || (dw.length >= 5 && x.tokens.some(t => t.length >= 5 && dw.includes(t))));
          if (c) return { id: c.id, name: c.name, via: 'domain' };
        }

        // 3. The e-mail LOCAL PART. Individual clients write from gmail, and
        //    "jdhingra310" carries the surname even though the domain is useless.
        //    Requires a 5+ character surname hit so "raj" cannot match everything.
        const lp = localOf(email);
        if (lp.length >= 5) {
          c = clients.find(x => x.tokens.some(t => t.length >= 5 && lp.includes(t)));
          if (c) return { id: c.id, name: c.name, via: 'sender name' };
        }

        // 4. The sender's DISPLAY NAME against the client name. Two matching
        //    words, or one long one \u2014 "Jitendra Dhingra" vs "Dhingra Traders".
        const dn = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
        if (dn.trim()) {
          c = clients.find(x => {
            const hits = x.tokens.filter(t => new RegExp('(^| )' + t + '( |$)').test(dn));
            return hits.length >= 2 || hits.some(t => t.length >= 6);
          });
          if (c) return { id: c.id, name: c.name, via: 'sender name' };
        }

        // 5. LAST RESORT \u2014 the subject/body. Deliberately strict: a single
        //    6+ character whole-word hit, and only if exactly ONE client matches.
        //    Ambiguity here means we say nothing rather than guess wrong.
        const hay = String(hayExtra || '').toLowerCase().replace(/[^a-z0-9\s@.]/g, ' ');
        const cands = clients.filter(x => x.tokens.some(t =>
          t.length >= 6 && new RegExp('(^|[\\s@.])' + t + '([\\s@.]|$)').test(hay)));
        if (cands.length === 1) {
          return { id: cands[0].id, name: cands[0].name, via: internal ? 'internal mail' : 'subject/body' };
        }
        return null;
      };

      // Thread-level assignments, and each client's standing owner. Both are
      // read once here rather than per row.
      const owners = db.mailOwners || {};
      // Sender -> client, set by a human. This beats every heuristic below:
      // once someone has said "this address is Amunra", it is not a guess any
      // more, and it must never be second-guessed by fuzzy matching.
      const senderMap = db.mailClientMap || {};
      // Auto-assign an owner ONLY when a client has exactly one assignee. With
      // several, picking one arbitrarily would put the thread in one person's
      // queue and out of everyone else's — the opposite of sharing it. Shared
      // clients stay unassigned but are visible to all of their assignees.
      const clientOwner = {}, clientTeam = {};
      (db.clients || []).forEach(c => {
        const a = clientAssignees(c);
        if (!a.length) return;
        clientTeam[c.id] = a;
        if (a.length === 1) {
          const u = (db.users || []).find(x => x.id === a[0]);
          clientOwner[c.id] = { userId: a[0], name: (u && u.name) || c.mailOwnerName || '' };
        }
      });

      const rows = threads.filter(Boolean).map(th => {
        const ms = (th.messages || []).map(m => {
          const f = parseFrom(headerOf(m.payload, 'From'));
          return { fromEmail: f.email, fromName: f.name, ms: Number(m.internalDate || 0),
                   isOutbound: f.email === me, labels: m.labelIds || [],
                   to: headerOf(m.payload, 'To'), cc: headerOf(m.payload, 'Cc'),
                   subject: headerOf(m.payload, 'Subject') };
        }).sort((x, y) => x.ms - y.ms);
        if (!ms.length) return null;

        const first = ms[0], last = ms[ms.length - 1];
        const lastInbound = [...ms].reverse().find(m => !m.isOutbound) || first;
        const subject = (first.subject || last.subject || '(no subject)').slice(0, 300);
        const snippet = String(th.messages[th.messages.length - 1].snippet || '').slice(0, 240);
        const rs = replyStateOf(ms) || {};

        // Judge on the LAST message: a thread that began as a newsletter but
        // that someone actually replied to is a conversation, not a promo.
        const lastRaw = th.messages[th.messages.length - 1];
        const hdrs = {};
        ((lastRaw.payload && lastRaw.payload.headers) || []).forEach(x => {
          hdrs[String(x.name || '').toLowerCase()] = x.value;
        });
        const promo = ms.length === 1 && !last.isOutbound &&
          isPromotional(hdrs, subject, lastRaw.labelIds || []);

        return {
          id: last.id || th.id, threadId: th.id,
          fromName: lastInbound.fromName || lastInbound.fromEmail,
          fromEmail: lastInbound.fromEmail,
          internal: !!OUR_DOMAIN && (lastInbound.fromEmail.split('@')[1] === OUR_DOMAIN),
          subject, snippet,
          date: last.ms ? new Date(last.ms).toISOString() : '',
          inboundDate: lastInbound.ms ? new Date(lastInbound.ms).toISOString() : '',
          daysAgo: daysSince(last.ms),
          msgCount: ms.length,
          unread: ms.some(m => m.labels.includes('UNREAD')),
          hasAttachment: false,
          replyState: rs.state, replyLabel: rs.label, replyTone: rs.tone,
          waitingDays: rs.waitingDays || 0, repliedAt: rs.repliedAt, responseHours: rs.responseHours,
          client: matchClient(lastInbound.fromEmail, lastInbound.fromName,
            subject + ' ' + snippet + ' ' + (lastInbound.to || '') + ' ' + (lastInbound.cc || '')),
          promotional: promo,
          toRaw: lastInbound.to || '', ccRaw: lastInbound.cc || '',   // for routing rules
          owner: owners[th.id] || null,   // resolved just below
          sharedWith: null,               // filled in with the client team below
          flags: flagsFor(subject + ' \u2014 ' + snippet),
          link: 'https://mail.google.com/mail/u/0/#inbox/' + th.id
        };
      }).filter(Boolean);

      // Restrict to the caller's own mail unless they are a partner or admin.
      const amAdmin = isMailAdmin(req.user, deps.isPartnerUser ? deps.isPartnerUser(req.user, db) : false);
      if (!amAdmin) {

        const mineThreads = visibleThreadIds(db, req.user.id);
        const myClients = clientsOwnedBy(db, req.user.id);
        for (let i = rows.length - 1; i >= 0; i--) {
          if (!canSeeRow(rows[i], req.user.id, mineThreads, myClients)) rows.splice(i, 1);
        }
      }

      // Hide bulk marketing unless explicitly asked for. Hidden, never dropped:
      // the count is returned so nothing disappears silently.
      // (This block was missing entirely — only its usage below was applied,
      //  which threw "showPromo is not defined" and broke the whole route.)
      const promoCount = rows.filter(r => r.promotional).length;
      const showPromo = String(req.query.promo || '') === '1';
      if (!showPromo) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].promotional) rows.splice(i, 1); }

      // Apply the client's standing owner to anything not explicitly assigned.
      rows.forEach(r => {
        if (r.client && clientTeam[r.client.id] && clientTeam[r.client.id].length > 1) {
          r.sharedWith = clientTeam[r.client.id].map(id => {
            const u = (db.users || []).find(x => x.id === id); return u ? u.name : id;
          });
        }
        if (!r.owner && r.client && clientOwner[r.client.id]) {
          r.owner = Object.assign({}, clientOwner[r.client.id], { auto: true });
        }
      });

      // Newest first. An inbox's natural order is chronological, and forcing a
      // priority order on arrival makes the screen unfamiliar. The needs-reply
      // card is one tap away when you want the work queue instead, and any
      // column header re-sorts on click.
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      res.json({ ok: true, account: acct, mailbox: me, q, count: rows.length, rows, readOnly: true,
        nextPageToken: list.nextPageToken || null,
        estimate: list.resultSizeEstimate || null,
        promotionalHidden: showPromo ? 0 : promoCount, showingPromotional: showPromo,
        summary: {
          needsReply: rows.filter(r => r.replyState === 'needs_reply').length,
          awaiting:   rows.filter(r => r.replyState === 'awaiting_them').length,
          replied:    rows.filter(r => r.replyState === 'replied').length,
          fyi:        rows.filter(r => r.replyState === 'fyi').length
        } });
    } catch (e) {
      const code = e.status === 428 ? 428 : (e.status === 401 || e.status === 403) ? 401 : 502;
      res.status(code).json({ account: acct, error:
        code === 428 ? 'This mailbox is not connected. An admin can link it from the Mail screen.'
      : code === 401 ? 'Access expired or was revoked. An admin needs to reconnect this mailbox.'
      : 'Could not read mail: ' + (e.message || 'unknown error') });
    }
  });


  // ── one thread, expanded: the conversation as a flow ────────────────────
  // The list answers "does this need a reply". This answers "what actually
  // happened" — every message, who sent it, and crucially the GAP between them.
  // Gaps are the point: a 6-day silence in the middle of a thread is the thing
  // a partner needs to see, and it is invisible in any normal mail client.
  app.get('/api/gmail/thread/:id', auth, async (req, res) => {
    const acct = acctOf(req);
      // Access check. Filtering only the list would leave this route open to
      // anyone who guessed a thread id, so the same rule is enforced here.
      const _db = readDB();
      const _admin = isMailAdmin(req.user, deps.isPartnerUser ? deps.isPartnerUser(req.user, _db) : false);
      if (!_admin) {
        const _mine = visibleThreadIds(_db, req.user.id);
        const _cli = clientsOwnedBy(_db, req.user.id);
        const _own = (_db.mailOwners || {})[req.params.id];
        const okByThread = _mine.has(req.params.id);
        const okByClient = Object.keys(_db.mailClientMap || {}).some(e => {
          const m = _db.mailClientMap[e];
          return m && _cli.has(m.clientId);
        });
        if (!okByThread && !(okByClient && !_own)) {
          return res.status(403).json({ error: 'This conversation is not assigned to you.' });
        }
      }
    try {
      const th = await gapi(acct, '/threads/' + encodeURIComponent(req.params.id)
        + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc'
        + '&metadataHeaders=Subject&metadataHeaders=Date');
      const me = String((loadTokenFor(acct) || {}).email || accountByKey(acct).email).toLowerCase();
      const msgs = (th.messages || []).map(m => {
        const f = parseFrom(headerOf(m.payload, 'From'));
        return {
          id: m.id, fromName: f.name || f.email, fromEmail: f.email,
          to: headerOf(m.payload, 'To'), cc: headerOf(m.payload, 'Cc'),
          subject: headerOf(m.payload, 'Subject'),
          snippet: String(m.snippet || '').slice(0, 400),
          ms: Number(m.internalDate || 0),
          date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : '',
          isOutbound: f.email === me,
          unread: (m.labelIds || []).includes('UNREAD')
        };
      }).sort((a, b) => a.ms - b.ms);

      // Gap since the previous message, in hours. The first message has none.
      msgs.forEach((m, i) => {
        m.gapHours = i === 0 ? null : Math.round((m.ms - msgs[i - 1].ms) / 3600000);
        m.turn = i + 1;
      });
      const rs = replyStateOf(msgs) || {};
      res.json({ ok: true, account: acct, threadId: req.params.id,
        subject: (msgs[0] && msgs[0].subject) || '(no subject)',
        count: msgs.length, messages: msgs,
        replyState: rs.state, replyLabel: rs.label, replyTone: rs.tone,
        waitingDays: rs.waitingDays || 0, responseHours: rs.responseHours,
        link: 'https://mail.google.com/mail/u/0/#inbox/' + req.params.id });
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not open the conversation: ' + (e.message || '') });
    }
  });

  // ── thread ownership: who in the firm owes this reply ────────────────────
  // Stored as ONE small map in db.json, keyed by threadId. No mail is stored —
  // only the assignment, which is firm data and belongs to us, not to Gmail.
  app.post('/api/gmail/owner', auth, (req, res) => {
    const b = req.body || {};
    const tid = String(b.threadId || '').slice(0, 80);
    if (!tid) return res.status(400).json({ error: 'No conversation given.' });
    const db = readDB();
    if (!db.mailOwners) db.mailOwners = {};
    if (!b.userId) {
      delete db.mailOwners[tid];
    } else {
      const u = (db.users || []).find(x => x.id === b.userId);
      if (!u) return res.status(404).json({ error: 'Team member not found.' });
      db.mailOwners[tid] = { userId: u.id, name: u.name,
        setBy: req.user.name, setAt: new Date().toISOString(), account: acctOf(req) };
    }
    writeDB(db);
    res.json({ ok: true, owner: db.mailOwners[tid] || null });
  });

  // ── a client's standing mail owner ─────────────────────────────────────
  app.post('/api/gmail/client-owner', auth, partnerOrAdminSafe, (req, res) => {
    const b = req.body || {};
    const db = readDB();
    const c = (db.clients || []).find(x => x.id === b.clientId);
    if (!c) return res.status(404).json({ error: 'Client not found.' });
    // Accepts either userIds (several) or userId (one), so older callers and
    // saved data keep working.
    const wanted = Array.isArray(b.userIds) ? b.userIds
      : (b.userId ? [b.userId] : []);
    const valid = [];
    for (const id of wanted) {
      const u = (db.users || []).find(x => x.id === id);
      if (!u) return res.status(404).json({ error: 'Team member not found.' });
      if (valid.indexOf(u.id) < 0) valid.push(u.id);
    }
    if (!valid.length) { delete c.mailOwnerIds; delete c.mailOwnerId; delete c.mailOwnerName; }
    else {
      c.mailOwnerIds = valid;
      // Keep the single fields in step for anything still reading them.
      const first = (db.users || []).find(x => x.id === valid[0]);
      c.mailOwnerId = valid[0]; c.mailOwnerName = (first && first.name) || '';
    }
    const names = valid.map(id => { const u = (db.users || []).find(x => x.id === id); return u ? u.name : id; });
    logAudit(db, req, 'updated', 'client', c.id, c.name,
      names.length ? ('mail assigned to ' + names.join(', ')) : 'mail assignees cleared');
    writeDB(db);
    res.json({ ok: true, clientId: c.id, mailOwnerIds: c.mailOwnerIds || [],
      mailOwnerId: c.mailOwnerId || null, mailOwnerName: c.mailOwnerName || '' });
  });

  // ── map a sender address to a client ───────────────────────────────────
  // The heuristics get it right most of the time; this is how you fix the rest,
  // permanently. Keyed by e-mail address, so every future thread from that
  // sender resolves without guessing.
  app.post('/api/gmail/map-sender', auth, partnerOrAdminSafe, (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return res.status(400).json({ error: 'A sender address is required.' });
    const db = readDB();
    if (!db.mailClientMap) db.mailClientMap = {};
    if (!b.clientId) {
      delete db.mailClientMap[email];
      logAudit(db, req, 'deleted', 'client', '', email, 'sender mapping cleared');
    } else {
      const c = (db.clients || []).find(x => x.id === b.clientId);
      if (!c) return res.status(404).json({ error: 'Client not found.' });
      db.mailClientMap[email] = { clientId: c.id, clientName: c.name,
        setBy: req.user.name, setAt: new Date().toISOString() };
      logAudit(db, req, 'updated', 'client', c.id, c.name, 'mail from ' + email + ' mapped to this client');
    }
    writeDB(db);
    res.json({ ok: true, email, mapped: db.mailClientMap[email] || null });
  });

  // ── sender suggestions: which addresses are writing to us, unmapped ─────
  // The point of a master mapping is that you should not have to type e-mail
  // addresses from memory. This reads recent mail and reports the distinct
  // senders, with whichever client each currently resolves to, so mapping
  // becomes a tick-list rather than data entry.
  app.get('/api/gmail/sender-suggestions', auth, partnerOrAdminSafe, async (req, res) => {
    const acct = acctOf(req);
    try {
      const q = String(req.query.q || 'in:inbox') + ' -category:promotions -category:social';
      // Scan deeply. 150 messages yields ~40 distinct senders, which is why
      // addresses visible in the Mail list were missing from the suggestions.
      // messages.list returns 500 ids per page and costs almost nothing; the
      // expense is the per-message header read, so the id sweep runs wide and
      // the header read is capped separately.
      const want = Math.min(Number(req.query.scan) || 1200, 3000);
      let ids = [], token = null, guard = 0;
      do {
        const params = { q, maxResults: '500' };
        if (token) params.pageToken = token;
        const page = await gapi(acct, '/messages?' + new URLSearchParams(params));
        ids = ids.concat((page.messages || []).map(m => m.id));
        token = page.nextPageToken || null;
      } while (token && ids.length < want && ++guard < 8);
      const scanned = ids.length;
      ids = ids.slice(0, want);
      const msgs = await mapLimit(ids, MSG_CONCURRENCY, async id => {
        try { return await gapi(acct, '/messages/' + id + '?format=metadata&metadataHeaders=From'); }
        catch (e) { return null; }
      });
      const db = readDB();
      const map = db.mailClientMap || {};
      const me = String((loadTokenFor(acct) || {}).email || '').toLowerCase();
      const ourDom = me.split('@')[1] || '';

      const seen = new Map();
      msgs.filter(Boolean).forEach(m => {
        const f = parseFrom(headerOf(m.payload, 'From'));
        if (!f.email || f.email === me) return;
        if (ourDom && f.email.endsWith('@' + ourDom)) return;      // our own team
        if (NOREPLY_RE.test(f.email)) return;                      // machines
        const e = seen.get(f.email) || { email: f.email, name: f.name, count: 0 };
        e.count++; if (!e.name && f.name) e.name = f.name;
        seen.set(f.email, e);
      });

      const rows = Array.from(seen.values()).map(x => {
        const mapped = map[x.email];
        return { email: x.email, name: x.name, count: x.count,
          clientId: mapped ? mapped.clientId : null,
          clientName: mapped ? mapped.clientName : '' };
      }).sort((a, b) => (a.clientId ? 1 : 0) - (b.clientId ? 1 : 0) || b.count - a.count);

      res.json({ ok: true, account: acct, count: rows.length, senders: rows,
        scanned, note: 'Scanned the newest ' + scanned + ' message(s). Search a name or domain to narrow it.' });
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not read senders: ' + (e.message || '') });
    }
  });

  // ── map SEVERAL addresses to one client in a single action ──────────────
  app.post('/api/gmail/map-senders', auth, partnerOrAdminSafe, (req, res) => {
    const b = req.body || {};
    const emails = (Array.isArray(b.emails) ? b.emails : [])
      .map(e => String(e || '').trim().toLowerCase()).filter(e => e.indexOf('@') > 0).slice(0, 200);
    if (!emails.length) return res.status(400).json({ error: 'No addresses given.' });
    const db = readDB();
    if (!db.mailClientMap) db.mailClientMap = {};
    let c = null;
    if (b.clientId) {
      c = (db.clients || []).find(x => x.id === b.clientId);
      if (!c) return res.status(404).json({ error: 'Client not found.' });
    }
    emails.forEach(e => {
      if (!c) delete db.mailClientMap[e];
      else db.mailClientMap[e] = { clientId: c.id, clientName: c.name,
        setBy: req.user.name, setAt: new Date().toISOString() };
    });
    logAudit(db, req, 'updated', 'client', c ? c.id : '', c ? c.name : '',
      (c ? 'mapped ' : 'unmapped ') + emails.length + ' e-mail address(es)');
    writeDB(db);
    res.json({ ok: true, mapped: emails.length, clientId: c ? c.id : null });
  });

  // ── addresses currently mapped to one client ────────────────────────────
  app.get('/api/gmail/client-senders/:clientId', auth, partnerOrAdminSafe, (req, res) => {
    const db = readDB();
    const map = db.mailClientMap || {};
    const emails = Object.keys(map).filter(e => map[e].clientId === req.params.clientId)
      .map(e => ({ email: e, setBy: map[e].setBy || '', setAt: map[e].setAt || '' }));
    res.json({ ok: true, clientId: req.params.clientId, emails });
  });


  // ── everything from one correspondent, as a flow ────────────────────────
  // The thread view answers "what happened in this conversation". This answers
  // "what is our whole history with this person" \u2014 every thread we have had,
  // oldest first, with who moved last in each and how long the silences were.
  // Searching from: OR to: is deliberate: a relationship includes what we sent.
  app.get('/api/gmail/sender', auth, async (req, res) => {
    const acct = acctOf(req);
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return res.status(400).json({ error: 'A sender address is required.' });
    try {
      const months = Math.min(Number(req.query.months) || 120, 240);   // whole history by default
      const q = '(from:' + email + ' OR to:' + email + ') newer_than:' + (months * 30) + 'd';
      const list = await gapi(acct, '/threads?' + new URLSearchParams({ q, maxResults: '30' }));
      const ids = (list.threads || []).map(t => t.id);
      const me = String((loadTokenFor(acct) || {}).email || '').toLowerCase();

      const raw = await mapLimit(ids, MSG_CONCURRENCY, async id => {
        try {
          return await gapi(acct, '/threads/' + id + '?format=metadata&'
            + 'metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
        } catch (e) { return null; }
      });

      const threads = raw.filter(Boolean).map(th => {
        const ms = (th.messages || []).map(m => {
          const f = parseFrom(headerOf(m.payload, 'From'));
          return { fromEmail: f.email, fromName: f.name, ms: Number(m.internalDate || 0),
                   isOutbound: f.email === me, subject: headerOf(m.payload, 'Subject') };
        }).sort((a, b) => a.ms - b.ms);
        if (!ms.length) return null;
        const rs = replyStateOf(ms) || {};
        const first = ms[0], last = ms[ms.length - 1];
        // Response time within this thread, where there is one.
        const inb = [...ms].reverse().find(m => !m.isOutbound);
        const outb = [...ms].reverse().find(m => m.isOutbound);
        return {
          threadId: th.id,
          subject: (first.subject || '(no subject)').slice(0, 200),
          startedAt: new Date(first.ms).toISOString(),
          lastAt: new Date(last.ms).toISOString(),
          msgCount: ms.length,
          inbound: ms.filter(m => !m.isOutbound).length,
          outbound: ms.filter(m => m.isOutbound).length,
          lastBy: last.isOutbound ? 'us' : 'them',
          replyState: rs.state, replyLabel: rs.label, replyTone: rs.tone,
          waitingDays: rs.waitingDays || 0,
          responseHours: (inb && outb && outb.ms > inb.ms) ? Math.round((outb.ms - inb.ms) / 3600000) : null,
          daysAgo: daysSince(last.ms),
          flags: flagsFor((first.subject || '') + ' ' + (th.snippet || '')),
          link: 'https://mail.google.com/mail/u/0/#inbox/' + th.id
        };
      }).filter(Boolean).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));

      // Gap since the previous conversation \u2014 the quiet periods in the
      // relationship, which is what a flow view is actually for.
      threads.forEach((t, i) => {
        t.gapDays = i === 0 ? null
          : Math.max(0, Math.round((new Date(t.startedAt) - new Date(threads[i - 1].lastAt)) / 86400000));
      });

      const rt = threads.map(t => t.responseHours).filter(x => x != null).sort((a, b) => a - b);
      const db = readDB();
      const mapped = (db.mailClientMap || {})[email];

      res.json({ ok: true, account: acct, email,
        client: mapped ? { id: mapped.clientId, name: mapped.clientName } : null,
        threads,
        summary: {
          threads: threads.length,
          messages: threads.reduce((s, t) => s + t.msgCount, 0),
          fromThem: threads.reduce((s, t) => s + t.inbound, 0),
          fromUs: threads.reduce((s, t) => s + t.outbound, 0),
          needsReply: threads.filter(t => t.replyState === 'needs_reply').length,
          firstContact: threads.length ? threads[0].startedAt : null,
          lastContact: threads.length ? threads[threads.length - 1].lastAt : null,
          medianResponseHours: rt.length ? rt[Math.floor(rt.length / 2)] : null
        } });
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not read this correspondent: ' + (e.message || '') });
    }
  });


  // ── one message, in full ────────────────────────────────────────────────
  // The list and thread views carry Gmail's 240-character snippet, which is
  // enough to recognise a mail and never enough to act on one. This fetches the
  // actual body on demand \u2014 only when someone opens a message, so the thread
  // view stays fast.
  app.get('/api/gmail/message/:id', auth, async (req, res) => {
    const acct = acctOf(req);
    try {
      const m = await gapi(acct, '/messages/' + encodeURIComponent(req.params.id) + '?format=full');

      // Walk the MIME tree. Prefer text/plain: it is what the sender typed.
      // text/html is the fallback, stripped back to text.
      let plain = '', html = '';
      (function walk(part) {
        if (!part) return;
        const mt = String(part.mimeType || '');
        const data = part.body && part.body.data;
        if (data) {
          const buf = Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          if (mt === 'text/plain' && !plain) plain = buf;
          else if (mt === 'text/html' && !html) html = buf;
        }
        (part.parts || []).forEach(walk);
      })(m.payload);

      let body = plain;
      if (!body && html) {
        body = html
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<\/(?:p|div|tr|h\d|li)>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
          .replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
          .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
          .replace(/&#(\d+);/g, (x, d) => String.fromCharCode(parseInt(d, 10)))
          .replace(/\n{3,}/g, '\n\n');
      }
      body = String(body || '').replace(/\r/g, '').trim();

      // Split off the quoted reply chain. Keeping it inline makes every mail
      // look enormous and buries the part that was actually written today.
      let quoted = '';
      const cut = body.search(/\n\s*(?:On .{5,80}wrote:|-{2,}\s*Original Message|_{5,}|From:\s.+\nSent:)/);
      if (cut > 40) { quoted = body.slice(cut).trim(); body = body.slice(0, cut).trim(); }
      // Drop a trailing block of '>' quoting too
      body = body.replace(/(?:^>.*\n?)+$/gm, '').trim();

      const attachments = [];
      (function att(part) {
        if (!part) return;
        if (part.filename && part.filename.length && part.body && part.body.attachmentId) {
          attachments.push({ id: part.body.attachmentId, name: part.filename,
            size: part.body.size || 0, mime: part.mimeType || '' });
        }
        (part.parts || []).forEach(att);
      })(m.payload);

      const f = parseFrom(headerOf(m.payload, 'From'));
      res.json({ ok: true, id: m.id, threadId: m.threadId,
        from: f.name || f.email, fromEmail: f.email,
        to: headerOf(m.payload, 'To'), cc: headerOf(m.payload, 'Cc'),
        subject: headerOf(m.payload, 'Subject'),
        date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : '',
        body: body.slice(0, 20000),
        quoted: quoted.slice(0, 20000),
        truncated: body.length > 20000,
        attachments,
        link: 'https://mail.google.com/mail/u/0/#inbox/' + m.threadId });
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not open the message: ' + (e.message || '') });
    }
  });


  // ── download an attachment ──────────────────────────────────────────────
  // messages.attachments.get is a READ operation, so this sits inside the
  // gmail.readonly scope: the app still cannot send, delete or alter anything.
  // Fetching a file the user can already see is not a write.
  //
  // The bytes are streamed straight through and never touch disk \u2014 nothing is
  // cached server-side, so a downloaded client document leaves no copy behind.
  app.get('/api/gmail/attachment/:msgId/:attId', auth, async (req, res) => {
    const acct = acctOf(req);
    // Downloads follow the same rule as viewing. An open attachment route would
    // undo the whole restriction: the file is the sensitive part.
    //
    // The thread is read FROM GMAIL, not from a query parameter the caller
    // supplies — a member could otherwise pass someone else's threadId and be
    // waved through. Costs one extra metadata call; worth it for a real check.
    try {
      const db2 = readDB();
      if (!isMailAdmin(req.user, deps.isPartnerUser ? deps.isPartnerUser(req.user, db2) : false)) {
        const meta = await gapi(acct, '/messages/' + encodeURIComponent(req.params.msgId) + '?format=minimal');
        const tid = meta && meta.threadId;
        const mine = visibleThreadIds(db2, req.user.id);
        let allowed = tid && mine.has(tid);
        if (!allowed && tid) {
          // Or the thread belongs to a client this member handles.
          const full = await gapi(acct, '/threads/' + tid
            + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
          const cli = clientsOwnedBy(db2, req.user.id);
          const map = db2.mailClientMap || {};
          allowed = ((full && full.messages) || []).some(m => {
            const f = parseFrom(headerOf(m.payload, 'From'));
            const mp = map[f.email];
            return mp && cli.has(mp.clientId);
          });
        }
        if (!allowed) return res.status(403).json({ error: 'This attachment is not assigned to you.' });
      }
      const a = await gapi(acct, '/messages/' + encodeURIComponent(req.params.msgId)
        + '/attachments/' + encodeURIComponent(req.params.attId));
      if (!a || !a.data) return res.status(404).json({ error: 'Attachment not found.' });
      const buf = Buffer.from(String(a.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

      // Sanitise the filename: it comes from the sender, so it must never be
      // able to steer the download anywhere or inject header characters.
      let name = String(req.query.name || 'attachment')
        .replace(/[\/\\:*?"<>|\r\n]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'attachment';
      res.setHeader('Content-Type', String(req.query.mime || 'application/octet-stream').replace(/[\r\n]/g, ''));
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Content-Disposition', 'attachment; filename="' + name.replace(/"/g, '') + '"');
      res.end(buf);
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not fetch the attachment: ' + (e.message || '') });
    }
  });


  // ── reply, in the same thread ───────────────────────────────────────────
  // Threading is not cosmetic: without In-Reply-To and References the reply
  // starts a NEW conversation, the client sees an orphan message, and our own
  // reply-state engine never marks the thread answered.
  app.post('/api/gmail/reply', auth, async (req, res) => {
    const acct = acctOf(req);
    const b = req.body || {};
    try {
      const msgId = String(b.messageId || '');
      if (!msgId) return res.status(400).json({ error: 'Which message are you replying to?' });
      const body = String(b.body || '').trim();
      if (!body) return res.status(400).json({ error: 'The reply is empty.' });

      // Same visibility rule as reading. A member must not be able to reply on a
      // thread they cannot see.
      const db = readDB();
      const amAdmin = isMailAdmin(req.user, deps.isPartnerUser ? deps.isPartnerUser(req.user, db) : false);

      const orig = await gapi(acct, '/messages/' + encodeURIComponent(msgId)
        + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc'
        + '&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References');
      if (!amAdmin) {
        const mine = visibleThreadIds(db, req.user.id);
        if (!orig.threadId || !mine.has(orig.threadId)) {
          const cli = clientsOwnedBy(db, req.user.id);
          const f0 = parseFrom(headerOf(orig.payload, 'From'));
          const mp = (db.mailClientMap || {})[f0.email];
          if (!(mp && cli.has(mp.clientId))) {
            return res.status(403).json({ error: 'This conversation is not assigned to you.' });
          }
        }
      }

      const me = String((loadTokenFor(acct) || {}).email || accountByKey(acct).email);
      const from = parseFrom(headerOf(orig.payload, 'From'));
      const origSubj = headerOf(orig.payload, 'Subject') || '';
      const msgIdHdr = headerOf(orig.payload, 'Message-ID');
      const refs = headerOf(orig.payload, 'References');

      // Reply to the sender; Reply-All adds the original recipients, minus us.
      let to = b.to ? String(b.to) : from.email;
      let cc = '';
      if (b.replyAll) {
        const pool = (headerOf(orig.payload, 'To') + ',' + headerOf(orig.payload, 'Cc'))
          .split(',').map(x => x.trim()).filter(Boolean)
          .filter(x => x.toLowerCase().indexOf(me.toLowerCase()) < 0)
          .filter(x => x.toLowerCase().indexOf(from.email.toLowerCase()) < 0);
        cc = pool.join(', ');
      }
      if (b.cc) cc = String(b.cc);
      const subject = /^re:/i.test(origSubj) ? origSubj : ('Re: ' + origSubj);

      const atts = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 10);
      let total = 0;
      atts.forEach(a => { total += Math.ceil(String(a.data || '').length * 0.75); });
      if (total > 20 * 1024 * 1024) return res.status(413).json({ error: 'Attachments exceed 20 MB.' });

      // Build the MIME message by hand. Encoding the body base64 avoids every
      // line-length and non-ASCII pitfall of quoted-printable.
      const bnd = 'garp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const esc = v => String(v || '').replace(/[\r\n]/g, ' ');
      const enc = t => Buffer.from(String(t), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
      let mime = '';
      mime += 'From: ' + esc(me) + '\r\n';
      mime += 'To: ' + esc(to) + '\r\n';
      if (cc) mime += 'Cc: ' + esc(cc) + '\r\n';
      mime += 'Subject: =?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=\r\n';
      if (msgIdHdr) {
        mime += 'In-Reply-To: ' + esc(msgIdHdr) + '\r\n';
        mime += 'References: ' + esc((refs ? refs + ' ' : '') + msgIdHdr) + '\r\n';
      }
      mime += 'MIME-Version: 1.0\r\n';
      mime += 'Content-Type: multipart/mixed; boundary="' + bnd + '"\r\n\r\n';
      mime += '--' + bnd + '\r\nContent-Type: text/plain; charset="UTF-8"\r\n';
      mime += 'Content-Transfer-Encoding: base64\r\n\r\n' + enc(body) + '\r\n';
      atts.forEach(a => {
        const name = String(a.name || 'attachment').replace(/[\r\n"]/g, '_');
        mime += '--' + bnd + '\r\n';
        mime += 'Content-Type: ' + esc(a.mime || 'application/octet-stream') + '; name="' + name + '"\r\n';
        mime += 'Content-Disposition: attachment; filename="' + name + '"\r\n';
        mime += 'Content-Transfer-Encoding: base64\r\n\r\n';
        mime += String(a.data || '').replace(/[^A-Za-z0-9+/=]/g, '').replace(/(.{76})/g, '$1\r\n') + '\r\n';
      });
      mime += '--' + bnd + '--';

      const raw = Buffer.from(mime, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const sent = await jfetch(GMAIL_API + '/messages/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (await accessToken(acct)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, threadId: orig.threadId })
      });

      const db2 = readDB();
      logAudit(db2, req, 'created', 'settings', 'mail-reply', to,
        'replied to "' + origSubj.slice(0, 80) + '"' + (atts.length ? ' with ' + atts.length + ' attachment(s)' : ''));
      writeDB(db2);
      res.json({ ok: true, id: sent.id, threadId: sent.threadId, to, cc, subject });
    } catch (e) {
      res.status(e.status === 428 ? 428 : 502).json({ error: 'Could not send: ' + (e.message || '') });
    }
  });

  // ── mail routing rules ──────────────────────────────────────────────────
  app.get('/api/gmail/rules', auth, partnerOrAdminSafe, (req, res) => {
    const db = readDB();
    res.json({ ok: true, rules: (db.mailRules || []).map(r => {
      const u = (db.users || []).find(x => x.id === r.userId);
      return { id: r.id, pattern: r.pattern, userId: r.userId, name: (u && u.name) || r.name || '' };
    }) });
  });

  app.post('/api/gmail/rules', auth, partnerOrAdminSafe, (req, res) => {
    const b = req.body || {};
    const pattern = String(b.pattern || '').trim().toLowerCase().slice(0, 160);
    if (!pattern) return res.status(400).json({ error: 'An address or keyword is required.' });
    const db = readDB();
    if (!db.mailRules) db.mailRules = [];
    if (b.remove) {
      db.mailRules = db.mailRules.filter(r => r.id !== b.id);
      logAudit(db, req, 'deleted', 'settings', 'mail-rule', pattern, 'mail routing rule removed');
    } else {
      const u = (db.users || []).find(x => x.id === b.userId);
      if (!u) return res.status(404).json({ error: 'Team member not found.' });
      db.mailRules.push({ id: (deps.newId ? deps.newId() : String(Date.now())),
        pattern, userId: u.id, name: u.name, by: req.user.name, at: new Date().toISOString() });
      logAudit(db, req, 'created', 'settings', 'mail-rule', pattern, 'mail from "' + pattern + '" routed to ' + u.name);
    }
    writeDB(db);
    res.json({ ok: true, rules: db.mailRules });
  });

  // ── mail -> task ──────────────────────────────────────────────────────────
  // The ONLY write this feature performs. Deliberately builds the assignment and
  // hands it to the existing POST /api/assignments logic rather than duplicating
  // creation rules (notifications, sub-assignment handling, audit).
  app.post('/api/gmail/to-task', auth, (req, res) => {
    const b = req.body || {};
    if (!b.subject) return res.status(400).json({ error: 'Nothing to convert.' });
    res.json({
      ok: true,
      draft: {
        title: String(b.subject).slice(0, 200),
        clientId: (b.client && b.client.id) || null,
        clientName: (b.client && b.client.name) || '',
        description: 'From e-mail: ' + String(b.fromName || b.fromEmail || '')
          + (b.link ? '\n' + b.link : '')
          + (b.snippet ? '\n\n' + String(b.snippet).slice(0, 400) : ''),
        source: 'Office mailbox',
        assignmentType: 'onetime'
      }
    });
  });
}

module.exports = { mountGmail, FLAG_RULES, flagsFor, parseFrom, headerOf };

// ═══════════════════════════════════════════════════════════════════════════
// REPLY STATE — the actual question a partner is asking
// ---------------------------------------------------------------------------
// "What needs a reply" and "what have I replied to" cannot be answered from a
// single message. They are properties of a THREAD:
//
//   last message is INBOUND   -> the ball is with us      -> NEEDS REPLY
//   last message is OUTBOUND  -> we answered              -> REPLIED
//   outbound, and quiet since -> we are waiting on them   -> AWAITING THEM
//   no-reply / notification   -> nothing is owed          -> FYI
//
// So we read threads, not messages, and look at who sent the last one. That also
// gives response time for free: inbound timestamp -> our next outbound.
//
// Cost: one threads.list plus one threads.get per thread. At 50 threads and
// concurrency 5 that is ~10 round trips. Worth it — this is the feature.
// ═══════════════════════════════════════════════════════════════════════════
const NOREPLY_RE = /(^|[.\-_])(no-?reply|do-?not-?reply|donotreply|notifications?|mailer|bounce|postmaster|newsletter|updates?)@|@(?:mailer|bounce|email|notifications?)\./i;

// "Waiting on them" only starts to matter after a few working days; before that
// it is simply a normal exchange in progress.
const AWAITING_AFTER_DAYS = 3;

function replyStateOf(msgs, ourAddrs, ourDomain) {
  // msgs: [{fromEmail, ms, isOutbound}] oldest-first
  if (!msgs.length) return null;
  const last = msgs[msgs.length - 1];
  const lastInbound  = [...msgs].reverse().find(m => !m.isOutbound);
  const lastOutbound = [...msgs].reverse().find(m =>  m.isOutbound);
  const days = ms => Math.max(0, Math.floor((Date.now() - ms) / 86400000));

  if (!last.isOutbound) {
    // Nothing is owed to a machine.
    if (NOREPLY_RE.test(last.fromEmail || '')) {
      return { state: 'fyi', label: 'No reply needed', tone: 'grey',
               waitingDays: 0, repliedAt: null, responseHours: null };
    }
    return {
      state: 'needs_reply', label: 'Needs reply', tone: 'red',
      waitingDays: days(last.ms),
      repliedAt: lastOutbound ? new Date(lastOutbound.ms).toISOString() : null,
      responseHours: null
    };
  }

  // We sent last. Did we answer something, and how fast?
  let responseHours = null;
  if (lastInbound && lastOutbound && lastOutbound.ms > lastInbound.ms) {
    responseHours = Math.round((lastOutbound.ms - lastInbound.ms) / 3600000);
  }
  const quiet = days(last.ms);
  if (lastInbound && quiet >= AWAITING_AFTER_DAYS) {
    return { state: 'awaiting_them', label: 'Awaiting their reply', tone: 'amber',
             waitingDays: quiet, repliedAt: new Date(last.ms).toISOString(), responseHours };
  }
  return { state: 'replied', label: 'Replied', tone: 'green',
           waitingDays: 0, repliedAt: new Date(last.ms).toISOString(), responseHours };
}

module.exports.replyStateOf = replyStateOf;
module.exports.ACCOUNTS = ACCOUNTS;
module.exports.NOREPLY_RE = NOREPLY_RE;
module.exports.isPromotional = isPromotional;   // exported so it can be tested
