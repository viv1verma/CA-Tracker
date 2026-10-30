const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
let webpush = null;
try {
  webpush = require('web-push');
  const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BAM7b-PNpQNQb-bsk-2W7DYzdyposuocVJ1yNBcQSJxXgY3wq9dBXGAITz0MDZ98u8NpWt9MLj8HPzfyI07cFbQ';
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'vyuXrJC0RnjlsNPbvKHA_wf9uMs0MiYKJIQHR2H-znU';
  webpush.setVapidDetails('mailto:admin@garp.in', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('✅ Web Push enabled');
} catch(e) { console.log('web-push not available'); }

// ════════════════ SECURE NOTIFICATIONS (email + WhatsApp) ════════════════
// All credentials come from environment variables only — never stored in code,
// the JSON DB, or sent to the browser. Transport is TLS. Message text never
// includes sensitive financial figures.
const https = require('https');
let _mailer = null, _mailReady = false, _mailInfo = { configured: false, user: '', verified: false, error: '' };
(function initMailer() {
  // Gmail / Google Workspace via App Password
  const user = process.env.SMTP_USER;            // e.g. office@garp.co.in
  const pass = process.env.SMTP_PASS;            // 16-char Google App Password
  if (!user || !pass) { console.log('✉️  Email disabled (set SMTP_USER / SMTP_PASS).'); return; }
  _mailInfo.configured = true; _mailInfo.user = user;
  try {
    const nodemailer = require('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '465');
    _mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,                       // 465 = SSL; 587/25 = STARTTLS (secure:false)
      auth: { user, pass }
    });
    _mailReady = true;
    console.log('✅ Email configured (' + user + ') — verifying…');
    // Verify the SMTP connection/credentials so logs reveal auth problems
    _mailer.verify()
      .then(() => { _mailInfo.verified = true; console.log('✅ Email verified — ready to send from ' + user); })
      .catch(e => { _mailInfo.error = e.message; console.log('⚠️  Email verify FAILED:', e.message); });
  } catch (e) { _mailInfo.error = e.message; console.log('✉️  Email init failed:', e.message); }
})();

function sendEmail(to, subject, text, html) {
  if (!_mailReady || !to) return Promise.resolve({ ok: false, skipped: true, reason: !_mailReady ? 'not configured' : 'no recipient' });
  const from = process.env.MAIL_FROM || ('GARP & Associates <' + process.env.SMTP_USER + '>');
  const msg = { from, to, subject, text };
  if (html) msg.html = html;
  return _mailer.sendMail(msg)
    .then(() => ({ ok: true }))
    .catch(e => { console.log('email send failed:', e.message); return { ok: false, error: e.message }; });
}

// WhatsApp via Meta WhatsApp Cloud API (or compatible BSP). Uses approved templates.
function sendWhatsApp(toMobile, templateName, params) {
  const tokenWA = process.env.WA_TOKEN;             // permanent/system token
  const phoneId = process.env.WA_PHONE_ID;          // sender phone number ID
  const apiVer  = process.env.WA_API_VERSION || 'v20.0';
  if (!tokenWA || !phoneId || !toMobile) return Promise.resolve({ ok: false, skipped: true });
  // Normalise Indian mobile to E.164 (default +91) without storing it anywhere new
  let num = String(toMobile).replace(/[^0-9]/g, '');
  if (num.length === 10) num = '91' + num;
  const lang = process.env.WA_TEMPLATE_LANG || 'en';
  const payload = JSON.stringify({
    messaging_product: 'whatsapp', to: num, type: 'template',
    template: {
      name: templateName, language: { code: lang },
      components: params && params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : undefined
    }
  });
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'graph.facebook.com', path: `/${apiVer}/${phoneId}/messages`, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tokenWA, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve({ ok: r.statusCode < 300, status: r.statusCode })); });
    req.on('error', e => { console.log('whatsapp send failed:', e.message); resolve({ ok: false, error: e.message }); });
    req.write(payload); req.end();
  });
}

// Fire both channels for an ITR stage change. No financial figures in the text.
function notifyItrStage(party) {
  if (!party) return;
  const name = party.name || 'Taxpayer';
  const stage = party.stage || '';
  const ay = party.ay || '';
  const subject = `ITR ${ay} — status updated: ${stage}`;
  const body = `Dear ${name},\n\nThe status of your Income-tax return${ay ? ' for AY ' + ay : ''} has been updated to: ${stage}.\n\nYou can view details and message us anytime by logging in to your GARP ITR portal.\n\nRegards,\nGARP & Associates\nwww.garp.co.in`;
  if (party.email) sendEmail(party.email, subject, body);
  // WhatsApp template expects params; configure a template named by WA_TEMPLATE_STAGE (default itr_status_update)
  if (party.mobile) sendWhatsApp(party.mobile, process.env.WA_TEMPLATE_STAGE || 'itr_status_update', [name, ay || '-', stage]);
}
function notifConfigStatus() {
  return {
    email: _mailReady,
    whatsapp: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID)
  };
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'GARP-ASSOCIATES-2024-SECRET';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json({ limit: '15mb' }));
// Prevent stale HTML: always revalidate the app shell so deploys take effect immediately
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});
// ── Digital Asset Links (Android TWA / Play Store) ───────────────────────────
// A Trusted Web Activity only drops the browser URL bar if this file verifies the
// app against this domain. Set ANDROID_PACKAGE and ANDROID_SHA256 in Railway with
// the values from your signing key (Play Console > Setup > App signing).
app.get('/.well-known/assetlinks.json', (req, res) => {
  const pkg = process.env.ANDROID_PACKAGE || '';
  const fp = (process.env.ANDROID_SHA256 || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!pkg || !fp.length) {
    return res.status(404).json({ error: 'Android app not configured. Set ANDROID_PACKAGE and ANDROID_SHA256.' });
  }
  res.type('application/json').json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fp }
  }]);
});

// Anything inside public/ is served to the whole internet. If source or config is
// ever dropped in there by mistake, it would be downloadable (e.g. /server.js would
// hand out the backend, JWT secret included). Refuse these outright — belt and braces.
const BLOCKED_PUBLIC = /^\/(?:server\.js|package(?:-lock)?\.json|Dockerfile|railway\.json|\.env.*|\.git.*|data(?:\/.*)?)$/i;
app.use((req, res, next) => {
  if (BLOCKED_PUBLIC.test(req.path)) {
    console.warn('Blocked attempt to fetch a protected path from public/:', req.path);
    return res.status(404).send('Not found');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users:[], clients:[], assignments:[], notifications:[], dueDateRequests:[], recurringTemplates:[], reopenRequests:[], pushSubscriptions:[], attendance:[], leaves:[], salaryConfig:[], siteVisits:[] }; }
}
function writeDB(db) {
  invalidateRules();   // any write may change the rules (incl. a full restore) — never serve a stale copy
  if (!db.notifications) db.notifications = [];
  if (!db.dueDateRequests) db.dueDateRequests = [];
  if (!db.recurringTemplates) db.recurringTemplates = [];
  if (!db.reopenRequests) db.reopenRequests = [];
  if (!db.pushSubscriptions) db.pushSubscriptions = [];
  if (!db.attendance) db.attendance = [];
  if (!db.leaves) db.leaves = [];
  if (!db.salaryConfig) db.salaryConfig = [];
  if (!db.siteVisits) db.siteVisits = [];
  if (!db.dueDateChangeLog) db.dueDateChangeLog = [];
  if (!db.staleRemarkLog) db.staleRemarkLog = [];
  if (!db.invoices) db.invoices = [];
  fs.writeFileSync(DB_FILE, JSON.stringify(db));
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
// Records a due-date change for the audit report
function logDueDateChange(db, assignment, oldDate, newDate, user, via) {
  if (!db.dueDateChangeLog) db.dueDateChangeLog = [];
  if (oldDate === newDate) return;
  const cl = db.clients.find(c => c.id === assignment.clientId);
  db.dueDateChangeLog.push({
    id: newId(),
    assignmentId: assignment.id,
    clientName: cl ? cl.name : '—',
    workType: assignment.workType || '—',
    memberName: assignment.memberName || '—',
    oldDueDate: oldDate || null,
    newDueDate: newDate || null,
    changedById: user.id,
    changedByName: user.name,
    changedByQual: user.qualification || '',
    via: via || 'edit',
    date: new Date().toISOString()
  });
}

// ── Server-side idle session expiry ──────────────────────────────────────────
// The JWT already carries an absolute 12h expiry. This adds an IDLE expiry so a
// token stops working once the user actually stops using the app. Last-seen is
// held in memory (single process); after a restart a token is simply treated as
// freshly seen rather than rejected.
const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes, matching the client-side auto-logout
const _lastSeen = new Map();
// Drop stale entries every 10 min so the map can't grow without bound
setInterval(() => {
  const cutoff = Date.now() - IDLE_LIMIT_MS;
  for (const [k, v] of _lastSeen) if (v < cutoff) _lastSeen.delete(k);
}, 10 * 60 * 1000).unref?.();

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized.' });
  let payload;
  try { payload = jwt.verify(h.slice(7), JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
  // Idle check. Background polling sends X-Background:1 and must NOT keep a session alive.
  const _tok = h.slice(7);
  const _now = Date.now();
  const _seen = _lastSeen.get(_tok);
  if (_seen !== undefined && (_now - _seen) > IDLE_LIMIT_MS) {
    _lastSeen.delete(_tok);
    return res.status(401).json({ error: 'SESSION_IDLE', message: 'Session expired after 5 minutes of inactivity. Please log in again.' });
  }
  if (req.headers['x-background'] !== '1') _lastSeen.set(_tok, _now);
  else if (_seen === undefined) _lastSeen.set(_tok, _now); // first sight after a restart
  // Single-session enforcement for team/admin accounts
  if (payload.sess != null) {
    const db = readDB();
    const u = (db.users || []).find(x => x.id === payload.id);
    if (u && (u.sess || 0) !== payload.sess) {
      return res.status(401).json({ error: 'SESSION_SUPERSEDED', message: 'You have been logged out because this account was opened on another device.' });
    }
  }
  req.user = payload;
  next();
}
// Admin-only by default. A non-admin gets through ONLY if the Delegation of Authority
// screen has explicitly granted the capability this route belongs to. Routes with no
// mapped capability stay strictly admin-only, so nothing is opened up by accident.
function adminOnly(req, res, next) {
  if (req.user.role === 'admin') return next();
  const cap = capForPath(req.path);
  if (cap && cap !== 'delegation.manage' && can(readDB(), req.user, cap)) return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

// ═══════════════════════════════════════════════════════════
// AUDIT TRAIL — who changed what, when
// ═══════════════════════════════════════════════════════════
const AUDIT_MAX = 5000; // keep the most recent N entries so the DB file stays bounded
function reqIp(req) {
  return ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || '';
}
// Records an audit entry on `db`. Caller is responsible for writeDB().
function logAudit(db, req, action, entity, entityId, label, details) {
  if (!db.auditLog) db.auditLog = [];
  db.auditLog.push({
    id: newId(),
    at: new Date().toISOString(),
    actorId: (req && req.user && req.user.id) || 'system',
    actorName: (req && req.user && req.user.name) || 'System',
    actorRole: (req && req.user && req.user.role) || 'system',
    action: action,               // created | updated | deleted | approved | rejected | restored ...
    entity: entity,               // user | client | attendance | leave | comp-off | holiday | settings | data
    entityId: entityId || '',
    label: label || '',           // human-readable subject, e.g. the person's name
    details: details || '',       // what changed
    ip: reqIp(req)
  });
  if (db.auditLog.length > AUDIT_MAX) db.auditLog = db.auditLog.slice(-AUDIT_MAX);
}
// Builds a readable "field: old → new" summary for changed fields only
function diffFields(before, after, fields) {
  const out = [];
  fields.forEach(f => {
    const a = before ? before[f] : undefined, b = after ? after[f] : undefined;
    const norm = v => (v === undefined || v === null) ? '' : String(v);
    if (norm(a) !== norm(b)) out.push(`${f}: ${norm(a) || '—'} → ${norm(b) || '—'}`);
  });
  return out.join('; ');
}

// Admin-only audit trail viewer
app.get('/api/audit-log', auth, adminOnly, (req, res) => {
  const db = readDB();
  let list = (db.auditLog || []).slice();
  const { entity, actorId, from, to, q } = req.query;
  if (entity && entity !== 'all') list = list.filter(e => e.entity === entity);
  if (actorId && actorId !== 'all') list = list.filter(e => e.actorId === actorId);
  if (from) list = list.filter(e => e.at >= from);
  if (to) list = list.filter(e => e.at <= (to + 'T23:59:59.999Z'));
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(e => `${e.actorName} ${e.label} ${e.details} ${e.action} ${e.entity}`.toLowerCase().includes(s));
  }
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const total = list.length;
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 200));
  res.json({
    total,
    entries: list.slice(0, limit),
    entities: ['user', 'client', 'attendance', 'leave', 'comp-off', 'holiday', 'settings', 'data'],
    actors: [...new Map((db.auditLog || []).map(e => [e.actorId, { id: e.actorId, name: e.actorName }])).values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  });
});
// ITR-admin: full admin OR a team user flagged itrAdmin (e.g. Annpurna)
function itrAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  const u = (db.users || []).find(x => x.id === req.user.id);
  if (u && (u.itrAdmin || (u.name || '').trim().toLowerCase() === 'annpurna')) return next();
  return res.status(403).json({ error: 'ITR admin access required.' });
}
function isItrAdminUser(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.itrAdmin || (u.name || '').trim().toLowerCase() === 'annpurna'));
}
// Manage clients & team members: full admin OR an itrAdmin (e.g. Annpurna)
function adminOrItr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isItrAdminUser(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Admin or ITR-admin access required.' });
}
// Any internal staff member (excludes external client / itr-client logins)
function staffOnly(req, res, next) {
  if (req.user.role === 'client' || req.user.role === 'itrclient')
    return res.status(403).json({ error: 'Not allowed for client accounts.' });
  return next();
}
// ═══════════════════════════════════════════════════════════
// DELEGATION OF AUTHORITY
// One place that answers "who is allowed to do what". Admins always hold every
// capability and can never be locked out — only they can edit this.
// ═══════════════════════════════════════════════════════════
const CAPABILITIES = [
  // key,                group,        label,                             description
  ['team.manage',        'People',     'Manage team members',             'Add, edit and deactivate staff records'],
  ['salary.view',        'People',     'View salary & CTC',               'See salary structure and payslips of all staff'],
  ['payroll.run',        'People',     'Run payroll',                     'Generate and finalise monthly payroll'],
  ['attendance.manage',  'People',     'Manage attendance',               'Edit or regularise attendance for other staff'],
  ['leave.approve',      'People',     'Approve leave',                   'Approve or reject leave requests'],
  ['clients.manage',     'Work',       'Manage clients',                  'Add, edit and archive client records'],
  ['tasks.manageAll',    'Work',       'Manage all tasks',                'Assign, reassign and close any task in the firm'],
  ['recurring.manage',   'Work',       'Manage recurring tasks',          'Create and edit recurring task templates'],
  ['itr.manage',         'Work',       'Manage ITR filing',               'Full access to the ITR filing tracker'],
  ['bd.manage',          'Business',   'Business Development',            'View and edit tenders and business development'],
  ['firmprofile.manage', 'Business',   'Firm Profile & experience',       'Edit firm credentials and the audit experience registry'],
  ['reports.view',       'Oversight',  'Reports & audit trail',           'View firm-wide reports and the activity log'],
  ['rules.manage',       'Oversight',  'Office rules & settings',         'Edit office rules, holidays and office settings'],
  ['backup.manage',      'Oversight',  'Backup & restore',                'Download backups and restore the database'],
  ['delegation.manage',  'Oversight',  'Delegation of Authority',         'Change who can do what (admins only)']
];
const CAP_KEYS = CAPABILITIES.map(c => c[0]);

function getDelegation(db) {
  const d = db.delegation || {};
  const grants = {};
  CAP_KEYS.forEach(k => { grants[k] = Array.isArray(d.grants && d.grants[k]) ? d.grants[k].slice() : []; });
  // Legacy per-user flags are the source of truth until an admin saves this screen,
  // so existing access (incl. Meenu Jha's HR rights) survives the upgrade unchanged.
  if (!d.migrated) {
    (db.users || []).forEach(u => {
      const legacyHr = u.hrAdmin || (u.name || '').trim().toLowerCase() === 'meenu jha';
      const legacyPay = u.payrollAccess || legacyHr;
      if (legacyHr) ['team.manage', 'attendance.manage', 'salary.view'].forEach(k => { if (!grants[k].includes(u.id)) grants[k].push(u.id); });
      if (legacyPay) ['salary.view', 'payroll.run'].forEach(k => { if (!grants[k].includes(u.id)) grants[k].push(u.id); });
      if (u.itrAdmin) { if (!grants['itr.manage'].includes(u.id)) grants['itr.manage'].push(u.id); }
    });
  }
  return { grants, limits: Array.isArray(d.limits) ? d.limits : [], migrated: !!d.migrated, updatedAt: d.updatedAt || '', updatedBy: d.updatedBy || '' };
}
// The single access question. Admins hold everything, always.
function can(db, user, cap) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const g = getDelegation(db).grants[cap];
  return !!(g && g.includes(user.id));
}
// Partners keep implicit Business Development rights (that was the standing instruction),
// on top of anything explicitly delegated to them.
function isPartnerUser(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.designation || '').toLowerCase().includes('partner'));
}
// Which capability does an admin-only route belong to? Anything unmapped stays
// admin-only, so an unrecognised route can never be opened up by accident.
const ROUTE_CAPS = [
  [/^\/api\/delegation/,                      'delegation.manage'],
  [/^\/api\/(backup|restore)/,                'backup.manage'],
  [/^\/api\/(rules|office-settings|holidays)/, 'rules.manage'],
  [/^\/api\/(reports|audit)/,                 'reports.view'],
  [/^\/api\/firm-profile/,                    'firmprofile.manage'],
  [/^\/api\/(tenders|bd)/,                    'bd.manage'],
  [/^\/api\/itr/,                             'itr.manage'],
  [/^\/api\/recurring-templates/,             'recurring.manage'],
  [/^\/api\/clients/,                         'clients.manage'],
  [/^\/api\/(salary|payslip)/,                'salary.view'],
  [/^\/api\/payroll/,                         'payroll.run'],
  [/^\/api\/attendance/,                      'attendance.manage'],
  [/^\/api\/(leaves?|leave-requests)/,        'leave.approve'],
  [/^\/api\/users/,                           'team.manage']
];
function capForPath(p) {
  const hit = ROUTE_CAPS.find(([re]) => re.test(p));
  return hit ? hit[1] : null;
}

// Payroll access: full admin OR a team user flagged payrollAccess / hrAdmin (e.g. Meenu Jha)
function isPayrollUser(db, userId, role) {
  if (role === 'admin') return true;
  if (can(db, { id: userId, role }, 'payroll.run') || can(db, { id: userId, role }, 'salary.view')) return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.payrollAccess || u.hrAdmin || (u.name || '').trim().toLowerCase() === 'meenu jha'));
}
function payrollAccess(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isPayrollUser(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Payroll access required.' });
}
// HR admin: full admin OR a team user flagged hrAdmin (e.g. Meenu Jha).
// Grants admin-equivalent rights over Team Members, Salary and Attendance.
function isHrAdmin(db, userId, role) {
  if (role === 'admin') return true;
  if (can(db, { id: userId, role }, 'team.manage')) return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.hrAdmin || (u.name || '').trim().toLowerCase() === 'meenu jha'));
}
function adminOrHr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isHrAdmin(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Team / Salary / Attendance admin access required.' });
}
// User management (add/edit/delete team members): admin, ITR-admin, or HR-admin
function adminItrOrHr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isItrAdminUser(db, req.user.id, req.user.role) || isHrAdmin(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Not allowed.' });
}
// Business Development: admins and partners by standing rule, plus anyone the
// Delegation of Authority screen has explicitly granted.
function partnerOrAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isPartnerUser(db, req.user.id, req.user.role)) return next();
  const cap = capForPath(req.path) || 'bd.manage';
  if (can(db, req.user, cap)) return next();
  return res.status(403).json({ error: 'Business Development access is limited to partners and admins.' });
}
// Resolve which client IDs a client/group request may access.
// Returns { ids:[...], single:<id|null> }. For a group with ?company=ID -> that one;
// ?company=all or none -> all member companies. For a normal client -> just their own.
function clientScope(req, db) {
  if (req.user.isGroup) {
    const members = (db.clients || []).filter(c => c.groupId === req.user.groupId).map(c => c.id);
    const sel = req.query.company;
    if (sel && sel !== 'all' && members.includes(sel)) return { ids: [sel], single: sel };
    return { ids: members, single: null }; // combined
  }
  return { ids: [req.user.clientId], single: req.user.clientId };
}

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const db = readDB();
  const uname = username.trim().toLowerCase();
  const user = db.users.find(u => u.username === uname);
  if (user) {
    const _h = user.passwordHash || user.password || '';
    if (!_h || !await bcrypt.compare(password, _h))
      return res.status(401).json({ error: 'Invalid credentials.' });
    if (!user.passwordHash && user.password) {
      const _i = db.users.findIndex(u => u.id === user.id);
      if (_i > -1) { db.users[_i].passwordHash = user.password; delete db.users[_i].password; writeDB(db); }
    }
    // Single active session per account: bump session counter so older tokens become invalid
    const _ui = db.users.findIndex(u => u.id === user.id);
    const newSess = ((db.users[_ui] && db.users[_ui].sess) || 0) + 1;
    if (_ui > -1) { db.users[_ui].sess = newSess; writeDB(db); }
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)', sess: newSess },
      JWT_SECRET, { expiresIn: '12h' }
    );
    return res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)' } });
  }
  // Client login — match stored credentials, OR fall back to PAN for clients
  // created before logins existed (username = PAN, password = PAN).
  const client = (db.clients || []).find(c => {
    const pan = (c.pan || '').trim().toLowerCase();
    return c.clientUsername === uname || (pan && pan === uname);
  });
  if (client) {
    const pan = (client.pan || '').trim();
    let valid = false;
    if (client.passwordHash) {
      valid = await bcrypt.compare(password, client.passwordHash);
    }
    // PAN fallback: accept the PAN as password (case-insensitive) if it matches
    if (!valid && pan && password.trim().toLowerCase() === pan.toLowerCase()) {
      valid = true;
    }
    if (valid) {
      const tokenUser = client.clientUsername || (client.pan||'').trim().toLowerCase();
      const token = jwt.sign(
        { id: client.id, username: tokenUser, name: client.name, role: 'client', clientId: client.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: client.id, username: tokenUser, name: client.name, role: 'client', clientId: client.id } });
    }
  }
  // ITR client login — username = PAN (uppercase), password = PAN@1010
  const itr = (db.itrParties || []).find(p => (p.pan || '').trim().toUpperCase() === username.trim().toUpperCase());
  if (itr) {
    const expected = (itr.pan || '').trim().toUpperCase() + '@1010';
    if (password.trim() === expected) {
      const token = jwt.sign(
        { id: itr.id, username: itr.pan.toUpperCase(), name: itr.name, role: 'itrclient', itrId: itr.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: itr.id, username: itr.pan.toUpperCase(), name: itr.name, role: 'itrclient', itrId: itr.id } });
    }
  }
  // Group login — one credential for a group of companies
  const group = (db.groups || []).find(g => (g.groupUsername || '').toLowerCase() === uname);
  if (group && group.passwordHash) {
    const ok = await bcrypt.compare(password, group.passwordHash);
    if (ok) {
      const token = jwt.sign(
        { id: group.id, username: group.groupUsername, name: group.name, role: 'client', isGroup: true, groupId: group.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: group.id, username: group.groupUsername, name: group.name, role: 'client', isGroup: true, groupId: group.id } });
    }
  }
  return res.status(401).json({ error: 'Invalid credentials.' });
});
app.get('/api/me', auth, (req, res) => {
  const db = readDB();
  if (req.user.role === 'itrclient') {
    const p = (db.itrParties || []).find(x => x.id === req.user.id);
    if (!p) return res.status(404).json({ error: 'Not found.' });
    return res.json({ id: p.id, username: (p.pan||'').toUpperCase(), name: p.name, role: 'itrclient', itrId: p.id, pan: p.pan, ay: p.ay, type: p.type });
  }
  if (req.user.role === 'client') {
    // Group login: return member companies + combined option
    if (req.user.isGroup) {
      const g = (db.groups || []).find(x => x.id === req.user.groupId);
      if (!g) return res.status(404).json({ error: 'Group not found.' });
      const companies = (db.clients || []).filter(c => c.groupId === g.id)
        .map(c => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const dash = g.dashboards || { tasks: true, billing: true, cashflow: true, debtors: true };
      return res.json({ id: g.id, username: g.groupUsername, name: g.name, role: 'client', isGroup: true, groupId: g.id, companies, dashboards: dash });
    }
    const c = (db.clients || []).find(x => x.id === req.user.id);
    if (!c) return res.status(404).json({ error: 'Client not found.' });
    const dash = c.dashboards || { tasks: true, billing: true, cashflow: true, debtors: true };
    return res.json({ id: c.id, username: c.clientUsername, name: c.name, role: 'client', clientId: c.id, email: c.email || c.contactEmail || '', contact: c.contact || '', dashboards: dash });
  }
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const isItrAdmin = !!(user.itrAdmin || (user.name || '').trim().toLowerCase() === 'annpurna');
  const isHr = !!(user.hrAdmin || (user.name || '').trim().toLowerCase() === 'meenu jha');
  const isPayroll = !!(user.payrollAccess || isHr);
  // What this person is actually allowed to do — the UI hides what they can't use.
  const caps = {};
  CAP_KEYS.forEach(k => { caps[k] = can(db, { id: user.id, role: user.role }, k); });
  if (isPartnerUser(db, user.id, user.role)) { caps['bd.manage'] = true; caps['firmprofile.manage'] = true; }
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)', itrAdmin: isItrAdmin, payrollAccess: isPayroll, hrAdmin: isHr, caps });
});

// Users
app.get('/api/users', auth, (req, res) => {
  const db = readDB();
  res.json(db.users.map(u => { const { passwordHash, password, ...safe } = u; return safe; }));
});
app.post('/api/users', auth, staffOnly, async (req, res) => {
  const { name, username, password, role, designation, qualification, branch, joiningDate, dob, anniversary, openingLeave, basicSalary, hra, conveyance, otherAllowance, email, mobile, payrollAccess: pAccess, itrAdmin: iAdmin } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const db = readDB();
  if (db.users.find(u => u.username === username.toLowerCase()))
    return res.status(400).json({ error: 'Username already exists.' });
  const user = {
    id: newId(), name: name.trim(), username: username.toLowerCase().trim(),
    role: (role === 'admin' && req.user.role !== 'admin') ? 'member' : (role || 'member'), designation: designation || '',
    qualification: qualification || 'CA', branch: branch || 'Greater Noida (HO)',
    email: email || '', mobile: mobile || '',
    payrollAccess: req.user.role === 'admin' ? !!pAccess : false,
    itrAdmin: req.user.role === 'admin' ? !!iAdmin : false,
    joiningDate: joiningDate || null, dob: dob || null, anniversary: anniversary || null,
    openingLeave: parseFloat(openingLeave) || 0,
    basicSalary: parseFloat(basicSalary) || 0, hra: parseFloat(hra) || 0,
    conveyance: parseFloat(conveyance) || 0, otherAllowance: parseFloat(otherAllowance) || 0,
    passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString()
  };
  db.users.push(user);
  logAudit(db, req, 'created', 'user', user.id, user.name,
    `role: ${user.role}; designation: ${user.designation || '—'}; branch: ${user.branch || '—'}`);
  writeDB(db);
  const { passwordHash, ...safe } = user;
  res.json(safe);
});
app.put('/api/users/:id', auth, async (req, res) => {
  const db = readDB();
  // HR admins (and admins) can manage any team member; everyone else only themselves
  const canManage = req.user.role === 'admin' || isHrAdmin(db, req.user.id, req.user.role);
  if (!canManage && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden.' });
  const i = db.users.findIndex(u => u.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'User not found.' });
  const _before = { ...db.users[i] }; // snapshot for the audit trail
  const { name, username, password, role, designation, qualification, branch, joiningDate, dob, anniversary, openingLeave, basicSalary, hra, conveyance, otherAllowance } = req.body;
  if (name) db.users[i].name = name.trim();
  if (designation !== undefined && canManage) db.users[i].designation = designation;
  if (qualification !== undefined && canManage) db.users[i].qualification = qualification;
  if (joiningDate !== undefined && canManage) db.users[i].joiningDate = joiningDate;
  if (dob !== undefined) db.users[i].dob = dob;
  if (anniversary !== undefined) db.users[i].anniversary = anniversary;
  if (req.body.email !== undefined) db.users[i].email = req.body.email;
  if (req.body.mobile !== undefined) db.users[i].mobile = req.body.mobile;
  if (req.body.address !== undefined) db.users[i].address = req.body.address;
  if (req.body.bloodGroup !== undefined) db.users[i].bloodGroup = req.body.bloodGroup;
  if (req.body.emergencyName !== undefined) db.users[i].emergencyName = req.body.emergencyName;
  if (req.body.emergencyPhone !== undefined) db.users[i].emergencyPhone = req.body.emergencyPhone;
  if (req.body.emergencyRelation !== undefined) db.users[i].emergencyRelation = req.body.emergencyRelation;
  // Salary, leave & branch fields — ADMIN / HR-ADMIN ONLY (members cannot edit their own pay)
  if (canManage) {
    if (branch !== undefined) db.users[i].branch = branch;
    if (openingLeave !== undefined) db.users[i].openingLeave = parseFloat(openingLeave) || 0;
    if (basicSalary !== undefined) db.users[i].basicSalary = parseFloat(basicSalary) || 0;
    if (hra !== undefined) db.users[i].hra = parseFloat(hra) || 0;
    if (conveyance !== undefined) db.users[i].conveyance = parseFloat(conveyance) || 0;
    if (otherAllowance !== undefined) db.users[i].otherAllowance = parseFloat(otherAllowance) || 0;
  }
  if (username) {
    if (db.users.find(u => u.username === username.toLowerCase() && u.id !== req.params.id))
      return res.status(400).json({ error: 'Username already taken.' });
    db.users[i].username = username.toLowerCase().trim();
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    db.users[i].passwordHash = await bcrypt.hash(password, 10);
  }
  // Role can be changed by managers, but only a true admin may grant the 'admin' role
  if (role && canManage) db.users[i].role = (role === 'admin' && req.user.role !== 'admin') ? db.users[i].role : role;
  // Capability flags stay ADMIN-ONLY (prevents privilege escalation by HR/ITR admins)
  if (req.body.payrollAccess !== undefined && req.user.role === 'admin') db.users[i].payrollAccess = !!req.body.payrollAccess;
  if (req.body.itrAdmin !== undefined && req.user.role === 'admin') db.users[i].itrAdmin = !!req.body.itrAdmin;
  if (req.body.hrAdmin !== undefined && req.user.role === 'admin') db.users[i].hrAdmin = !!req.body.hrAdmin;
  // Audit: record exactly which sensitive fields changed
  const _changed = diffFields(_before, db.users[i], ['name','username','role','designation','qualification','branch','joiningDate',
    'openingLeave','basicSalary','hra','conveyance','otherAllowance','payrollAccess','itrAdmin','hrAdmin']);
  const _pw = password ? (_changed ? '; password reset' : 'password reset') : '';
  if (_changed || _pw) {
    logAudit(db, req, 'updated', 'user', db.users[i].id, db.users[i].name, (_changed || '') + _pw);
  }
  writeDB(db);
  res.json({ id: db.users[i].id, name: db.users[i].name, username: db.users[i].username, role: db.users[i].role, designation: db.users[i].designation || '', qualification: db.users[i].qualification || 'CA' });
});
app.delete('/api/users/:id', auth, adminItrOrHr, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin account.' });
  db.users = db.users.filter(u => u.id !== req.params.id);
  logAudit(db, req, 'deleted', 'user', user.id, user.name,
    `username: ${user.username}; designation: ${user.designation || '—'}`);
  writeDB(db);
  res.json({ ok: true });
});

// Clients
app.get('/api/clients', auth, (req, res) => {
  const db = readDB();
  // Never expose password hashes; flag whether login is set up
  const safe = db.clients.map(c => { const { passwordHash, ...rest } = c; return { ...rest, hasLogin: !!c.passwordHash }; });
  res.json(safe);
});
// ── Groups (one login for multiple companies) ───────────────────────────────
app.get('/api/groups', auth, adminOnly, (req, res) => {
  const db = readDB();
  const groups = (db.groups || []).map(g => ({
    id: g.id, name: g.name, groupUsername: g.groupUsername,
    companies: (db.clients || []).filter(c => c.groupId === g.id).map(c => ({ id: c.id, name: c.name }))
  }));
  res.json(groups);
});
app.post('/api/groups', auth, adminOnly, async (req, res) => {
  const db = readDB();
  if (!db.groups) db.groups = [];
  const name = (req.body.name || '').trim();
  const uname = (req.body.groupUsername || '').toLowerCase().trim();
  const pwd = req.body.groupPassword || '';
  if (!name || !uname || !pwd) return res.status(400).json({ error: 'Group name, username and password are required.' });
  if (db.groups.find(g => (g.groupUsername || '').toLowerCase() === uname) || db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname))
    return res.status(400).json({ error: 'This username is already in use.' });
  const group = { id: newId(), name, groupUsername: uname, passwordHash: await bcrypt.hash(pwd, 10), createdAt: new Date().toISOString(), dashboards: { tasks: true, billing: true, cashflow: true, debtors: true } };
  db.groups.push(group);
  writeDB(db);
  res.json({ ok: true, id: group.id, name: group.name });
});
app.put('/api/groups/:id', auth, adminOnly, async (req, res) => {
  const db = readDB();
  const g = (db.groups || []).find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  if (req.body.name) g.name = req.body.name.trim();
  if (req.body.groupPassword) g.passwordHash = await bcrypt.hash(req.body.groupPassword, 10);
  if (req.body.dashboards) g.dashboards = req.body.dashboards;
  writeDB(db);
  res.json({ ok: true });
});
app.delete('/api/groups/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  // detach companies, then remove the group
  (db.clients || []).forEach(c => { if (c.groupId === req.params.id) delete c.groupId; });
  db.groups = (db.groups || []).filter(g => g.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});
// Assign / unassign a company (client) to a group
app.put('/api/clients/:id/group', auth, adminOnly, (req, res) => {
  const db = readDB();
  const c = (db.clients || []).find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found.' });
  const gid = req.body.groupId;
  if (gid && !(db.groups || []).find(g => g.id === gid)) return res.status(400).json({ error: 'Group not found.' });
  if (gid) c.groupId = gid; else delete c.groupId;
  writeDB(db);
  res.json({ ok: true });
});
app.post('/api/clients', auth, staffOnly, async (req, res) => {
  const db = readDB();
  const { clientUsername, clientPassword, ...rest } = req.body;
  const client = { ...rest, id: newId(), createdAt: new Date().toISOString() };
  // Default login to PAN (username = PAN, password = PAN) unless explicit values given
  const pan = (rest.pan || '').trim();
  const uname = (clientUsername || pan).toLowerCase().trim();
  const pwd = clientPassword || pan;
  if (uname && pwd) {
    if (db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname))
      return res.status(400).json({ error: 'A login with this username/PAN already exists.' });
    client.clientUsername = uname;
    client.passwordHash = await bcrypt.hash(pwd, 10);
  }
  db.clients.push(client);
  logAudit(db, req, 'created', 'client', client.id, client.name, `PAN: ${client.pan || '—'}`);
  writeDB(db);
  const { passwordHash, ...safe } = client;
  res.json({ ...safe, hasLogin: !!client.passwordHash });
});
app.put('/api/clients/:id', auth, adminOnly, async (req, res) => {
  const db = readDB();
  const i = db.clients.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Client not found.' });
  const _cBefore = { ...db.clients[i] }; // snapshot for the audit trail
  const { clientUsername, clientPassword, ...rest } = req.body;
  db.clients[i] = { ...db.clients[i], ...rest };
  const pan = (db.clients[i].pan || '').trim();
  // Username: explicit value wins, else default to PAN if no login set yet
  if (clientUsername !== undefined || (!db.clients[i].clientUsername && pan)) {
    const uname = ((clientUsername !== undefined ? clientUsername : pan) || '').toLowerCase().trim();
    if (uname && (db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname && c.id !== req.params.id)))
      return res.status(400).json({ error: 'A login with this username/PAN already exists.' });
    db.clients[i].clientUsername = uname || undefined;
  }
  // Password: explicit value wins, else default to PAN if no password set yet
  if (clientPassword) {
    db.clients[i].passwordHash = await bcrypt.hash(clientPassword, 10);
  } else if (!db.clients[i].passwordHash && pan) {
    db.clients[i].passwordHash = await bcrypt.hash(pan, 10);
  }
  const _cChanged = diffFields(_cBefore, db.clients[i], ['name','pan','gstin','contact','email','address','clientUsername','groupId']);
  const _cPw = clientPassword ? (_cChanged ? '; password reset' : 'password reset') : '';
  if (_cChanged || _cPw) logAudit(db, req, 'updated', 'client', db.clients[i].id, db.clients[i].name, (_cChanged || '') + _cPw);
  writeDB(db);
  const { passwordHash, ...safe } = db.clients[i];
  res.json({ ...safe, hasLogin: !!db.clients[i].passwordHash });
});
app.delete('/api/clients/:id', auth, adminOrItr, (req, res) => {
  const db = readDB();
  const _c = (db.clients || []).find(c => c.id === req.params.id);
  const _n = (db.assignments || []).filter(a => a.clientId === req.params.id).length;
  db.clients = db.clients.filter(c => c.id !== req.params.id);
  db.assignments = db.assignments.filter(a => a.clientId !== req.params.id);
  if (_c) logAudit(db, req, 'deleted', 'client', _c.id, _c.name, `PAN: ${_c.pan || '—'}; also removed ${_n} assignment(s)`);
  writeDB(db);
  res.json({ ok: true });
});

// Admin diagnostic: shows login status for all clients (no passwords exposed)
// Admin: set which dashboards a client can see
app.put('/api/clients/:id/dashboards', auth, adminOnly, (req, res) => {
  const db = readDB();
  const i = db.clients.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Client not found.' });
  const d = req.body || {};
  db.clients[i].dashboards = {
    tasks: d.tasks !== false, billing: d.billing !== false,
    cashflow: d.cashflow !== false, debtors: d.debtors !== false
  };
  writeDB(db);
  res.json(db.clients[i].dashboards);
});
app.get('/api/clients/login-status', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.clients || []).map(c => ({
    name: c.name,
    hasPan: !!(c.pan && c.pan.trim()),
    pan: c.pan || '(none)',
    hasStoredLogin: !!c.clientUsername,
    hasPassword: !!c.passwordHash,
    canLoginWithPan: !!(c.pan && c.pan.trim()) || (!!c.clientUsername && !!c.passwordHash)
  })));
});

// ── Invoice Register ──────────────────────────────────────────────────────────
const MS_DAY = 86400000;
function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr); if (isNaN(d)) return null;
  return new Date(d.getTime() + n * MS_DAY).toISOString().slice(0, 10);
}
function monthKeyOf(dateStr) { return dateStr ? String(dateStr).slice(0, 7) : null; }

// Admin: replace a client's invoice register with parsed rows
app.post('/api/clients/:id/invoices', auth, adminOnly, (req, res) => {
  const db = readDB();
  const client = (db.clients || []).find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!db.invoices) db.invoices = [];
  // Preserve any actualDate already entered, matching by invoiceNo
  const prior = {};
  db.invoices.filter(iv => iv.clientId === req.params.id).forEach(iv => { if (iv.invoiceNo) prior[iv.invoiceNo] = iv.actualDate || null; });
  // Remove this client's existing invoices, then add the new set
  db.invoices = db.invoices.filter(iv => iv.clientId !== req.params.id);
  const replace = req.body.replace !== false;
  let added = 0;
  rows.forEach(r => {
    const invDate = r.invoiceDate ? String(r.invoiceDate).slice(0, 10) : null;
    if (!invDate && !r.invoiceNo) return;
    const inv = {
      id: newId(), clientId: req.params.id,
      invoiceDate: invDate,
      gstNo: r.gstNo || '', ownGstin: r.ownGstin || '', jobCode: r.jobCode || '', contractNo: r.contractNo || '',
      invoiceNo: r.invoiceNo || '', customerName: r.customerName || '', state: r.state || '', address: r.address || '',
      invoiceValue: num(r.invoiceValue), taxableValue: num(r.taxableValue), gst: num(r.gst), tds: num(r.tds),
      retention: num(r.retention), gstTds: num(r.gstTds), gstWithholding: num(r.gstWithholding),
      forexLd: num(r.forexLd), otherDeduction: num(r.otherDeduction),
      netReceivable: num(r.netReceivable),
      estimatedDate: addDays(invDate, 30),
      actualDate: (replace && prior[r.invoiceNo]) ? prior[r.invoiceNo] : (r.actualDate ? String(r.actualDate).slice(0, 10) : null),
      uploadedAt: new Date().toISOString()
    };
    db.invoices.push(inv); added++;
  });
  // Bank balances & outflows (replace this client's set)
  if (!db.bankBalances) db.bankBalances = [];
  if (!db.outflows) db.outflows = [];
  if (Array.isArray(req.body.banks)) {
    db.bankBalances = db.bankBalances.filter(b => b.clientId !== req.params.id);
    req.body.banks.forEach(b => {
      if (!b.bankName) return;
      db.bankBalances.push({ id: newId(), clientId: req.params.id, bankName: b.bankName, accountLast4: b.accountLast4 || '', openingBalance: num(b.openingBalance), asOnDate: b.asOnDate || null });
    });
  }
  if (Array.isArray(req.body.outflows)) {
    db.outflows = db.outflows.filter(o => o.clientId !== req.params.id);
    req.body.outflows.forEach(o => {
      if (!o.date || !o.amount) return;
      db.outflows.push({ id: newId(), clientId: req.params.id, date: String(o.date).slice(0, 10), bankName: o.bankName || '', paidTo: o.paidTo || '', category: o.category || '', description: o.description || '', amount: num(o.amount) });
    });
  }
  if (!db.fixedExpenses) db.fixedExpenses = [];
  if (Array.isArray(req.body.fixedExpenses)) {
    db.fixedExpenses = db.fixedExpenses.filter(f => f.clientId !== req.params.id);
    req.body.fixedExpenses.forEach(f => {
      if (!f.name || !f.monthlyAmount) return;
      let day = parseInt(f.dueDay) || 1; if (day < 1) day = 1; if (day > 31) day = 31;
      const freq = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].includes(f.frequency) ? f.frequency : 'Monthly';
      db.fixedExpenses.push({ id: newId(), clientId: req.params.id, name: f.name, category: f.category || '', bankName: f.bankName || '', frequency: freq, firstMonth: f.firstMonth || 'April', dueDay: day, monthlyAmount: num(f.monthlyAmount) });
    });
  }
  // Credit notes (negative, reduce sales) & Debit notes (positive, increase sales)
  if (!db.salesNotes) db.salesNotes = [];
  const incomingNotes = [].concat(Array.isArray(req.body.creditNotes) ? req.body.creditNotes : [], Array.isArray(req.body.debitNotes) ? req.body.debitNotes : []);
  if (Array.isArray(req.body.creditNotes) || Array.isArray(req.body.debitNotes)) {
    db.salesNotes = db.salesNotes.filter(n => n.clientId !== req.params.id);
    incomingNotes.forEach(n => {
      const amt = num(n.amount != null ? n.amount : (n.taxableValue || n.netReceivable));
      if (!n.date || (!amt && !num(n.netReceivable))) return;
      db.salesNotes.push({
        id: newId(), clientId: req.params.id, date: String(n.date).slice(0, 10),
        noteNo: n.noteNo || '', customerName: n.customerName || '', gstNo: n.gstNo || '', ownGstin: n.ownGstin || '',
        against: n.against || '', reason: n.reason || '', jobCode: n.jobCode || '', contractNo: n.contractNo || '',
        state: n.state || '', address: n.address || '',
        invoiceValue: num(n.invoiceValue), taxableValue: num(n.taxableValue), gst: num(n.gst), tds: num(n.tds),
        netReceivable: num(n.netReceivable),
        amount: amt, type: amt < 0 ? 'credit' : 'debit'
      });
    });
  }
  writeDB(db);
  res.json({ ok: true, count: added, banks: (req.body.banks || []).length, outflows: (req.body.outflows || []).length, notes: incomingNotes.length });
});
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/[₹$,\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}
// Sales/billing value of an invoice or note: prefer Taxable Value; fall back to Invoice Value, then Net Receivable.
function saleValue(iv) {
  const t = num(iv.taxableValue);
  if (t !== 0) return t;
  const inv = num(iv.invoiceValue);
  if (inv !== 0) return inv;
  return num(iv.netReceivable);
}

// Admin: list a client's invoices
app.get('/api/clients/:id/invoices', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.invoices || []).filter(iv => iv.clientId === req.params.id)
    .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || '')));
});

// Accountant/admin: set the actual payment date on an invoice
app.put('/api/invoices/:invId', auth, (req, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: 'Clients cannot edit invoices.' });
  const db = readDB();
  const i = (db.invoices || []).findIndex(iv => iv.id === req.params.invId);
  if (i === -1) return res.status(404).json({ error: 'Invoice not found.' });
  if (req.body.actualDate !== undefined) db.invoices[i].actualDate = req.body.actualDate ? String(req.body.actualDate).slice(0, 10) : null;
  writeDB(db);
  res.json(db.invoices[i]);
});

// Build the dashboard payload for a client's invoices
function buildInvoiceDashboard(db, clientIds, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  // Use the FULL set (don't drop rows with missing/odd dates) so totals reconcile with the template.
  // sanitizeInvoices is only used to null out-of-range payment/estimated dates, not to exclude rows.
  let invs = applyInvFilter(sanitizeInvoicesKeepAll((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  // Optional financial-year filter (by invoice date)
  if (opts && opts.fy && opts.fy !== 'all') {
    const y = parseInt(opts.fy);
    if (!isNaN(y)) invs = invs.filter(iv => { const f = fyOf(iv.invoiceDate); return f && f.startYear === y; });
  }
  // Monthly billing summary keyed by invoice month
  const monthly = {}; // mk -> {billed, received, pending}
  const inflow = {};   // estimated-date month -> amount still expected
  const byCustomer = {}; // customerName -> {totalDays, paidCount, outstanding}
  invs.forEach(iv => {
    // Sales/billing amount = taxable value (notes carry their value in taxableValue too)
    const saleAmt = saleValue(iv);
    // Debtor/receivable amount = net receivable (cash); pending shown on taxable basis per requirement
    const recvAmt = iv.netReceivable || 0;
    const mk = monthKeyOf(iv.invoiceDate);
    if (mk) {
      if (!monthly[mk]) monthly[mk] = { billed: 0, received: 0, pending: 0 };
      monthly[mk].billed += saleAmt;
      if (iv.actualDate) monthly[mk].received += recvAmt; else monthly[mk].pending += saleAmt;
    }
    // Estimated cash inflow: unpaid invoices grouped by estimated month (receivable amount)
    if (!iv.actualDate && iv.estimatedDate) {
      const em = monthKeyOf(iv.estimatedDate);
      inflow[em] = (inflow[em] || 0) + recvAmt;
    }
    // Debtor recovery period per customer
    const cust = iv.customerName || '—';
    if (!byCustomer[cust]) byCustomer[cust] = { totalDays: 0, paidCount: 0, outstanding: 0, billed: 0, receivable: 0 };
    byCustomer[cust].billed += saleAmt;
    byCustomer[cust].receivable += recvAmt;
    if (iv.actualDate && iv.invoiceDate) {
      const days = Math.round((new Date(iv.actualDate) - new Date(iv.invoiceDate)) / MS_DAY);
      if (days >= 0) { byCustomer[cust].totalDays += days; byCustomer[cust].paidCount += 1; }
    } else if (!iv.actualDate) {
      byCustomer[cust].outstanding += saleAmt;
    }
  });
  const monthlyArr = Object.keys(monthly).sort().map(mk => ({ month: mk, ...monthly[mk] }));
  const inflowArr = Object.keys(inflow).sort().map(mk => ({ month: mk, amount: inflow[mk] }));
  const recovery = Object.keys(byCustomer).sort().map(name => {
    const c = byCustomer[name];
    return { customer: name, avgDays: c.paidCount ? Math.round(c.totalDays / c.paidCount) : null,
      paidInvoices: c.paidCount, outstanding: c.outstanding, totalBilled: c.billed, received: (c.receivable - c.outstanding) };
  });
  const taxableOf = saleValue;
  const totals = {
    billed: invs.reduce((s, iv) => s + taxableOf(iv), 0),
    received: invs.filter(iv => iv.actualDate).reduce((s, iv) => s + (iv.netReceivable || 0), 0),
    pending: invs.filter(iv => !iv.actualDate).reduce((s, iv) => s + taxableOf(iv), 0),
    count: invs.length
  };
  return { monthly: monthlyArr, inflow: inflowArr, recovery, totals, hasData: invs.length > 0 };
}

// Client: their own invoice dashboard
app.get('/api/client/invoice-dashboard', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildInvoiceDashboard(db, sc.ids, { customer: req.query.customer, gstin: req.query.gstin, fy: req.query.fy }));
});
// Distinct customers + GSTINs for the client's invoices (filter dropdowns)
app.get('/api/client/invoice-filters', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(invoiceFilterOptions(db, sc.ids));
});
// Admin: preview a client's dashboard
app.get('/api/clients/:id/invoice-dashboard', auth, adminOnly, (req, res) => {
  res.json(buildInvoiceDashboard(readDB(), req.params.id));
});

// ── Compliance tracker (per client, manual) ───────────────────────────────
// Obligations tracked. freq: 'monthly' | 'quarterly' | 'annual'
const COMPLIANCE_DEFS = [
  { key: 'gstr1',  label: 'GSTR-1',          group: 'GST', freq: 'monthly',   amt1: 'GST Liability', gstinWise: true },
  { key: 'gstr3b', label: 'GSTR-3B',         group: 'GST', freq: 'monthly',   amt1: 'Net Liability', amt2: 'GST Input (ITC)', gstinWise: true },
  { key: 'gst_tds',label: 'GST-TDS (GSTR-7)',group: 'GST', freq: 'monthly',   amt1: 'TDS u/s 51', gstinWise: true },
  { key: 'isd',    label: 'ISD (GSTR-6)',    group: 'GST', freq: 'monthly',   amt1: 'ITC Distributed', gstinWise: true },
  { key: 'tds_pay',label: 'TDS Payment',     group: 'TDS', freq: 'monthly',   amt1: 'TDS Paid' },
  { key: 'tds_ret',label: 'TDS Return',      group: 'TDS', freq: 'quarterly' },
  { key: 'pf',     label: 'PF',              group: 'PF/ESI', freq: 'monthly', amt1: 'PF Paid' },
  { key: 'esi',    label: 'ESI',             group: 'PF/ESI', freq: 'monthly', amt1: 'ESI Paid' },
  { key: 'itr',    label: 'ITR',             group: 'Annual', freq: 'annual' },
  { key: 'gstr9',  label: 'GSTR-9 / 9C',     group: 'Annual', freq: 'annual', gstinWise: true },
  { key: 'roc',    label: 'ROC (AOC-4/MGT-7)', group: 'Annual', freq: 'annual' }
];
const COMPLIANCE_STATUSES = ['pending', 'filed', 'overdue', 'na'];

function complianceScopeIds(req, db) {
  // client logs in -> only own; admin uses :id route
  if (req.params && req.params.id) return [req.params.id];
  const sc = clientScope(req, db);
  return sc.ids || [];
}
function getComplianceFor(db, clientId, fy) {
  db.compliance = db.compliance || {};
  const all = db.compliance[clientId] || [];
  return fy ? all.filter(r => String(r.fy) === String(fy)) : all;
}

// list records for a client + FY  (admin route)
app.get('/api/clients/:id/compliance', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json({ defs: COMPLIANCE_DEFS, statuses: COMPLIANCE_STATUSES, records: getComplianceFor(db, req.params.id, req.query.fy) });
});
// client self-view
app.get('/api/client/compliance', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const ids = (clientScope(req, db).ids) || [];
  let records = [];
  ids.forEach(id => { records = records.concat(getComplianceFor(db, id, req.query.fy)); });
  res.json({ defs: COMPLIANCE_DEFS, statuses: COMPLIANCE_STATUSES, records });
});

function upsertCompliance(db, clientId, body) {
  db.compliance = db.compliance || {};
  db.compliance[clientId] = db.compliance[clientId] || [];
  const arr = db.compliance[clientId];
  const fy = String(body.fy || '');
  const period = String(body.period || '');     // e.g. '2026-04' month, '2026-Q1' qtr, or 'FY' for annual
  const obligation = String(body.obligation || '');
  const gstin = String(body.gstin || '').trim(); // '' for entity-wide obligations
  if (!fy || !period || !obligation) return { error: 'fy, period and obligation are required.' };
  if (!COMPLIANCE_DEFS.some(d => d.key === obligation)) return { error: 'Unknown obligation.' };
  let rec = arr.find(r => String(r.fy) === fy && String(r.period) === period && r.obligation === obligation && String(r.gstin || '') === gstin);
  if (!rec) { rec = { id: 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), fy, period, obligation, gstin }; arr.push(rec); }
  rec.gstin = gstin;
  if (body.status !== undefined) rec.status = COMPLIANCE_STATUSES.includes(body.status) ? body.status : 'pending';
  if (body.dueDate !== undefined) rec.dueDate = body.dueDate || '';
  if (body.filedDate !== undefined) rec.filedDate = body.filedDate || '';
  if (body.lateFee !== undefined) rec.lateFee = Number(body.lateFee) || 0;
  if (body.amount !== undefined) rec.amount = Number(body.amount) || 0;
  if (body.amount2 !== undefined) rec.amount2 = Number(body.amount2) || 0;
  if (body.note !== undefined) rec.note = (body.note || '').toString().slice(0, 500);
  rec.updatedAt = new Date().toISOString();
  return rec;
}
app.put('/api/clients/:id/compliance', auth, adminOnly, (req, res) => {
  const db = readDB();
  const rec = upsertCompliance(db, req.params.id, req.body);
  if (rec.error) return res.status(400).json(rec);
  writeDB(db);
  res.json(rec);
});
app.delete('/api/clients/:id/compliance/:recId', auth, adminOnly, (req, res) => {
  const db = readDB();
  db.compliance = db.compliance || {};
  db.compliance[req.params.id] = (db.compliance[req.params.id] || []).filter(r => r.id !== req.params.recId);
  writeDB(db);
  res.json({ ok: true });
});

// ── Import compliance from the GARP Excel template ───────────────────────────
const MONTH_TO_NUM = { april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,january:1,february:2,march:3 };
function fyStartYear(fyLabel){ // 'FY26-27' -> 2026
  const mm = String(fyLabel||'').match(/FY?\s*(\d{2})/i); return mm ? 2000 + parseInt(mm[1]) : null;
}
function periodForMonth(fyLabel, monthName){
  const y = fyStartYear(fyLabel); const mn = MONTH_TO_NUM[String(monthName||'').trim().toLowerCase()];
  if(!y||!mn) return null;
  const year = mn >= 4 ? y : y+1;
  return year + '-' + String(mn).padStart(2,'0');
}
function normStatus(s){ s=String(s||'').trim().toLowerCase(); if(s.startsWith('file'))return 'filed'; if(s.startsWith('overd'))return 'overdue'; if(s.startsWith('pend'))return 'pending'; if(s==='na'||s==='not applicable'||s==='n/a')return 'na'; return s||''; }
function cellNum(v){ if(v===undefined||v===null||v==='')return undefined; const n=Number(String(v).replace(/[, ]/g,'')); return isNaN(n)?undefined:n; }
function cellDate(v){ if(v===undefined||v===null||v==='')return ''; return String(v).trim(); }

app.post('/api/clients/:id/compliance/import', auth, adminOnly, (req, res) => {
  const XLSX = require('xlsx');
  const b64 = (req.body && req.body.fileBase64) || '';
  if(!b64) return res.status(400).json({ error: 'No file provided.' });
  let wb;
  try { wb = XLSX.read(Buffer.from(b64.split(',').pop(), 'base64'), { type:'buffer' }); }
  catch(e){ return res.status(400).json({ error: 'Could not read the Excel file.' }); }
  const db = readDB();
  const clientId = req.params.id;
  let imported = 0; const errors = [];

  // header→column index helper (handles the two-row grouped header on Monthly)
  function sheetRows(name){ const ws = wb.Sheets[name]; if(!ws) return null; return XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' }); }

  // ---- Compliance Monthly ----
  const mRows = sheetRows('Compliance Monthly');
  if(mRows){
    // group header is the row containing 'GSTR-1'; sub header is next row
    let gHdr=-1; for(let i=0;i<mRows.length;i++){ if(mRows[i].some(c=>String(c).trim()==='GSTR-1')){ gHdr=i; break; } }
    if(gHdr>=0){
      const groupRow=mRows[gHdr], subRow=mRows[gHdr+1]||[];
      // map each obligation group to its starting column and field offsets
      const GMAP=[['GSTR-1','gstr1'],['GSTR-3B','gstr3b'],['GST-TDS (GSTR-7)','gst_tds'],['ISD (GSTR-6)','isd'],['TDS Payment','tds_pay'],['PF','pf'],['ESI','esi']];
      // find FY / Month / GSTIN columns from subRow/groupRow
      const findCol=(rowA,rowB,name)=>{ for(let c=0;c<Math.max(rowA.length,rowB.length);c++){ if(String(rowA[c]).trim()===name||String(rowB[c]).trim()===name) return c; } return -1; };
      const fyC=findCol(groupRow,subRow,'Financial Year');
      const moC=findCol(groupRow,subRow,'Month');
      const gstinC=findCol(groupRow,subRow,'GSTIN');
      // for each group, locate its block start in groupRow, then fields by subRow labels within block
      const blocks=[];
      for(const [glabel,okey] of GMAP){
        let start=-1; for(let c=0;c<groupRow.length;c++){ if(String(groupRow[c]).trim()===glabel){ start=c; break; } }
        if(start<0) continue;
        // block runs until next non-empty group label
        let end=groupRow.length-1;
        for(let c=start+1;c<groupRow.length;c++){ if(String(groupRow[c]).trim()!==''){ end=c-1; break; } }
        const fieldCol=(lbl)=>{ for(let c=start;c<=end;c++){ if(String(subRow[c]).trim()===lbl) return c; } return -1; };
        blocks.push({ okey, cStatus:fieldCol('Status'), cDue:fieldCol('Due Date'), cFile:fieldCol('Filing Date'), cLF:fieldCol('Late Fee'),
          cAmt: (()=>{ // first amount-ish column that's not status/due/filing/latefee
            for(let c=start;c<=end;c++){ const l=String(subRow[c]).trim(); if(l && !['Status','Due Date','Filing Date','Late Fee','GST Input (ITC)'].includes(l)) return c; } return -1; })(),
          cAmt2: fieldCol('GST Input (ITC)') });
      }
      for(let i=gHdr+2;i<mRows.length;i++){
        const row=mRows[i]; if(!row||!row.length) continue;
        const fy=String(row[fyC]||'').trim(); const mo=String(row[moC]||'').trim();
        if(!fy||!mo) continue;
        const period=periodForMonth(fy,mo); if(!period) continue;
        const gstin=gstinC>=0?String(row[gstinC]||'').trim():'';
        for(const b of blocks){
          const status=b.cStatus>=0?normStatus(row[b.cStatus]):'';
          const amount=b.cAmt>=0?cellNum(row[b.cAmt]):undefined;
          const amount2=b.cAmt2>=0?cellNum(row[b.cAmt2]):undefined;
          const due=b.cDue>=0?cellDate(row[b.cDue]):'';
          const filed=b.cFile>=0?cellDate(row[b.cFile]):'';
          const lf=b.cLF>=0?cellNum(row[b.cLF]):undefined;
          // skip totally empty cells
          if(!status && amount===undefined && amount2===undefined && !filed && (lf===undefined||lf===0)) continue;
          const def=COMPLIANCE_DEFS.find(d=>d.key===b.okey)||{};
          const body={ fy, period, obligation:b.okey, gstin: def.gstinWise?gstin:'', status, dueDate:due, filedDate:filed };
          if(amount!==undefined) body.amount=amount;
          if(amount2!==undefined) body.amount2=amount2;
          if(lf!==undefined) body.lateFee=lf;
          const r=upsertCompliance(db, clientId, body); if(!r.error) imported++;
        }
      }
    }
  }

  // ---- Compliance Quarterly (TDS Return) ----
  const qRows = sheetRows('Compliance Quarterly');
  if(qRows){
    let h=-1; for(let i=0;i<qRows.length;i++){ if(qRows[i].some(c=>String(c).trim()==='Quarter')){ h=i; break; } }
    if(h>=0){ const H=qRows[h].map(x=>String(x).trim());
      const ci=n=>H.indexOf(n);
      for(let i=h+1;i<qRows.length;i++){ const row=qRows[i]; const fy=String(row[ci('Financial Year')]||'').trim(); const ql=String(row[ci('Quarter')]||'').trim();
        if(!fy||!ql) continue; const qm=ql.match(/Q([1-4])/); if(!qm) continue;
        const period=fyStartYear(fy)+'-Q'+qm[1];
        const status=normStatus(row[ci('Status')]); const filed=cellDate(row[ci('Filing Date')]); const due=cellDate(row[ci('Due Date')]); const lf=cellNum(row[ci('Late Fee')]);
        if(!status && !filed && (lf===undefined||lf===0)) continue;
        const r=upsertCompliance(db, clientId, { fy, period, obligation:'tds_ret', status, dueDate:due, filedDate:filed, lateFee:lf||0 }); if(!r.error) imported++;
      }
    }
  }

  // ---- Compliance Annual ----
  const aRows = sheetRows('Compliance Annual');
  if(aRows){
    let h=-1; for(let i=0;i<aRows.length;i++){ if(aRows[i].some(c=>String(c).trim()==='Obligation')){ h=i; break; } }
    if(h>=0){ const H=aRows[h].map(x=>String(x).trim()); const ci=n=>H.indexOf(n);
      const OB={ 'ITR':'itr','GSTR-9 / 9C':'gstr9','ROC (AOC-4 / MGT-7)':'roc' };
      for(let i=h+1;i<aRows.length;i++){ const row=aRows[i]; const fy=String(row[ci('Financial Year')]||'').trim(); const ob=String(row[ci('Obligation')]||'').trim();
        if(!fy||!ob||!OB[ob]) continue;
        const status=normStatus(row[ci('Status')]); const filed=cellDate(row[ci('Filing Date')]); const due=cellDate(row[ci('Due Date')]); const lf=cellNum(row[ci('Late Fee')]);
        const gstinCi=ci('GSTIN (if GST)'); const gstinV=gstinCi>=0?String(row[gstinCi]||'').trim():'';
        if(!status && !filed && (lf===undefined||lf===0)) continue;
        const def=COMPLIANCE_DEFS.find(d=>d.key===OB[ob])||{};
        const r=upsertCompliance(db, clientId, { fy, period:'FY', obligation:OB[ob], gstin:def.gstinWise?(gstinV==='-'?'':gstinV):'', status, dueDate:due, filedDate:filed, lateFee:lf||0 }); if(!r.error) imported++;
      }
    }
  }

  writeDB(db);
  res.json({ ok:true, imported, errors });
});

// ── Period helpers (Indian Financial Year: Apr–Mar) ───────────────────────────
// Returns {start, end (exclusive), label} for a period containing `anchor`.
function periodRange(type, anchor) {
  const d = new Date(anchor); const Y = d.getFullYear(); const M = d.getMonth(); // 0-based
  const mk = (y, m) => new Date(y, m, 1);
  const fyStartYear = (M >= 3) ? Y : Y - 1; // FY starts in April (month index 3)
  if (type === 'month') {
    return { start: mk(Y, M), end: mk(Y, M + 1), label: monthName(M) + " '" + String(Y).slice(2) };
  }
  if (type === 'quarter') {
    // FY quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
    const fq = Math.floor(((M + 9) % 12) / 3); // 0..3 where 0=Apr
    const qStartMonth = (3 + fq * 3) % 12;
    const qStartYear = (qStartMonth < 3) ? fyStartYear + 1 : fyStartYear;
    return { start: mk(qStartYear, qStartMonth), end: mk(qStartYear, qStartMonth + 3), label: 'Q' + (fq + 1) + ' FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
  }
  if (type === 'half') {
    // H1 Apr-Sep, H2 Oct-Mar
    const isH1 = (M >= 3 && M <= 8);
    if (isH1) return { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9), label: 'H1 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
    return { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3), label: 'H2 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
  }
  // financial year
  return { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3), label: 'FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) };
}
function monthName(m) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]; }
function prevPeriodAnchor(type, anchor) {
  const r = periodRange(type, anchor);
  return new Date(r.start.getTime() - 86400000); // one day before start = previous period
}
function inRange(dateStr, range) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}
// Aggregate one period's figures from a client's invoices
function periodFigures(invs, range) {
  let billed = 0, received = 0, estimatedInflow = 0, actualInflow = 0, billedCount = 0, recvCount = 0;
  let collectedFromPeriod = 0, pendingFromPeriod = 0; // of invoices BILLED in this period
  invs.forEach(iv => {
    const recvAmt = iv.netReceivable || 0;
    const saleAmt = saleValue(iv);
    if (inRange(iv.invoiceDate, range)) {
      billed += saleAmt; billedCount++;
      // Of the invoices billed this period: how much has been collected vs still outstanding (receivable)
      if (iv.actualDate) collectedFromPeriod += recvAmt; else pendingFromPeriod += saleAmt;
    }
    if (iv.actualDate && inRange(iv.actualDate, range)) { received += recvAmt; actualInflow += recvAmt; recvCount++; }
    if (iv.estimatedDate && inRange(iv.estimatedDate, range)) { estimatedInflow += recvAmt; }
  });
  return { billed, received, estimatedInflow, actualInflow, billedCount, recvCount, collectedFromPeriod, pendingFromPeriod };
}
function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0; // null = no baseline
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

// Period-aware billing + cashflow for a client
function buildPeriodDashboard(db, clientIds, type, anchorStr) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId)));
  const anchor = anchorStr ? new Date(anchorStr) : new Date();
  const curRange = periodRange(type, anchor);
  const prevRange = periodRange(type, prevPeriodAnchor(type, anchor));
  const cur = periodFigures(invs, curRange);
  const prev = periodFigures(invs, prevRange);
  // Monthly breakdown within the current period (for the chart)
  const months = [];
  let m = new Date(curRange.start);
  while (m < curRange.end) {
    const mr = { start: new Date(m.getFullYear(), m.getMonth(), 1), end: new Date(m.getFullYear(), m.getMonth() + 1, 1) };
    const f = periodFigures(invs, mr);
    months.push({ month: m.toISOString().slice(0, 7),
      billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod,
      estimatedInflow: f.estimatedInflow, actualInflow: f.actualInflow });
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }
  return {
    hasData: invs.length > 0,
    type, periodLabel: curRange.label, prevLabel: prevRange.label,
    current: cur, previous: prev,
    change: {
      billed: pctChange(cur.billed, prev.billed),
      received: pctChange(cur.received, prev.received),
      estimatedInflow: pctChange(cur.estimatedInflow, prev.estimatedInflow),
      actualInflow: pctChange(cur.actualInflow, prev.actualInflow)
    },
    months
  };
}
app.get('/api/client/period-dashboard', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const type = ['month','quarter','half','fy'].includes(req.query.type) ? req.query.type : 'month';
  { const db = readDB(); const sc = clientScope(req, db); res.json(buildPeriodDashboard(db, sc.ids, type, req.query.anchor)); }
});
app.get('/api/clients/:id/period-dashboard', auth, adminOnly, (req, res) => {
  const type = ['month','quarter','half','fy'].includes(req.query.type) ? req.query.type : 'month';
  res.json(buildPeriodDashboard(readDB(), req.params.id, type, req.query.anchor));
});

// ── Billing/Cashflow SERIES (FY filter + granularity), with per-period invoices ──
// fyStartYear of a date (Apr–Mar). Returns the FY label like "FY24-25".
function fyOf(dateStr) {
  const d = new Date(dateStr); if (isNaN(d)) return null;
  const y = d.getFullYear(), m = d.getMonth();
  const s = (m >= 3) ? y : y - 1;
  return { startYear: s, label: 'FY' + String(s).slice(2) + '-' + String(s + 1).slice(2) };
}
// Keep only invoices with a plausible invoice date (drops phantom years like FY99-00).
// Window: 2015-01-01 up to ~2 years in the future.
function inSaneRange(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const y = d.getFullYear();
  return y >= 2010 && y <= new Date().getFullYear() + 5;
}
function sanitizeInvoices(invs) {
  return invs.filter(iv => inSaneRange(iv.invoiceDate)).map(iv => ({
    ...iv,
    // Null out any out-of-range actual/estimated dates so they can't create phantom periods
    actualDate: inSaneRange(iv.actualDate) ? iv.actualDate : null,
    estimatedDate: inSaneRange(iv.estimatedDate) ? iv.estimatedDate : (inSaneRange(iv.invoiceDate) ? addDays(iv.invoiceDate, 30) : null)
  }));
}
// Like sanitizeInvoices but KEEPS every row (does not drop rows with missing/odd invoice dates)
// so dashboard totals always reconcile with the source template. Only cleans payment/estimated dates.
function sanitizeInvoicesKeepAll(invs) {
  return invs.map(iv => ({
    ...iv,
    actualDate: inSaneRange(iv.actualDate) ? iv.actualDate : null,
    estimatedDate: inSaneRange(iv.estimatedDate) ? iv.estimatedDate : (inSaneRange(iv.invoiceDate) ? addDays(iv.invoiceDate, 30) : null)
  }));
}
// Apply optional customer / GSTIN filters (opts may be undefined)
function applyInvFilter(invs, opts) {
  if (!opts) return invs;
  let out = invs;
  if (opts.customer && opts.customer !== 'all') out = out.filter(iv => (iv.customerName || '') === opts.customer);
  if (opts.gstin && opts.gstin !== 'all') out = out.filter(iv => (iv.ownGstin || '') === opts.gstin);
  return out;
}
// Convert credit/debit notes for the given clients into invoice-like billing adjustments.
// Credit notes are negative (reduce sales), debit notes positive (increase sales).
function notesForClients(db, idset) {
  return (db.salesNotes || []).filter(n => idset.includes(n.clientId) && inSaneRange(n.date)).map(n => {
    const taxable = (n.taxableValue != null && n.taxableValue !== 0) ? n.taxableValue : (n.amount || 0);
    const net = (n.netReceivable != null && n.netReceivable !== 0) ? n.netReceivable : (n.amount || 0);
    return {
      id: 'note-' + n.id, clientId: n.clientId, invoiceDate: n.date,
      invoiceNo: (n.type === 'credit' ? 'CN-' : 'DN-') + (n.noteNo || ''),
      customerName: n.customerName || '', ownGstin: n.ownGstin || '', gstNo: n.gstNo || '',
      netReceivable: net, invoiceValue: (n.invoiceValue || net), taxableValue: taxable,
      estimatedDate: null, actualDate: null, isNote: true, noteType: n.type
    };
  });
}
// Distinct customers and GSTINs for a client's invoices (for filter dropdowns)
function invoiceFilterOptions(db, clientIds) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = (db.invoices || []).filter(iv => idset.includes(iv.clientId));
  const custs = [...new Set(invs.map(iv => iv.customerName).filter(Boolean))].sort();
  const gstins = [...new Set(invs.map(iv => iv.ownGstin).filter(Boolean))].sort();
  return { customers: custs, gstins };
}
// List the period buckets for a given FY (or all FYs) at a granularity
function bucketsFor(granularity, fyStartYear) {
  const mk = (y, m) => new Date(y, m, 1);
  const out = [];
  if (granularity === 'month') {
    for (let i = 0; i < 12; i++) { const m = (3 + i) % 12; const y = m < 3 ? fyStartYear + 1 : fyStartYear; out.push({ start: mk(y, m), end: mk(y, m + 1), label: monthName(m) + " '" + String(y).slice(2) }); }
  } else if (granularity === 'quarter') {
    for (let q = 0; q < 4; q++) { const sm = (3 + q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; out.push({ start: mk(y, sm), end: mk(y, sm + 3), label: 'Q' + (q + 1) + ' FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) }); }
  } else if (granularity === 'half') {
    out.push({ start: mk(fyStartYear, 3), end: mk(fyStartYear, 9), label: 'H1 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
    out.push({ start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3), label: 'H2 FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
  } else { // annual = whole FY as one bucket
    out.push({ start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3), label: 'FY' + String(fyStartYear).slice(2) + '-' + String(fyStartYear + 1).slice(2) });
  }
  return out;
}
function buildSeries(db, clientIds, fyParam, granularity, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  if (!invs.length) return { hasData: false, fyList: [], series: [] };
  // Determine all FYs present (by invoice date, estimated date, actual date)
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.estimatedDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyList = fyYears.map(y => ({ value: String(y), label: fySet[y] }));
  // Which FYs to include
  const targetYears = (fyParam && fyParam !== 'all') ? [parseInt(fyParam)] : fyYears;
  let buckets = [];
  if (granularity === 'all') {
    // One bucket per FY (same as annual across all selected years)
    targetYears.forEach(y => buckets.push(...bucketsFor('annual', y)));
  } else {
    targetYears.forEach(y => buckets.push(...bucketsFor(granularity, y)));
  }
  const series = buckets.map(b => {
    const f = periodFigures(invs, b);
    // invoices billed in this bucket, for drill-down
    const billedInvs = invs.filter(iv => inRange(iv.invoiceDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, taxableValue: saleValue(iv), estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    const estInvs = invs.filter(iv => inRange(iv.estimatedDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    const actInvs = invs.filter(iv => iv.actualDate && inRange(iv.actualDate, b)).map(iv => ({
      invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName,
      netReceivable: iv.netReceivable, estimatedDate: iv.estimatedDate, actualDate: iv.actualDate
    }));
    return {
      label: b.label,
      billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod,
      estimatedInflow: f.estimatedInflow, actualInflow: f.actualInflow,
      billedInvoices: billedInvs, estimatedInvoices: estInvs, actualInvoices: actInvs
    };
  });
  return { hasData: true, fyList, series };
}
app.get('/api/client/billing-series', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const gran = ['month','quarter','half','annual','all'].includes(req.query.gran) ? req.query.gran : 'month';
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildSeries(db, sc.ids, req.query.fy || 'all', gran, { customer: req.query.customer, gstin: req.query.gstin }));
});
app.get('/api/clients/:id/billing-series', auth, adminOnly, (req, res) => {
  const gran = ['month','quarter','half','annual','all'].includes(req.query.gran) ? req.query.gran : 'month';
  res.json(buildSeries(readDB(), req.params.id, req.query.fy || 'all', gran));
});

// ── PIVOT: rows = period buckets (within a FY), columns = financial years ───────
// granularity: month | quarter | half | annual. Each cell carries billed, received, pending.
function buildPivot(db, clientIds, granularity, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  if (!invs.length) return { hasData: false, fyList: [], rows: [] };
  granularity = ['month','quarter','half','annual'].includes(granularity) ? granularity : 'month';
  // Determine FYs present
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.estimatedDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyCols = fyYears.map(y => ({ startYear: y, label: fySet[y] }));
  // Row labels (period within a FY) — generic names independent of year
  const rowDefs = (() => {
    if (granularity === 'month') return ['April','May','June','July','August','September','October','November','December','January','February','March'].map((nm, i) => ({ key: 'm' + i, label: nm, monthOffset: i }));
    if (granularity === 'quarter') return [0,1,2,3].map(q => ({ key: 'q' + q, label: 'Q' + (q + 1), q }));
    if (granularity === 'half') return [0,1].map(h => ({ key: 'h' + h, label: 'H' + (h + 1), h }));
    return [{ key: 'fy', label: 'Full Year', fy: true }];
  })();
  const mk = (y, m) => new Date(y, m, 1);
  // Build a range for a row within a given FY start year
  function rangeFor(rowDef, fyStartYear) {
    if (granularity === 'month') { const off = rowDef.monthOffset; const m = (3 + off) % 12; const y = m < 3 ? fyStartYear + 1 : fyStartYear; return { start: mk(y, m), end: mk(y, m + 1) }; }
    if (granularity === 'quarter') { const sm = (3 + rowDef.q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; return { start: mk(y, sm), end: mk(y, sm + 3) }; }
    if (granularity === 'half') { return rowDef.h === 0 ? { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9) } : { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3) }; }
    return { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3) };
  }
  const rows = rowDefs.map(rd => {
    const cells = fyCols.map(fc => {
      const f = periodFigures(invs, rangeFor(rd, fc.startYear));
      return { fy: fc.label, billed: f.billed, received: f.collectedFromPeriod, pending: f.pendingFromPeriod, estimated: f.estimatedInflow, actual: f.actualInflow };
    });
    const allZero = cells.every(c => !c.billed && !c.received && !c.pending && !c.estimated && !c.actual);
    return { label: rd.label, cells, allZero };
  });
  // Which FY columns actually carry data (drop entirely-empty years like a phantom FY99-00)
  const colHasData = fyCols.map((_, ci) => rows.some(r => { const c = r.cells[ci]; return c.billed || c.received || c.pending || c.estimated || c.actual; }));
  const keptCols = fyCols.filter((_, ci) => colHasData[ci]);
  const trimmedRows = rows
    .filter(r => !r.allZero)
    .map(r => ({ label: r.label, cells: r.cells.filter((_, ci) => colHasData[ci]) }));
  return { hasData: trimmedRows.length > 0 && keptCols.length > 0, fyCols: keptCols, rows: trimmedRows, granularity };
}
app.get('/api/client/billing-pivot', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildPivot(db, sc.ids, req.query.gran, { customer: req.query.customer, gstin: req.query.gstin }));
});
app.get('/api/clients/:id/billing-pivot', auth, adminOnly, (req, res) => {
  res.json(buildPivot(readDB(), req.params.id, req.query.gran));
});

// Invoices behind a pivot cell. params: gran, row (label), fy (FY label), metric (billed|pending|actual|estimated)
function pivotCellInvoices(db, clientIds, gran, rowLabel, fyLabel, metric, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))).concat(notesForClients(db, idset)), opts);
  // find FY start year from label like "FY24-25"
  const m = /FY(\d{2})-(\d{2})/.exec(fyLabel || ''); if (!m) return [];
  const fyStartYear = 2000 + parseInt(m[1]);
  const mk = (y, mo) => new Date(y, mo, 1);
  // resolve the row's date range within that FY
  let range = null;
  const months = ['April','May','June','July','August','September','October','November','December','January','February','March'];
  if (gran === 'month') { const off = months.indexOf(rowLabel); if (off < 0) return []; const mo = (3 + off) % 12; const y = mo < 3 ? fyStartYear + 1 : fyStartYear; range = { start: mk(y, mo), end: mk(y, mo + 1) }; }
  else if (gran === 'quarter') { const q = parseInt((rowLabel.match(/Q(\d)/) || [])[1]) - 1; if (isNaN(q)) return []; const sm = (3 + q * 3) % 12; const y = sm < 3 ? fyStartYear + 1 : fyStartYear; range = { start: mk(y, sm), end: mk(y, sm + 3) }; }
  else if (gran === 'half') { const h = rowLabel.indexOf('1') >= 0 ? 0 : 1; range = h === 0 ? { start: mk(fyStartYear, 3), end: mk(fyStartYear, 9) } : { start: mk(fyStartYear, 9), end: mk(fyStartYear + 1, 3) }; }
  else { range = { start: mk(fyStartYear, 3), end: mk(fyStartYear + 1, 3) }; }
  const pick = invs.filter(iv => {
    if (metric === 'billed') return inRange(iv.invoiceDate, range);
    if (metric === 'pending') return inRange(iv.invoiceDate, range) && !iv.actualDate;
    if (metric === 'actual') return iv.actualDate && inRange(iv.actualDate, range);
    if (metric === 'estimated') return iv.estimatedDate && inRange(iv.estimatedDate, range);
    return false;
  });
  return pick.map(iv => ({ invoiceDate: iv.invoiceDate, invoiceNo: iv.invoiceNo, customerName: iv.customerName, netReceivable: iv.netReceivable, taxableValue: saleValue(iv), estimatedDate: iv.estimatedDate, actualDate: iv.actualDate, isNote: iv.isNote }));
}
app.get('/api/client/pivot-cell', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(pivotCellInvoices(db, sc.ids, req.query.gran || 'month', req.query.row, req.query.fy, req.query.metric, { customer: req.query.customer, gstin: req.query.gstin }));
});
app.get('/api/clients/:id/pivot-cell', auth, adminOnly, (req, res) => {
  res.json(pivotCellInvoices(readDB(), req.params.id, req.query.gran || 'month', req.query.row, req.query.fy, req.query.metric, { customer: req.query.customer, gstin: req.query.gstin }));
});

// ── Bank cash position: opening balance + inflows − outflows, running per month ──
// Does a fixed expense fall due in FY month index i (0=April … 11=March)?
function fixedDueInMonth(f, i) {
  const MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];
  let firstIdx = MONTHS.indexOf(f.firstMonth || 'April');
  if (firstIdx < 0) firstIdx = 0;
  const freq = f.frequency || 'Monthly';
  if (freq === 'Monthly') return true; // every month regardless of firstMonth
  const step = freq === 'Quarterly' ? 3 : freq === 'Half-Yearly' ? 6 : 12; // Yearly = once
  if (i < firstIdx) return false;
  return ((i - firstIdx) % step) === 0;
}
function buildBankPosition(db, clientIds, fyParam, opts) {
  const idset = Array.isArray(clientIds) ? clientIds : [clientIds];
  const invs = applyInvFilter(sanitizeInvoices((db.invoices || []).filter(iv => idset.includes(iv.clientId))), opts);
  const banks = (db.bankBalances || []).filter(b => idset.includes(b.clientId));
  const outflows = (db.outflows || []).filter(o => idset.includes(o.clientId) && inSaneRange(o.date));
  const fixedExp = (db.fixedExpenses || []).filter(f => idset.includes(f.clientId));
  const fixedMonthly = fixedExp.reduce((s, f) => s + (f.monthlyAmount || 0), 0);
  const openingTotal = banks.reduce((s, b) => s + (b.openingBalance || 0), 0);
  // Determine FYs present from invoice/actual/outflow dates
  const fySet = {};
  invs.forEach(iv => { [iv.invoiceDate, iv.actualDate].forEach(dt => { if (dt) { const f = fyOf(dt); if (f) fySet[f.startYear] = f.label; } }); });
  outflows.forEach(o => { const f = fyOf(o.date); if (f) fySet[f.startYear] = f.label; });
  const fyYears = Object.keys(fySet).map(Number).sort();
  const fyList = fyYears.map(y => ({ value: String(y), label: fySet[y] }));
  if (!fyYears.length) return { hasData: banks.length > 0 || fixedExp.length > 0, fyList, openingTotal, banks, fixedExpenses: fixedExp, fixedMonthly, months: [] };
  const targetYear = (fyParam && fyParam !== 'all') ? parseInt(fyParam) : fyYears[fyYears.length - 1]; // default latest FY
  const mk = (y, m) => new Date(y, m, 1);
  let running = openingTotal;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const mo = (3 + i) % 12; const y = mo < 3 ? targetYear + 1 : targetYear;
    const range = { start: mk(y, mo), end: mk(y, mo + 1) };
    const inflow = invs.filter(iv => iv.actualDate && inRange(iv.actualDate, range)).reduce((s, iv) => s + (iv.netReceivable || 0), 0);
    const variableOut = outflows.filter(o => inRange(o.date, range)).reduce((s, o) => s + (o.amount || 0), 0);
    const fixedOut = fixedExp.filter(f => fixedDueInMonth(f, i)).reduce((s, f) => s + (f.monthlyAmount || 0), 0);
    const outflow = variableOut + fixedOut;
    const opening = running;
    running = opening + inflow - outflow;
    months.push({ month: mk(y, mo).toISOString().slice(0, 7), label: monthName(mo) + " '" + String(y).slice(2), opening, inflow, fixedOut, variableOut, outflow, closing: running });
  }
  return { hasData: banks.length > 0 || fixedExp.length > 0 || months.some(m => m.inflow || m.outflow), fyList, fyStartYear: targetYear, fyLabel: fySet[targetYear], openingTotal, banks, fixedExpenses: fixedExp, fixedMonthly, months };
}
app.get('/api/client/bank-position', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB(); const sc = clientScope(req, db);
  res.json(buildBankPosition(db, sc.ids, req.query.fy, { customer: req.query.customer, gstin: req.query.gstin }));
});
app.get('/api/clients/:id/bank-position', auth, adminOnly, (req, res) => {
  res.json(buildBankPosition(readDB(), req.params.id, req.query.fy));
});

// ── Client Portal ────────────────────────────────────────────────────────────
// Tasks for the logged-in client only (safe fields, no salary/internal data)
app.get('/api/client/assignments', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB();
  const sc = clientScope(req, db);
  const cmap = {}; (db.clients || []).forEach(c => { cmap[c.id] = c.name; });
  // derive a period label (YYYY-MM) for filtering / display
  const periodOf = a => a.recurringMonthKey || (a.dueDate ? a.dueDate.slice(0, 7) : '');
  let mine = (db.assignments || []).filter(a => sc.ids.includes(a.clientId));
  if (req.query.period && req.query.period !== 'all') mine = mine.filter(a => periodOf(a) === req.query.period);
  const out = mine.map(a => ({
    id: a.id,
    workType: a.workType,
    companyName: cmap[a.clientId] || '—',
    period: periodOf(a),
    assignmentType: a.assignmentType || 'onetime',
    status: a.status || 'Pending',
    priority: a.priority || 'Normal',
    completionPct: a.completionPct || 0,
    dueDate: a.dueDate,
    memberName: a.memberName || '—',
    reportingPersonName: a.reportingPersonName || '—',
    remark: a.remark || '',
    remarkHistory: (a.activityLog || [])
      .filter(l => l.remark && l.remark.trim())
      .map(l => ({ remark: l.remark, by: l.updatedByName || 'Team', status: l.status, completionPct: l.completionPct, date: l.date })),
    completedAt: a.completedAt || null,
    comments: (a.comments || []).map(c => ({ author: c.authorName, role: c.role, text: c.text, date: c.date }))
  })).sort((x, y) => (x.status === 'Completed' ? 1 : 0) - (y.status === 'Completed' ? 1 : 0) || new Date(x.dueDate || 0) - new Date(y.dueDate || 0));
  res.json(out);
});

// Add a comment/reminder to a task's thread (admin, assigned member, or owning client)
app.post('/api/assignments/:id/comments', auth, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text required.' });
  const db = readDB();
  const i = (db.assignments || []).findIndex(a => a.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Task not found.' });
  const a = db.assignments[i];
  const isClientOwner = req.user.role === 'client' && a.clientId === req.user.clientId;
  const isTeam = req.user.role === 'admin' || a.memberId === req.user.id || a.reportingPersonId === req.user.id;
  if (!isClientOwner && !isTeam) return res.status(403).json({ error: 'Forbidden.' });
  if (!a.comments) a.comments = [];
  const comment = {
    id: newId(), authorId: req.user.id, authorName: req.user.name,
    role: req.user.role, isReminder: !!req.body.isReminder,
    text, date: new Date().toISOString()
  };
  a.comments.push(comment);
  // Notify the other side
  try {
    if (req.user.role === 'client') {
      const payload = { title: `💬 ${a.workType}`, body: `${req.user.name} commented on a task`, tag: 'cmt-' + a.id, url: '/' };
      if (a.memberId) sendPushToUser(db, a.memberId, payload).catch(() => {});
      if (a.reportingPersonId && a.reportingPersonId !== a.memberId) sendPushToUser(db, a.reportingPersonId, payload).catch(() => {});
    }
  } catch (e) {}
  writeDB(db);
  res.json(comment);
});

// Assignments
// ════════════════ ITR FILING TRACKER ════════════════
const ITR_STAGES = ['Not Started', 'Docs Received', 'In Preparation', 'Filed', 'Verified'];
function itrName(db, id) { const u = (db.users || []).find(x => x.id === id); return u ? u.name : null; }

// List ITR parties (admin/Annpurna see all; team members see assigned/reporting)
app.get('/api/itr/parties', auth, (req, res) => {
  const db = readDB();
  const all = db.itrParties || [];
  if (isItrAdminUser(db, req.user.id, req.user.role)) return res.json(all);
  if (req.user.role === 'admin' || req.user.role === 'member') {
    return res.json(all.filter(p => p.assignedTo === req.user.id || p.reportingTo === req.user.id));
  }
  return res.status(403).json({ error: 'Forbidden.' });
});

// Helper: rows visible to the requesting user (mirrors the GET filter)
function itrVisibleParties(db, req) {
  const all = db.itrParties || [];
  if (isItrAdminUser(db, req.user.id, req.user.role)) return all;
  if (req.user.role === 'admin' || req.user.role === 'member') return all.filter(p => p.assignedTo === req.user.id || p.reportingTo === req.user.id);
  return [];
}
function itrLatestTeamCommentText(p) {
  const cs = (p.comments || []).filter(c => c.role !== 'itrclient');
  if (!cs.length) return '';
  const c = cs[cs.length - 1];
  return `${c.text}  — ${c.authorName || 'Team'}${new Date(c.date).toString() !== 'Invalid Date' ? ' (' + new Date(c.date).toLocaleDateString('en-IN') + ')' : ''}`;
}

// ITR Excel export
app.get('/api/itr/export.xlsx', auth, (req, res) => {
  const db = readDB();
  const rows = itrVisibleParties(db, req);
  const XLSX = require('xlsx');
  const header = ['Name','PAN','AY','Type','Assigned To','Reporting To','Stage','Filing Decision','Team Comment','Latest Comment Date','All Comments'];
  const aoa = [header];
  rows.forEach(p => {
    const teamComments = (p.comments || []).filter(c => c.role !== 'itrclient');
    const latest = teamComments[teamComments.length - 1];
    const allC = (p.comments || []).map(c => `[${c.authorName || '?'}${c.role==='itrclient'?' (client)':''}] ${c.text}`).join(' | ');
    aoa.push([
      p.name || '', p.pan || '', p.ay || '', p.type || '',
      p.assignedName || 'Unassigned', p.reportingName || '',
      p.stage || '', p.filingDecision || 'undecided',
      latest ? latest.text : '',
      latest ? new Date(latest.date).toLocaleDateString('en-IN') : '',
      allC
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:24},{wch:12},{wch:9},{wch:12},{wch:16},{wch:16},{wch:16},{wch:14},{wch:40},{wch:14},{wch:60}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ITR Filing');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="ITR_Filing_Report_${todayStr()}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ITR PDF export (returns print-ready HTML; client opens print → Save as PDF)
app.get('/api/itr/export.pdf', auth, (req, res) => {
  const db = readDB();
  const rows = itrVisibleParties(db, req);
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const trs = rows.map((p, i) => {
    const teamComments = (p.comments || []).filter(c => c.role !== 'itrclient');
    const latest = teamComments[teamComments.length - 1];
    return `<tr style="background:${i%2?'#f8fafc':'#fff'}">
      <td>${esc(p.name||'—')}</td><td style="font-family:monospace">${esc(p.pan||'')}</td>
      <td>${esc(p.ay||'—')}</td><td>${esc(p.type||'—')}</td>
      <td>${esc(p.assignedName||'Unassigned')}</td><td>${esc(p.stage||'—')}</td>
      <td>${esc(p.filingDecision||'undecided')}</td>
      <td style="max-width:260px">${latest?esc(latest.text)+' <span style="color:#94a3b8">— '+esc(latest.authorName||'Team')+'</span>':'—'}</td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf8"><title>ITR Filing Report</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#1e293b}
    h1{font-size:18px;color:#1e3a8a;margin:0 0 2px}.sub{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#1e3a8a;color:#fff;padding:7px 8px;text-align:left;font-size:9px}
    td{padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    @media print{.noprint{display:none}}
    .btn{background:#1e3a8a;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer}
  </style></head><body>
  <div class="noprint" style="margin-bottom:14px"><button class="btn" onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <h1>GARP &amp; Associates — ITR Filing Report</h1>
  <div class="sub">Generated ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · ${rows.length} record(s)</div>
  <table><thead><tr>
    <th>Name</th><th>PAN</th><th>AY</th><th>Type</th><th>Assigned To</th><th>Stage</th><th>Decision</th><th>Team Comment</th>
  </tr></thead><tbody>${trs || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No records</td></tr>'}</tbody></table>
  <script>setTimeout(function(){window.print&&window.print();},400);</script>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ITR client sees own record
app.get('/api/itr/me', auth, (req, res) => {
  if (req.user.role !== 'itrclient') return res.status(403).json({ error: 'Forbidden.' });
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  res.json(p);
});

// Bulk upload parties (admin/Annpurna)
app.post('/api/itr/parties/bulk', auth, itrAdmin, (req, res) => {
  const db = readDB();
  if (!db.itrParties) db.itrParties = [];
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let added = 0, updated = 0;
  rows.forEach(r => {
    const pan = (r.pan || '').trim().toUpperCase();
    if (!pan) return;
    const ay = (r.ay || '').toString().trim();
    const ex = db.itrParties.find(p => (p.pan || '').toUpperCase() === pan && (p.ay || '') === ay);
    if (ex) {
      ex.name = r.name || ex.name; ex.type = r.type || ex.type;
      ex.email = r.email || ex.email; ex.mobile = r.mobile || ex.mobile;
      updated++;
    } else {
      db.itrParties.push({
        id: newId(), pan, name: r.name || '', ay, type: r.type || '',
        email: r.email || '', mobile: r.mobile || '',
        stage: 'Not Started', assignedTo: null, assignedName: null,
        reportingTo: null, reportingName: null, comments: [], createdAt: new Date().toISOString()
      });
      added++;
    }
  });
  writeDB(db);
  res.json({ ok: true, added, updated, total: db.itrParties.length });
});

// Add single party (admin/Annpurna)
app.post('/api/itr/parties', auth, itrAdmin, (req, res) => {
  const db = readDB();
  if (!db.itrParties) db.itrParties = [];
  const pan = (req.body.pan || '').trim().toUpperCase();
  if (!pan) return res.status(400).json({ error: 'PAN required.' });
  const party = {
    id: newId(), pan, name: req.body.name || '', ay: (req.body.ay || '').toString().trim(),
    type: req.body.type || '', email: req.body.email || '', mobile: req.body.mobile || '',
    stage: 'Not Started', assignedTo: null, assignedName: null,
    reportingTo: null, reportingName: null, comments: [], createdAt: new Date().toISOString()
  };
  db.itrParties.push(party);
  writeDB(db);
  res.json(party);
});

// Assign team member + reporting person (admin/Annpurna)
app.put('/api/itr/parties/:id/assign', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  if ('assignedTo' in req.body) { p.assignedTo = req.body.assignedTo || null; p.assignedName = req.body.assignedTo ? itrName(db, req.body.assignedTo) : null; }
  if ('reportingTo' in req.body) { p.reportingTo = req.body.reportingTo || null; p.reportingName = req.body.reportingTo ? itrName(db, req.body.reportingTo) : null; }
  writeDB(db);
  res.json(p);
});

// Update stage (admin/Annpurna, assigned member, or reporting person)
app.put('/api/itr/parties/:id/stage', auth, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const allowed = isItrAdminUser(db, req.user.id, req.user.role) || p.assignedTo === req.user.id || p.reportingTo === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });
  const stage = req.body.stage;
  if (!ITR_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage.' });
  const changed = p.stage !== stage;
  p.stage = stage;
  if (stage === 'Filed' && !p.filedAt) p.filedAt = new Date().toISOString();
  writeDB(db);
  // Notify the client by email + WhatsApp (unless muted for this party)
  if (changed && p.notify !== false) { try { notifyItrStage(p); } catch (e) {} }
  res.json(p);
});

// Add comment (admin/Annpurna, assigned member, reporting person, or the ITR client themselves)
app.post('/api/itr/parties/:id/comments', auth, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment required.' });
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const isOwner = req.user.role === 'itrclient' && req.user.id === p.id;
  const allowed = isItrAdminUser(db, req.user.id, req.user.role) || p.assignedTo === req.user.id || p.reportingTo === req.user.id || isOwner;
  if (!allowed) return res.status(403).json({ error: 'Forbidden.' });
  if (!p.comments) p.comments = [];
  const c = { id: newId(), authorId: req.user.id, authorName: req.user.name, role: req.user.role, text, date: new Date().toISOString() };
  p.comments.push(c);
  writeDB(db);
  res.json(c);
});

// Delete party (admin/Annpurna)
app.delete('/api/itr/parties/:id', auth, itrAdmin, (req, res) => {
  const db = readDB();
  db.itrParties = (db.itrParties || []).filter(x => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Set filing decision: 'confirmed' (will file), 'parked' (decide later), or null (undecided)
app.put('/api/itr/parties/:id/decision', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  const d = req.body.decision;
  if (![null, 'confirmed', 'parked'].includes(d)) return res.status(400).json({ error: 'Invalid decision.' });
  p.filingDecision = d;
  p.decisionNote = (req.body.note || '').toString().trim();
  p.decisionAt = new Date().toISOString();
  writeDB(db);
  res.json(p);
});

// Notification channel status (admin/Annpurna)
app.get('/api/itr/notify-status', auth, itrAdmin, (req, res) => {
  res.json(notifConfigStatus());
});
// Send a test notification to a party (admin/Annpurna)
app.post('/api/itr/parties/:id/notify-test', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  try { notifyItrStage(p); } catch (e) {}
  res.json({ ok: true, sentTo: { email: !!p.email, whatsapp: !!p.mobile }, channels: notifConfigStatus() });
});
// Toggle notifications for a party (admin/Annpurna)
app.put('/api/itr/parties/:id/notify', auth, itrAdmin, (req, res) => {
  const db = readDB();
  const p = (db.itrParties || []).find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found.' });
  p.notify = req.body.notify !== false;
  if ('email' in req.body) p.email = String(req.body.email || '').trim();
  if ('mobile' in req.body) p.mobile = String(req.body.mobile || '').trim();
  writeDB(db);
  res.json(p);
});

// Month-wise recurring task status report (admin)
app.get('/api/recurring-report', auth, (req, res) => {
  if (req.user.role === 'client' || req.user.role === 'itrclient') return res.status(403).json({ error: 'Forbidden.' });
  const db = readDB();
  const months = Math.min(12, Math.max(2, parseInt(req.query.months) || 6));
  const now = new Date();
  const keys = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  keys.reverse();
  const monthLabels = keys.map(k => {
    const [y, m] = k.split('-');
    return { key: k, label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1] + ' ' + y.slice(2) };
  });
  const cmap = {}; (db.clients || []).forEach(c => { cmap[c.id] = c.name; });
  const periodOf = a => a.recurringMonthKey || (a.dueDate ? a.dueDate.slice(0, 7) : '');
  const recs = (db.assignments || []).filter(a => a.assignmentType === 'recurring');
  const groups = {};
  recs.forEach(a => {
    const k = a.clientId + '||' + a.workType;
    if (!groups[k]) groups[k] = { clientId: a.clientId, clientName: cmap[a.clientId] || '—', workType: a.workType, byMonth: {} };
    const p = periodOf(a);
    if (keys.includes(p)) {
      const prev = groups[k].byMonth[p];
      const rank = s => s === 'Completed' ? 3 : (s === 'Under Review' ? 2 : (s === 'In Progress' ? 1 : 0));
      if (!prev || rank(a.status) > rank(prev.status)) groups[k].byMonth[p] = { status: a.status, completedAt: a.completedAt || null, dueDate: a.dueDate };
    }
  });
  const rows = Object.values(groups)
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.workType.localeCompare(b.workType))
    .map(g => ({ clientName: g.clientName, workType: g.workType, cells: keys.map(k => g.byMonth[k] || null) }));
  res.json({ months: monthLabels, rows });
});
app.get('/api/assignments', auth, (req, res) => {
  const db = readDB();
  let result;
  if (req.user.role === 'admin') {
    result = db.assignments;
  } else {
    result = db.assignments.filter(a =>
      a.memberId === req.user.id ||
      a.reportingPersonId === req.user.id ||
      a.subAssignedBy === req.user.id ||
      a.parentAssigneeId === req.user.id ||
      (a.isSubAssignment && a.subAssignedByName === req.user.name)
    );
  }
  // Enrich recurring tasks with their template's frequency (for display), resolving by id or attributes
  const _tmap = {}; (db.recurringTemplates || []).forEach(t => { _tmap[t.id] = t; });
  const _tByAttr = {}; (db.recurringTemplates || []).forEach(t => { _tByAttr[t.clientId + '|' + t.workType + '|' + t.memberId] = t; });
  const _amap = {}; (db.assignments || []).forEach(x => { _amap[x.id] = x; });
  result = result.map(a => {
    const base = { ...a, status: a.status || 'Pending' };
    if (a.assignmentType === 'recurring' && !base.frequency) {
      let t = a.recurringTemplateId ? _tmap[a.recurringTemplateId] : null;
      if (!t) t = _tByAttr[a.clientId + '|' + a.workType + '|' + a.memberId];
      if (t) base.frequency = t.frequency || 'Monthly';
    }
    // A sub-assignee only holds their own slice of the work and never sees the parent
    // task, so they were missing the context the assignee and assigner both have.
    // Attach a read-only summary of the parent (same client, same job) to the sub-task.
    if (a.isSubAssignment && a.parentAssignmentId) {
      const p = _amap[a.parentAssignmentId];
      if (p) {
        base.parent = {
          id: p.id, workType: p.workType, notes: p.notes || '',
          dueDate: p.dueDate, priority: p.priority || 'Normal', status: p.status || 'Pending',
          clientId: p.clientId, assigneeName: p.memberName || '',
          reportingPersonName: p.reportingPersonName || '',
          remark: p.remark || '', completionPct: p.completionPct || 0,
          assignmentType: p.assignmentType || 'onetime',
          comments: (p.comments || []).map(c => ({ authorName: c.authorName || c.author || '', role: c.role, text: c.text, date: c.date }))
        };
      }
    }
    return base;
  });
  res.json(result);
});
app.post('/api/assignments', auth, (req, res) => {
  const db = readDB();
  if (req.body.parentAssignmentId) {
    const parent = db.assignments.find(a => a.id === req.body.parentAssignmentId);
    if (!parent) return res.status(404).json({ error: 'Parent assignment not found.' });
    if (req.user.role !== 'admin' && parent.memberId !== req.user.id && parent.subAssignedBy !== req.user.id)
      return res.status(403).json({ error: 'Only the primary assignee can create sub-assignments.' });
  }
  const isAdmin = req.user.role === 'admin';
  const a = {
    ...req.body, id: newId(),
    assignmentType: req.body.assignmentType || 'onetime',
    isSubAssignment: !!req.body.parentAssignmentId,
    // Always set subAssignedBy when there is a parentAssignmentId OR when explicitly passed
    subAssignedBy: req.body.parentAssignmentId ? req.user.id : (req.body.subAssignedBy || null),
    subAssignedByName: req.body.parentAssignmentId ? req.user.name : (req.body.subAssignedByName || null),
    reportingPersonId: req.body.reportingPersonId || (!isAdmin && req.body.memberId !== req.user.id ? req.user.id : null),
    reportingPersonName: req.body.reportingPersonName || (!isAdmin && req.body.memberId !== req.user.id ? req.user.name : null),
    createdAt: new Date().toISOString(),
    originalDueDate: req.body.dueDate,
    completedAt: null, completedOnTime: null, completionPct: 0, activityLog: []
  };
  db.assignments.push(a);

  // Notify the assigned member (in-app + push)
  const client = db.clients.find(c => c.id === a.clientId);
  const assignerName = req.user.name;
  writeDB(db);
  if (a.memberId && a.memberId !== req.user.id) {
    notifyUser(db, a.memberId, {
      title: a.isSubAssignment ? 'New Sub-Task from ' + assignerName : 'New Assignment from ' + assignerName,
      message: (client && client.name ? client.name : 'Client') + ' - ' + a.workType + (a.dueDate ? ' . Due ' + a.dueDate : ''),
      type: 'new-assignment', assignmentId: a.id, clientName: (client && client.name) || '', workType: a.workType
    });
    writeDB(db);
  }
  res.json(a);
});
// A single generated recurring task can be handed to someone else for one period
// only (e.g. cover while the usual assignee is on leave). Flag it so a later
// template save doesn't pull it back to the template's assignee. Setting it back
// to the template's assignee clears the flag.
function markRecurringOverride(db, a, newMemberId) {
  if (!a || a.assignmentType !== 'recurring' || !newMemberId) return;
  const tpl = (db.recurringTemplates || []).find(t => t.id === a.recurringTemplateId);
  if (!tpl || !tpl.memberId) return;
  if (newMemberId !== tpl.memberId) a.assigneeOverridden = true;
  else delete a.assigneeOverridden;
}

app.put('/api/assignments/:id', auth, (req, res) => {
  const db = readDB();
  const i = db.assignments.findIndex(a => a.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Assignment not found.' });
  const a = db.assignments[i];
  const isAdmin = req.user.role === 'admin';
  // Creator = sub-assigner OR reporting person (member who assigned the task)
  const isCreator = a.subAssignedBy === req.user.id || a.reportingPersonId === req.user.id;
  const isOwnTask = a.memberId === req.user.id;

  if (isAdmin) {
    const { status, completedAt, completedOnTime, ...rest } = req.body;
    if (rest.dueDate !== undefined && rest.dueDate !== a.dueDate) {
      logDueDateChange(db, a, a.dueDate, rest.dueDate, req.user, 'admin-edit');
    }
    if (status) {
      rest.status = status;
      if (status === 'Completed') {
        const now = new Date();
        if (!a.completedAt) rest.completedAt = now.toISOString();
        rest.completionPct = 100;
        const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
        if (a.completedOnTime == null) rest.completedOnTime = due ? now <= due : null;
      } else { rest.completedAt = null; rest.completedOnTime = null; }
    }
    db.assignments[i] = { ...db.assignments[i], ...rest };
    markRecurringOverride(db, db.assignments[i], rest.memberId);
  } else if (isCreator && !isOwnTask) {
    // Reporting person / assigner: can edit details + add supervisorRemark only
    const allowed = {};
    if (req.body.supervisorRemark !== undefined) allowed.supervisorRemark = req.body.supervisorRemark;
    if (req.body.dueDate !== undefined && req.body.dueDate !== a.dueDate) {
      // Only CA-qualified team members (or admin) may change due dates
      if (req.user.role !== 'admin' && req.user.qualification !== 'CA')
        return res.status(403).json({ error: 'Only Chartered Accountant (CA) team members can extend or change due dates.' });
      logDueDateChange(db, a, a.dueDate, req.body.dueDate, req.user, 'edit');
      allowed.dueDate = req.body.dueDate;
    }
    if (req.body.priority !== undefined) allowed.priority = req.body.priority;
    if (req.body.notes !== undefined) allowed.notes = req.body.notes;
    if (req.body.memberId !== undefined) { allowed.memberId = req.body.memberId; allowed.memberName = req.body.memberName; }
    db.assignments[i] = { ...db.assignments[i], ...allowed };
    markRecurringOverride(db, db.assignments[i], allowed.memberId);
  } else if (isOwnTask || isCreator) {
    if (a.status === 'Completed') return res.status(400).json({ error: 'This task is Completed and locked. Your reporting manager must request a reopen.' });
    // CA-qualified members (or admin) may extend/change the due date of their own task; it is logged.
    if (req.body.dueDate !== undefined && req.body.dueDate !== a.dueDate) {
      if (req.user.role === 'admin' || req.user.qualification === 'CA') {
        logDueDateChange(db, a, a.dueDate, req.body.dueDate, req.user, 'ca-edit');
        db.assignments[i].dueDate = req.body.dueDate;
      } else {
        return res.status(403).json({ error: 'Only Chartered Accountant (CA) team members can extend or change due dates. Please raise a Due Date Request instead.' });
      }
    }
    const prevPct = a.completionPct || 0;
    const prevStatus = a.status;
    if (req.body.status) {
      // Member marking Completed → goes to reporting manager (or admin) for approval first
      if (req.body.status === 'Completed' && req.user.role !== 'admin') {
        db.assignments[i].status = 'Under Review';
        db.assignments[i].awaitingApproval = true;
        db.assignments[i].submittedForApprovalAt = new Date().toISOString();
        // completion stays below 100 until approved
        if ((db.assignments[i].completionPct || 0) < 90) db.assignments[i].completionPct = 90;
        // Notify approver: reporting manager, else admin
        const approverId = a.reportingPersonId || (db.users.find(u => u.role === 'admin') || {}).id;
        const cl = db.clients.find(c => c.id === a.clientId);
        if (approverId && approverId !== req.user.id) {
          notifyUser(db, approverId, {
            title: 'Approval needed',
            message: `${req.user.name} marked "${a.workType}" (${cl ? cl.name : '—'}) complete. Review & approve.`,
            type: 'completion-approval', assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType
          });
        }
      } else {
        db.assignments[i].status = req.body.status;
        if (req.body.status === 'Completed') {
          db.assignments[i].completionPct = 100;
          db.assignments[i].awaitingApproval = false;
          const now = new Date();
          db.assignments[i].completedAt = now.toISOString();
          const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
          db.assignments[i].completedOnTime = due ? now <= due : null;
        }
      }
    }
    if (req.body.remark !== undefined) db.assignments[i].remark = req.body.remark;
    if (req.body.completionPct !== undefined) {
      const pct = Math.min(100, Math.max(0, Math.round(parseInt(req.body.completionPct) / 10) * 10));
      db.assignments[i].completionPct = pct;
    }
    if (!db.assignments[i].activityLog) db.assignments[i].activityLog = [];
    const newPct = db.assignments[i].completionPct || 0;
    db.assignments[i].activityLog.push({
      date: new Date().toISOString(), updatedBy: req.user.id, updatedByName: req.user.name,
      status: db.assignments[i].status, completionPct: newPct, prevPct, prevStatus,
      remark: db.assignments[i].remark || '', isBackward: newPct < prevPct
    });
  } else {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  writeDB(db);
  res.json(db.assignments[i]);
});

// Approve or reject a member's completion submission (reporting manager, or admin if none)
app.post('/api/assignments/:id/approve-completion', auth, (req, res) => {
  const db = readDB();
  const i = db.assignments.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Assignment not found.' });
  const a = db.assignments[i];
  const adminId = (db.users.find(u => u.role === 'admin') || {}).id;
  const approverIsManager = a.reportingPersonId && a.reportingPersonId === req.user.id;
  const approverIsAdminFallback = !a.reportingPersonId && req.user.role === 'admin';
  const approverIsAdmin = req.user.role === 'admin';
  if (!approverIsManager && !approverIsAdminFallback && !approverIsAdmin)
    return res.status(403).json({ error: 'Only the reporting manager (or Admin) can approve this completion.' });
  if (!a.awaitingApproval) return res.status(400).json({ error: 'This task is not awaiting approval.' });

  const approve = req.body.approve !== false; // default approve unless explicitly false
  const cl = db.clients.find(c => c.id === a.clientId);
  if (approve) {
    const now = new Date();
    a.status = 'Completed';
    a.completionPct = 100;
    a.awaitingApproval = false;
    a.completedAt = now.toISOString();
    a.approvedById = req.user.id; a.approvedByName = req.user.name; a.approvedAt = now.toISOString();
    const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
    a.completedOnTime = due ? now <= due : null;
    if (a.memberId && a.memberId !== req.user.id) notifyUser(db, a.memberId, {
      title: 'Completion approved', message: `Your task "${a.workType}" (${cl ? cl.name : '—'}) was approved by ${req.user.name}.`,
      type: 'completion-approved', assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType });
  } else {
    a.status = 'In Progress';
    a.awaitingApproval = false;
    a.rejectionRemark = (req.body.remark || '').trim();
    if (a.memberId && a.memberId !== req.user.id) notifyUser(db, a.memberId, {
      title: 'Completion sent back', message: `Your task "${a.workType}" (${cl ? cl.name : '—'}) was sent back by ${req.user.name}.${a.rejectionRemark ? ' Note: ' + a.rejectionRemark : ''}`,
      type: 'completion-rejected', assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType });
  }
  if (!a.activityLog) a.activityLog = [];
  a.activityLog.push({ date: new Date().toISOString(), updatedBy: req.user.id, updatedByName: req.user.name,
    status: a.status, completionPct: a.completionPct || 0, remark: approve ? 'Completion approved' : ('Sent back: ' + (a.rejectionRemark||'')), isApproval: true });
  db.assignments[i] = a;
  writeDB(db);
  res.json(a);
});

app.delete('/api/assignments/:id', auth, (req, res) => {
  const db = readDB();
  const a = db.assignments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only Admin can delete a task.' });
  db.assignments = db.assignments.filter(x => x.id !== req.params.id);
  // Also delete sub-assignments of this assignment
  db.assignments = db.assignments.filter(x => x.parentAssignmentId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Recurring Templates
app.get('/api/recurring-templates', auth, (req, res) => {
  const db = readDB();
  let all = db.recurringTemplates || [];
  // Fix any templates missing id (legacy data)
  let changed = false;
  all = all.map(t => { if(!t.id){t.id=newId();changed=true;} return t; });
  if(changed){ db.recurringTemplates=all; writeDB(db); }
  // Admin sees all; members see templates they created or are assigned to
  if (req.user.role === 'admin') return res.json(all);
  res.json(all.filter(t => t.memberId === req.user.id || t.createdBy === req.user.id || t.reportingPersonId === req.user.id));
});
app.post('/api/recurring-templates', auth, (req, res) => {
  const { clientId, memberId, memberName, workType, priority, dueDayOfMonth, reportingPersonId, reportingPersonName, notes, frequency } = req.body;
  if (!clientId || !memberId || !workType || !dueDayOfMonth) return res.status(400).json({ error: 'Client, member, work type and due day required.' });
  const db = readDB();
  const template = {
    id: newId(), clientId, memberId, memberName, workType, priority: priority || 'Normal',
    dueDayOfMonth: parseInt(dueDayOfMonth), reportingPersonId: reportingPersonId || null,
    reportingPersonName: reportingPersonName || null, notes: notes || '',
    active: true, frequency: frequency || 'Monthly',
    createdBy: req.user.id, createdByName: req.user.name,
    createdAt: new Date().toISOString()
  };
  if (!db.recurringTemplates) db.recurringTemplates = [];
  db.recurringTemplates.push(template);
  generateMonthlyAssignment(db, template, new Date());
  writeDB(db);
  res.json(template);
});
app.put('/api/recurring-templates/:id', auth, (req, res) => {
  const db = readDB();
  const i = (db.recurringTemplates || []).findIndex(t => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Template not found.' });
  const t = db.recurringTemplates[i];
  if (req.user.role !== 'admin' && t.createdBy !== req.user.id && t.memberId !== req.user.id)
    return res.status(403).json({ error: 'You can only edit templates you created.' });
  const before = { ...t };                       // snapshot before the merge
  db.recurringTemplates[i] = { ...t, ...req.body };
  const nt = db.recurringTemplates[i];
  // If frequency changed, drop pending tasks that no longer fit the new frequency
  if (req.body.frequency && req.body.frequency !== before.frequency) {
    const newFreq = req.body.frequency;
    db.assignments = db.assignments.filter(a => {
      if (a.recurringTemplateId !== nt.id) return true;
      if (a.status === 'Completed') return true;
      return periodMatchesFrequency(a.recurringMonthKey, newFreq);
    });
  }
  // Editing the template only changed FUTURE generations — tasks already generated
  // kept the old assignee. Reconcile every OPEN task against the template's CURRENT
  // values. We deliberately compare each task to the template (rather than diffing
  // this request) so a template whose assignee was changed *before* this fix existed
  // is repaired the next time it is saved — a plain re-save is enough.
  // Completed tasks keep their original assignee so history (who actually did the
  // work) stays intact.
  let moved = 0, memberMoved = 0;
  (db.assignments || []).forEach(a => {
    if (a.recurringTemplateId !== nt.id) return;
    if (a.status === 'Completed') return;
    let touched = false;
    // Respect a one-off reassignment made on this specific task
    if (nt.memberId && a.memberId !== nt.memberId && !a.assigneeOverridden) {
      a.memberId = nt.memberId; a.memberName = nt.memberName || '';
      touched = true; memberMoved++;
    }
    if ((a.reportingPersonId || null) !== (nt.reportingPersonId || null)) {
      a.reportingPersonId = nt.reportingPersonId || null;
      a.reportingPersonName = nt.reportingPersonName || null;
      touched = true;
    }
    if (nt.workType && a.workType !== nt.workType) { a.workType = nt.workType; touched = true; }
    if (nt.priority && a.priority !== nt.priority) { a.priority = nt.priority; touched = true; }
    if (touched) moved++;
  });
  // Let the new assignee know work has moved to them
  if (memberMoved && nt.memberId) {
    try {
      const cl = (db.clients || []).find(c => c.id === nt.clientId);
      notifyUser(db, nt.memberId, {
        title: 'Recurring task reassigned to you',
        message: `${memberMoved} open ${nt.workType} task(s)${cl ? ' for ' + cl.name : ''} were reassigned to you by ${req.user.name}.`,
        type: 'assignment'
      });
      sendPushToUser(db, nt.memberId, { title: '🔄 Task reassigned', body: `${memberMoved} open ${nt.workType} task(s) moved to you`, tag: 'assign', url: '/' }).catch(()=>{});
    } catch (e) { /* non-fatal */ }
  }
  writeDB(db);
  res.json({ ...nt, reassignedCount: moved });
});
app.delete('/api/recurring-templates/:id', auth, (req, res) => {
  const db = readDB();
  const t = (db.recurringTemplates || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found.' });
  if (req.user.role !== 'admin' && t.createdBy !== req.user.id)
    return res.status(403).json({ error: 'You can only delete templates you created.' });
  db.recurringTemplates = db.recurringTemplates.filter(x => x.id !== req.params.id);
  // Also remove generated assignments from this template (keep Completed ones for history)
  const keepCompleted = req.query.keepCompleted !== 'false';
  db.assignments = (db.assignments || []).filter(a => {
    if (a.recurringTemplateId !== req.params.id) return true;
    if (keepCompleted && a.status === 'Completed') return true;
    return false;
  });
  writeDB(db);
  res.json({ ok: true });
});
// ═══════════════════════════════════════════════════════════
// STATUTORY DUE-DATE CALENDAR
// Standard Indian compliance deadlines. `months` are 1-12 (the month the work is
// DUE, not the period it covers). Admin applies these to a client and the normal
// recurring engine then auto-generates the tasks each period.
// NOTE: these are the standard statutory dates. Government extensions happen —
// each generated template stays fully editable.
// ═══════════════════════════════════════════════════════════
const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const STATUTORY_CATALOG = [
  // ── GST ──
  { code:'gstr1_m',    name:'GSTR-1 (Monthly)',            category:'GST',     months:ALL_MONTHS,   dueDay:11, freq:'Monthly',   note:'Outward supplies — 11th of the following month' },
  { code:'gstr1_q',    name:'GSTR-1 (QRMP Quarterly)',     category:'GST',     months:[1,4,7,10],   dueDay:13, freq:'Quarterly', note:'QRMP filers — 13th of the month after the quarter' },
  { code:'gstr3b_m',   name:'GSTR-3B (Monthly)',           category:'GST',     months:ALL_MONTHS,   dueDay:20, freq:'Monthly',   note:'Summary return — 20th of the following month' },
  { code:'gstr3b_q',   name:'GSTR-3B (QRMP Quarterly)',    category:'GST',     months:[1,4,7,10],   dueDay:22, freq:'Quarterly', note:'QRMP — 22nd/24th by state category; defaults to 22nd' },
  { code:'pmt06',      name:'PMT-06 Challan (QRMP)',       category:'GST',     months:ALL_MONTHS,   dueDay:25, freq:'Monthly',   note:'Monthly tax payment for QRMP filers — 25th' },
  { code:'cmp08',      name:'CMP-08 (Composition)',        category:'GST',     months:[1,4,7,10],   dueDay:18, freq:'Quarterly', note:'Composition dealers — 18th after the quarter' },
  { code:'gstr7',      name:'GSTR-7 (GST TDS)',            category:'GST',     months:ALL_MONTHS,   dueDay:10, freq:'Monthly',   note:'GST TDS deductors — 10th' },
  { code:'gstr6',      name:'GSTR-6 (ISD)',                category:'GST',     months:ALL_MONTHS,   dueDay:13, freq:'Monthly',   note:'Input Service Distributor — 13th' },
  { code:'gstr4',      name:'GSTR-4 (Composition Annual)', category:'GST',     months:[4],          dueDay:30, freq:'Annually',  note:'Composition annual return — 30 April' },
  { code:'gstr9',      name:'GSTR-9 / 9C (Annual)',        category:'GST',     months:[12],         dueDay:31, freq:'Annually',  note:'GST annual return — 31 December' },
  // ── TDS / TCS ──
  { code:'tds_pay',    name:'TDS / TCS Payment',           category:'TDS',     months:ALL_MONTHS,   dueDay:7,  freq:'Monthly',   note:'Monthly deposit — 7th (March deposit is due 30 April)' },
  { code:'tds_return', name:'TDS Return (24Q/26Q/27Q)',    category:'TDS',     months:[5,7,10,1],   dueDay:31, freq:'Quarterly', note:'Quarterly returns — 31 May / 31 Jul / 31 Oct / 31 Jan' },
  { code:'tcs_return', name:'TCS Return (27EQ)',           category:'TDS',     months:[5,7,10,1],   dueDay:15, freq:'Quarterly', note:'Quarterly TCS returns — 15th' },
  { code:'form16',     name:'Form 16 Issuance',            category:'TDS',     months:[6],          dueDay:15, freq:'Annually',  note:'Salary TDS certificates — 15 June' },
  { code:'form16a',    name:'Form 16A Issuance',           category:'TDS',     months:[8,11,2,6],   dueDay:15, freq:'Quarterly', note:'Non-salary TDS certificates — 15th after each quarter' },
  // ── Income Tax ──
  { code:'adv_tax',    name:'Advance Tax Instalment',      category:'Income Tax', months:[6,9,12,3], dueDay:15, freq:'Quarterly', note:'15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%)' },
  { code:'itr_nonaud', name:'ITR Filing (Non-Audit)',      category:'Income Tax', months:[7],        dueDay:31, freq:'Annually',  note:'Individuals/HUF without audit — 31 July' },
  { code:'itr_audit',  name:'ITR Filing (Audit Case)',     category:'Income Tax', months:[10],       dueDay:31, freq:'Annually',  note:'Audit cases — 31 October' },
  { code:'tax_audit',  name:'Tax Audit Report (3CA/3CD)',  category:'Income Tax', months:[9],        dueDay:30, freq:'Annually',  note:'Tax audit report — 30 September' },
  // ── ROC / MCA ──
  { code:'aoc4',       name:'AOC-4 (Financials)',          category:'ROC',     months:[10],         dueDay:30, freq:'Annually',  note:'Within 30 days of AGM — typically 30 October' },
  { code:'mgt7',       name:'MGT-7 (Annual Return)',       category:'ROC',     months:[11],         dueDay:29, freq:'Annually',  note:'Within 60 days of AGM — typically 29 November' },
  { code:'dir3kyc',    name:'DIR-3 KYC',                   category:'ROC',     months:[9],          dueDay:30, freq:'Annually',  note:'Director KYC — 30 September' },
  { code:'dpt3',       name:'DPT-3 (Deposits Return)',     category:'ROC',     months:[6],          dueDay:30, freq:'Annually',  note:'30 June' },
  { code:'llp11',      name:'LLP Form 11 (Annual Return)', category:'ROC',     months:[5],          dueDay:30, freq:'Annually',  note:'LLP annual return — 30 May' },
  { code:'llp8',       name:'LLP Form 8 (Statement)',      category:'ROC',     months:[10],         dueDay:30, freq:'Annually',  note:'LLP statement of account — 30 October' },
  // ── Payroll ──
  { code:'pf_esi',     name:'PF & ESI Payment',            category:'PF/ESI',  months:ALL_MONTHS,   dueDay:15, freq:'Monthly',   note:'Provident Fund & ESI — 15th' },
  { code:'ptax',       name:'Professional Tax (Salaries)', category:'PF/ESI',  months:ALL_MONTHS,   dueDay:10, freq:'Monthly',   note:'Varies by state — defaults to 10th' }
];

app.get('/api/statutory/catalog', auth, staffOnly, (req, res) => {
  res.json({
    catalog: STATUTORY_CATALOG,
    categories: [...new Set(STATUTORY_CATALOG.map(c => c.category))]
  });
});

// Apply selected statutory obligations to one or more clients — creates recurring templates
app.post('/api/statutory/apply', auth, staffOnly, (req, res) => {
  const { clientId, clientIds, memberId, memberName, reportingPersonId, reportingPersonName, codes } = req.body || {};
  const ids = (Array.isArray(clientIds) && clientIds.length) ? clientIds : (clientId ? [clientId] : []);
  if (!ids.length || !memberId) return res.status(400).json({ error: 'Client(s) and assignee are required.' });
  if (!Array.isArray(codes) || !codes.length) return res.status(400).json({ error: 'Select at least one obligation.' });
  const db = readDB();
  if (!db.recurringTemplates) db.recurringTemplates = [];
  let created = 0, skipped = 0;
  const createdNames = new Set();
  const now = new Date();
  ids.forEach(cid => {
    const client = (db.clients || []).find(c => c.id === cid);
    if (!client) return;
    const madeHere = [];
    codes.forEach(code => {
      const s = STATUTORY_CATALOG.find(x => x.code === code);
      if (!s) return;
      // Don't duplicate an obligation already set up for this client
      const dupe = db.recurringTemplates.some(t => t.clientId === cid && t.workType === s.name && t.active !== false);
      if (dupe) { skipped++; return; }
      const template = {
        id: newId(), clientId: cid, memberId, memberName: memberName || '',
        workType: s.name, priority: 'Normal',
        dueDayOfMonth: s.dueDay, months: s.months.slice(),
        frequency: s.freq,
        reportingPersonId: reportingPersonId || null, reportingPersonName: reportingPersonName || null,
        notes: s.note, statutoryCode: s.code, statutoryCategory: s.category,
        active: true,
        createdBy: req.user.id, createdByName: req.user.name,
        createdAt: new Date().toISOString()
      };
      db.recurringTemplates.push(template);
      generateMonthlyAssignment(db, template, now); // seed the current period if it's due this month
      created++; madeHere.push(s.name); createdNames.add(s.name);
    });
    if (madeHere.length) {
      logAudit(db, req, 'created', 'client', cid, client.name,
        `statutory calendar applied: ${madeHere.join(', ')}`);
    }
  });
  writeDB(db);
  res.json({ ok: true, created, skipped, clients: ids.length, obligations: [...createdNames] });
});

app.post('/api/recurring-templates/:id/generate', auth, (req, res) => {
  const db = readDB();
  const template = (db.recurringTemplates || []).find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found.' });
  const { month, year } = req.body;
  const date = month && year ? new Date(year, month - 1, 1) : new Date();
  const created = generateMonthlyAssignment(db, template, date);
  writeDB(db);
  if (created) res.json({ ok: true, message: 'Assignment generated.', assignment: created });
  else res.json({ ok: false, message: 'Assignment already exists for this month.' });
});

// Returns true if a recurringMonthKey is a valid period for the given frequency
function periodMatchesFrequency(key, freq) {
  if (!key) return false;
  freq = freq || 'Monthly';
  if (freq === 'Monthly')     return /^\d{4}-\d{2}$/.test(key);
  if (freq === 'Quarterly')   return /^\d{4}-Q[1-4]$/.test(key);
  if (freq === 'Half-Yearly') return /^\d{4}-H[12]$/.test(key);
  if (freq === 'Annually')    return /^\d{4}-ANN$/.test(key);
  return true;
}

function generateMonthlyAssignment(db, template, date) {
  const year = date.getFullYear(), month = date.getMonth();
  const freq = template.frequency || 'Monthly';
  let run = false, key = '';
  // `months` (1-12) lets a template run in exact months — used by the statutory
  // calendar (e.g. TDS returns in May/Jul/Oct/Jan). Falls back to the plain
  // frequency behaviour when absent, so existing templates are unaffected.
  if (Array.isArray(template.months) && template.months.length) {
    run = template.months.includes(month + 1);
    key = `${year}-${String(month+1).padStart(2,'0')}`;
  }
  else if (freq === 'Monthly')      { run = true;               key = `${year}-${String(month+1).padStart(2,'0')}`; }
  else if (freq === 'Quarterly')    { run = [0,3,6,9].includes(month); key = `${year}-Q${Math.floor(month/3)+1}`; }
  else if (freq === 'Half-Yearly')  { run = [0,6].includes(month);     key = `${year}-H${month<6?1:2}`; }
  else if (freq === 'Annually')     { run = month === 3;               key = `${year}-ANN`; }
  if (!run) return null;
  const monthKey = key;
  const exists = db.assignments.some(a => a.recurringTemplateId === template.id && a.recurringMonthKey === monthKey);
  if (exists) return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dueDay = Math.min(template.dueDayOfMonth, daysInMonth);
  const dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  const monthName = date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const assignment = { id: newId(), clientId: template.clientId, memberId: template.memberId, memberName: template.memberName, reportingPersonId: template.reportingPersonId, reportingPersonName: template.reportingPersonName, workType: template.workType, assignmentType: 'recurring', recurringTemplateId: template.id, recurringMonthKey: monthKey, frequency: template.frequency || 'Monthly', status: 'Pending', priority: template.priority || 'Normal', dueDate, originalDueDate: dueDate, notes: template.notes ? `${template.notes} — ${monthName}` : `Auto-generated for ${monthName}`, remark: '', completedAt: null, completedOnTime: null, createdAt: new Date().toISOString() };
  db.assignments.push(assignment);
  console.log(`✅ Recurring: ${template.workType} → ${template.memberName} — ${monthKey}`);
  return assignment;
}

function runMonthlyGeneration() {
  const db = readDB();
  const now = new Date();
  const templates = (db.recurringTemplates || []).filter(t => t.active);
  let count = 0;
  templates.forEach(t => { if (generateMonthlyAssignment(db, t, now)) count++; });
  if (count > 0) { writeDB(db); console.log(`🔄 Auto-generated ${count} recurring assignments`); }
}

// Find recurring assignments whose period no longer matches their template's frequency.
// Only PENDING/incomplete tasks are eligible for removal (completed history is preserved).
function findFrequencyMismatches(db) {
  const tmap = {};
  (db.recurringTemplates || []).forEach(t => { tmap[t.id] = t; });
  const tByAttr = {};
  (db.recurringTemplates || []).forEach(t => { tByAttr[t.clientId + '|' + t.workType + '|' + t.memberId] = t; });
  return (db.assignments || []).filter(a => {
    if (a.assignmentType !== 'recurring') return false;
    if (a.status === 'Completed') return false; // never touch completed
    let t = a.recurringTemplateId ? tmap[a.recurringTemplateId] : null;
    if (!t) t = tByAttr[a.clientId + '|' + a.workType + '|' + a.memberId];
    if (!t) return false; // no template governs this task — leave it alone
    // Determine the effective period key. If absent, derive from the due date.
    let key = a.recurringMonthKey;
    if (!key && a.dueDate) {
      const m = parseInt(a.dueDate.slice(5, 7), 10) - 1; // 0-based month
      const y = a.dueDate.slice(0, 4);
      const freq = t.frequency || 'Monthly';
      if (freq === 'Quarterly')        key = `${y}-Q${Math.floor(m/3)+1}`;
      else if (freq === 'Half-Yearly') key = `${y}-H${m<6?1:2}`;
      else if (freq === 'Annually')    key = `${y}-ANN`;
      else                             key = `${y}-${a.dueDate.slice(5,7)}`;
      // For non-monthly, a derived key only "matches" if the due month is a valid run month
      if (freq === 'Quarterly' && ![0,3,6,9].includes(m)) return true;   // due month not a quarter start
      if (freq === 'Half-Yearly' && ![0,6].includes(m))   return true;
      if (freq === 'Annually' && m !== 3)                 return true;
      return false; // derived key fits the frequency window
    }
    return !periodMatchesFrequency(key, t.frequency);
  });
}
// Preview mismatches (admin)
app.get('/api/recurring-cleanup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const tmap = {}; (db.recurringTemplates || []).forEach(t => { tmap[t.id] = t; });
  const tByAttr = {}; (db.recurringTemplates || []).forEach(t => { tByAttr[t.clientId + '|' + t.workType + '|' + t.memberId] = t; });
  const list = findFrequencyMismatches(db).map(a => {
    const cl = db.clients.find(c => c.id === a.clientId);
    let t = a.recurringTemplateId ? tmap[a.recurringTemplateId] : null;
    if (!t) t = tByAttr[a.clientId + '|' + a.workType + '|' + a.memberId];
    // Derive a display period from the key, or fall back to the due date's month
    let period = a.recurringMonthKey;
    if (!period && a.dueDate) period = a.dueDate.slice(0, 7);
    return { id: a.id, clientName: cl ? cl.name : '—', workType: a.workType, memberName: a.memberName,
      period: period || '(none)', dueDate: a.dueDate, status: a.status, frequency: t ? t.frequency : '—' };
  });
  res.json(list);
});
// Delete all pending frequency-mismatched recurring tasks (admin)
app.post('/api/recurring-cleanup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const ids = new Set(findFrequencyMismatches(db).map(a => a.id));
  const before = db.assignments.length;
  db.assignments = db.assignments.filter(a => !ids.has(a.id));
  writeDB(db);
  res.json({ ok: true, removed: before - db.assignments.length });
});

// Due Date Requests
app.get('/api/due-date-requests', auth, (req, res) => {
  const db = readDB();
  const reqs = db.dueDateRequests || [];
  if (req.user.role === 'admin') return res.json(reqs);
  res.json(reqs.filter(r => r.requestedBy === req.user.id || r.memberId === req.user.id));
});
app.post('/api/due-date-requests', auth, (req, res) => {
  const { assignmentId, requestedDueDate, reason } = req.body;
  if (!assignmentId || !requestedDueDate) return res.status(400).json({ error: 'Assignment and new due date required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id) return res.status(403).json({ error: 'Only Reporting Person can request due date changes.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const request = { id: newId(), assignmentId, clientName: client?.name || '—', workType: assignment.workType, memberName: assignment.memberName, memberId: assignment.memberId, currentDueDate: assignment.dueDate, requestedDueDate, reason: reason || '', requestedBy: req.user.id, requestedByName: req.user.name, status: 'pending', adminNote: '', createdAt: new Date().toISOString(), resolvedAt: null };
  if (!db.dueDateRequests) db.dueDateRequests = [];
  db.dueDateRequests.push(request);
  writeDB(db);
  res.json(request);
});
app.put('/api/due-date-requests/:id', auth, adminOnly, (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const db = readDB();
  const i = (db.dueDateRequests || []).findIndex(r => r.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Request not found.' });
  db.dueDateRequests[i].status = status;
  db.dueDateRequests[i].adminNote = adminNote || '';
  db.dueDateRequests[i].resolvedAt = new Date().toISOString();
  if (status === 'approved') { const ai = db.assignments.findIndex(a => a.id === db.dueDateRequests[i].assignmentId); if (ai > -1) { logDueDateChange(db, db.assignments[ai], db.assignments[ai].dueDate, db.dueDateRequests[i].requestedDueDate, req.user, 'request-approved'); db.assignments[ai].dueDate = db.dueDateRequests[i].requestedDueDate; } }
  writeDB(db);
  res.json(db.dueDateRequests[i]);
});

// Due-date change audit log (admin only), newest first
app.get('/api/due-date-log', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json([...(db.dueDateChangeLog || [])].sort((a, b) => new Date(b.date) - new Date(a.date)));
});

// Performance
app.get('/api/performance', auth, adminOnly, (req, res) => {
  const db = readDB();
  const performance = db.users.filter(u => u.role === 'member').map(m => {
    const myA = db.assignments.filter(a => a.memberId === m.id);
    const completed = myA.filter(a => a.status === 'Completed');
    const onTime = completed.filter(a => a.completedOnTime === true);
    const overdue = myA.filter(a => a.dueDate && new Date(a.dueDate+'T23:59:59') < new Date() && a.status !== 'Completed');
    return { memberId: m.id, memberName: m.name, designation: m.designation || '—', total: myA.length, completed: completed.length, completedOnTime: onTime.length, completedLate: completed.length - onTime.length, pending: myA.filter(a=>a.status==='Pending').length, inProgress: myA.filter(a=>['In Progress','Under Review'].includes(a.status)).length, overdue: overdue.length, performancePct: myA.length ? Math.round((onTime.length / myA.length) * 100) : 0, assignments: myA.map(a => { const cl = db.clients.find(c => c.id === a.clientId); return { clientName: cl?.name||'—', workType: a.workType, assignmentType: a.assignmentType||'onetime', status: a.status, priority: a.priority, dueDate: a.dueDate, originalDueDate: a.originalDueDate||a.dueDate, completedAt: a.completedAt, completedOnTime: a.completedOnTime, remark: a.remark||'' }; }) };
  });
  res.json(performance);
});

// Notifications
app.get('/api/notifications', auth, (req, res) => {
  const db = readDB();
  res.json((db.notifications||[]).filter(n=>n.toUserId===req.user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
});
app.post('/api/notifications', auth, (req, res) => {
  const { assignmentId, message } = req.body;
  if (!assignmentId) return res.status(400).json({ error: 'Assignment ID required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id) return res.status(403).json({ error: 'Only Reporting Person or Admin can send reminders.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const notif = { id: newId(), toUserId: assignment.memberId, toName: assignment.memberName, fromUserId: req.user.id, fromName: req.user.name, assignmentId, clientName: client?.name||'—', workType: assignment.workType, message: message?.trim() || 'Please update the status of your assignment.', read: false, createdAt: new Date().toISOString() };
  if (!db.notifications) db.notifications = [];
  db.notifications.push(notif);
  writeDB(db);
  // Also send push notification for reminder
  const pushPayload = {
    title: `🔔 Reminder from ${req.user.name}`,
    body: `📁 ${client?.name||'—'} — ${assignment.workType}\n💬 ${notif.message}`,
    tag: 'reminder-' + assignment.id + '-' + Date.now(),
    url: '/'
  };
  sendPushToUser(db, assignment.memberId, pushPayload).then(()=>{ const d=readDB(); writeDB(d); }).catch(err=>console.error('Reminder push error:',err));
  res.json(notif);
});
app.put('/api/notifications/:id/read', auth, (req, res) => {
  const db = readDB();
  const i = (db.notifications||[]).findIndex(n=>n.id===req.params.id&&n.toUserId===req.user.id);
  if (i===-1) return res.status(404).json({ error: 'Not found.' });
  db.notifications[i].read = true;
  writeDB(db);
  res.json(db.notifications[i]);
});
app.delete('/api/notifications/clear', auth, (req, res) => {
  const db = readDB();
  db.notifications = (db.notifications||[]).filter(n=>n.toUserId!==req.user.id);
  writeDB(db);
  res.json({ ok: true });
});

// Monthly Activity Report
app.get('/api/monthly-report', auth, adminOnly, (req, res) => {
  const db = readDB();
  const { month, year } = req.query;
  const now = new Date();
  const rYear = parseInt(year) || now.getFullYear();
  const rMonth = parseInt(month) || (now.getMonth() + 1); // 1-indexed
  const monthKey = `${rYear}-${String(rMonth).padStart(2,'0')}`;
  const monthStart = new Date(rYear, rMonth - 1, 1);
  const monthEnd = new Date(rYear, rMonth, 0, 23, 59, 59);

  const report = db.users.filter(u => u.role === 'member').map(m => {
    // All assignments for this member
    const myA = db.assignments.filter(a => a.memberId === m.id);
    const daysInMonth = new Date(rYear, rMonth, 0).getDate();

    const assignments = myA.map(a => {
      const cl = db.clients.find(c => c.id === a.clientId);
      // Filter activity log to this month
      const log = (a.activityLog || []).filter(l => {
        const d = new Date(l.date);
        return d >= monthStart && d <= monthEnd;
      }).sort((x, y) => new Date(x.date) - new Date(y.date));

      // Days since assigned
      const assignedDate = new Date(a.createdAt);
      const daysSinceAssigned = Math.floor((now - assignedDate) / (1000 * 60 * 60 * 24));

      // Detect backward updates
      const backwardUpdates = log.filter(l => l.isBackward);

      return {
        assignmentId: a.id,
        clientName: cl?.name || '—',
        workType: a.workType,
        assignmentType: a.assignmentType || 'onetime',
        status: a.status,
        currentPct: a.completionPct || 0,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        daysSinceAssigned,
        activityLog: log,
        backwardUpdates: backwardUpdates.length,
        totalUpdates: log.length
      };
    });

    // Build day-wise summary for this member this month
    const dayWise = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(rYear, rMonth - 1, d, 0, 0, 0);
      const dayEnd = new Date(rYear, rMonth - 1, d, 23, 59, 59);
      const dayUpdates = [];
      myA.forEach(a => {
        const cl = db.clients.find(c => c.id === a.clientId);
        const logs = (a.activityLog || []).filter(l => {
          const ld = new Date(l.date);
          return ld >= dayStart && ld <= dayEnd;
        });
        logs.forEach(l => dayUpdates.push({
          clientName: cl?.name || '—',
          workType: a.workType,
          status: l.status,
          completionPct: l.completionPct,
          prevPct: l.prevPct,
          remark: l.remark,
          isBackward: l.isBackward,
          time: l.date
        }));
      });
      if (dayUpdates.length > 0) dayWise.push({ day: d, date: `${rYear}-${String(rMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`, updates: dayUpdates });
    }

    return {
      memberId: m.id, memberName: m.name, designation: m.designation || '—',
      totalAssignments: myA.length,
      totalUpdatesThisMonth: assignments.reduce((s, a) => s + a.totalUpdates, 0),
      totalBackwardUpdates: assignments.reduce((s, a) => s + a.backwardUpdates, 0),
      assignments, dayWise
    };
  });

  res.json({ month: rMonth, year: rYear, monthKey, report });
});

// ── Push Notifications ────────────────────────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BAM7b-PNpQNQb-bsk-2W7DYzdyposuocVJ1yNBcQSJxXgY3wq9dBXGAITz0MDZ98u8NpWt9MLj8HPzfyI07cFbQ';

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

// Save push subscription for a user
app.post('/api/push-subscribe', auth, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const db = readDB();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];
  // Remove ALL old subscriptions for this user (replace with new one)
  db.pushSubscriptions = db.pushSubscriptions.filter(s => s.userId !== req.user.id);
  db.pushSubscriptions.push({
    userId: req.user.id,
    userName: req.user.name,
    endpoint: subscription.endpoint,
    subscription,
    createdAt: new Date().toISOString()
  });
  writeDB(db);
  console.log(`✅ Push subscription saved for ${req.user.name}`);
  res.json({ ok: true });
});

// Test push notification
app.post('/api/push-test', auth, async (req, res) => {
  const db = readDB();
  const targetId = req.body.userId || req.user.id;
  const subs = (db.pushSubscriptions || []).filter(s => s.userId === targetId);
  console.log(`Push test for user ${req.user.name}: ${subs.length} subscriptions found`);
  if (!subs.length) return res.json({ ok: false, message: 'No push subscription found. Please click "Enable Notifications" first.' });
  const payload = {
    title: '✅ GARP Notifications Active!',
    body: `Hi ${req.user.name}! You will now receive assignment alerts on this device.`,
    tag: 'test-push-' + Date.now(),
    url: '/'
  };
  try {
    await sendPushToUser(db, targetId, payload);
    writeDB(db);
    res.json({ ok: true, message: `Notification sent to ${subs.length} device(s)!` });
  } catch(e) {
    console.error('Push test error:', e);
    res.json({ ok: false, message: e.message });
  }
});

// Remove push subscription
app.post('/api/push-unsubscribe', auth, (req, res) => {
  const db = readDB();
  db.pushSubscriptions = (db.pushSubscriptions || []).filter(s => s.userId !== req.user.id);
  writeDB(db);
  res.json({ ok: true });
});

// Helper: send push to a specific user
async function sendPushToUser(db, userId, payload) {
  if (!webpush) return;
  const subs = (db.pushSubscriptions || []).filter(s => s.userId === userId);
  const deadEndpoints = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        deadEndpoints.push(sub.endpoint); // Expired subscription
      }
    }
  }
  // Clean up dead subscriptions
  if (deadEndpoints.length > 0) {
    db.pushSubscriptions = (db.pushSubscriptions || []).filter(s =>
      !deadEndpoints.includes(s.endpoint)
    );
  }
}

// Unified helper: create an in-app notification AND send a push to a user
function notifyUser(db, userId, { title, message, type, assignmentId, clientName, workType, url }) {
  if (!userId) return;
  if (!db.notifications) db.notifications = [];
  const user = (db.users || []).find(u => u.id === userId);
  const notif = {
    id: newId(), toUserId: userId, toName: user ? user.name : '',
    fromUserId: 'system', fromName: 'System',
    type: type || 'event',
    assignmentId: assignmentId || null,
    clientName: clientName || '', workType: workType || '',
    message: message || title || 'Update', title: title || 'Notification',
    read: false, createdAt: new Date().toISOString()
  };
  db.notifications.push(notif);
  sendPushToUser(db, userId, { title: title || 'GARP', body: message || '', tag: (type||'evt') + '-' + (assignmentId||newId()), url: url || '/' }).catch(() => {});
  return notif;
}

// ── Stale-remark check: notify members who haven't updated a task for 2+ full days ──
function runStaleRemarkCheck() {
  const db = readDB();
  const now = new Date();
  const today = todayStr();
  if (!db.staleRemarkLog) db.staleRemarkLog = [];
  // keep only today's sent-records so we notify at most once/day/task
  db.staleRemarkLog = db.staleRemarkLog.filter(k => k.endsWith(today));
  let changed = false;
  (db.assignments || []).forEach(a => {
    if (!a.memberId) return;
    if (a.status === 'Completed' || a.status === 'Hold') return;
    // last update = latest activityLog entry, else createdAt
    const log = a.activityLog || [];
    const lastDateStr = log.length ? log[log.length - 1].date : a.createdAt;
    if (!lastDateStr) return;
    const last = new Date(lastDateStr);
    const days = Math.floor((now - last) / 864e5);
    // 2 full days with no update → from the 3rd day, remind once per day
    if (days >= 2) {
      const key = 'stale-' + a.id + '-' + today;
      if (!db.staleRemarkLog.includes(key)) {
        const cl = (db.clients || []).find(c => c.id === a.clientId);
        notifyUser(db, a.memberId, {
          title: '⏰ Update needed',
          message: `No update for ${days} days on ${cl ? cl.name : '—'} — ${a.workType}. Please update the remark/progress.`,
          type: 'stale-remark', assignmentId: a.id, clientName: cl ? cl.name : '—', workType: a.workType
        });
        db.staleRemarkLog.push(key);
        changed = true;
      }
    }
  });
  if (changed) writeDB(db);
}

// Reopen Requests (reporting manager requests admin to reopen completed task)
app.get('/api/reopen-requests', auth, (req, res) => {
  const db = readDB();
  const reqs = db.reopenRequests || [];
  if (req.user.role === 'admin') return res.json(reqs);
  res.json(reqs.filter(r => r.requestedBy === req.user.id || r.memberId === req.user.id));
});
app.post('/api/reopen-requests', auth, (req, res) => {
  const { assignmentId, reason } = req.body;
  if (!assignmentId) return res.status(400).json({ error: 'Assignment ID required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (assignment.status !== 'Completed') return res.status(400).json({ error: 'Assignment is not completed.' });
  // Only reporting manager can request reopen
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id)
    return res.status(403).json({ error: 'Only the Reporting Manager can request to reopen.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const request = {
    id: newId(), assignmentId, clientName: client?.name || '—', workType: assignment.workType,
    memberName: assignment.memberName, memberId: assignment.memberId,
    requestedBy: req.user.id, requestedByName: req.user.name,
    reason: reason || '', status: 'pending', adminNote: '',
    createdAt: new Date().toISOString(), resolvedAt: null
  };
  if (!db.reopenRequests) db.reopenRequests = [];
  db.reopenRequests.push(request);
  writeDB(db);
  res.json(request);
});
app.put('/api/reopen-requests/:id', auth, adminOnly, (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const db = readDB();
  const i = (db.reopenRequests || []).findIndex(r => r.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Request not found.' });
  db.reopenRequests[i].status = status;
  db.reopenRequests[i].adminNote = adminNote || '';
  db.reopenRequests[i].resolvedAt = new Date().toISOString();
  if (status === 'approved') {
    const ai = db.assignments.findIndex(a => a.id === db.reopenRequests[i].assignmentId);
    if (ai > -1) {
      db.assignments[ai].status = 'In Progress';
      db.assignments[ai].completedAt = null;
      db.assignments[ai].completedOnTime = null;
      db.assignments[ai].completionPct = db.assignments[ai].completionPct || 0;
    }
  }
  writeDB(db);
  res.json(db.reopenRequests[i]);
});

// ════════════════ LEAVE REQUESTS ════════════════
const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Leave Without Pay', 'Work from Home', 'Half Day', 'Comp Off', 'Casual', 'Sick', 'Earned', 'Unpaid', 'Other'];
// Which leave types are PAID (count toward salary) vs UNPAID
function isPaidLeaveType(t) {
  return ['Casual Leave','Sick Leave','Earned Leave','Casual','Sick','Earned','Paid','Comp Off'].includes(t);
}
app.get('/api/leave-requests', auth, (req, res) => {
  const db = readDB();
  const reqs = db.leaveRequests || [];
  if (req.user.role === 'admin') {
    // Admin may filter to a specific member's history (used by the profile view)
    if (req.query.userId) return res.json(reqs.filter(r => r.memberId === req.query.userId));
    return res.json(reqs);
  }
  res.json(reqs.filter(r => r.memberId === req.user.id));
});
app.post('/api/leave-requests', auth, (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admins do not apply for leave here.' });
  const { fromDate, toDate, type, reason } = req.body;
  if (!fromDate || !toDate) return res.status(400).json({ error: 'From and To dates required.' });
  const days = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1);
  const db = readDB();
  // Comp Off can only be taken against an available compensatory-off balance
  if (type === 'Comp Off') {
    const cb = getCompOffBalance(db, req.user.id);
    if (days > cb.available) return res.status(400).json({ error: `Insufficient comp-off balance. Available: ${cb.available} day(s).` });
  }
  const request = {
    id: newId(), memberId: req.user.id, memberName: req.user.name,
    fromDate, toDate, days, type: LEAVE_TYPES.includes(type) ? type : 'Other',
    reason: reason || '', status: 'pending', adminNote: '',
    createdAt: new Date().toISOString(), resolvedAt: null
  };
  if (!db.leaveRequests) db.leaveRequests = [];
  db.leaveRequests.push(request);
  // Notify all admins (push + in-app) so the leave shows up for approval
  (db.users || []).filter(u => u.role === 'admin').forEach(ad => {
    try {
      sendPushToUser(db, ad.id, { title: '🌴 New leave request', body: `${req.user.name} applied for ${request.type} (${days} day${days>1?'s':''}) from ${fromDate}`, tag: 'leave', url: '/' }).catch(()=>{});
      notifyUser(db, ad.id, { title: 'New leave request', message: `${req.user.name} applied for ${request.type} (${days} day${days>1?'s':''}), ${fromDate} to ${toDate}. Reason: ${reason || '—'}`, type: 'leave' });
    } catch(e) {}
  });
  writeDB(db);
  res.json(request);
});
app.put('/api/leave-requests/:id', auth, adminOnly, (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const db = readDB();
  const i = (db.leaveRequests || []).findIndex(r => r.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Request not found.' });
  const lr = db.leaveRequests[i];
  lr.status = status;
  lr.adminNote = adminNote || '';
  lr.resolvedAt = new Date().toISOString();
  // On approval, write attendance records for each day of the leave with the correct status
  if (status === 'approved') {
    if (!db.attendance) db.attendance = [];
    const T = lr.type;
    let attStatus;
    if (T === 'Work from Home') attStatus = 'Work from Home';
    else if (T === 'Half Day') attStatus = 'Half Day';
    else if (T === 'Casual Leave' || T === 'Casual') attStatus = 'Casual Leave';
    else if (T === 'Sick Leave' || T === 'Sick') attStatus = 'Sick Leave';
    else if (T === 'Earned Leave' || T === 'Earned') attStatus = 'Earned Leave';
    else if (T === 'Leave Without Pay' || T === 'Unpaid') attStatus = 'Leave Without Pay';
    else if (T === 'Comp Off') attStatus = 'Comp Off';
    else attStatus = 'Leave Without Pay';
    // Consume the earned compensatory offs backing this leave (oldest first)
    if (T === 'Comp Off') consumeCompOff(db, lr.memberId, lr.days, lr.id);
    const from = new Date(lr.fromDate), to = new Date(lr.toDate);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const ex = db.attendance.findIndex(a => a.userId === lr.memberId && a.date === ds);
      const rec = { id: newId(), userId: lr.memberId, userName: lr.memberName, date: ds, punchIn: null, punchOut: null, workHours: 0, status: attStatus, leaveId: lr.id, createdAt: new Date().toISOString() };
      if (ex > -1) db.attendance[ex] = { ...db.attendance[ex], ...rec, id: db.attendance[ex].id };
      else db.attendance.push(rec);
    }
  }
  logAudit(db, req, status, 'leave', lr.memberId, lr.memberName,
    `${lr.type} ${lr.fromDate} → ${lr.toDate} (${lr.days} day${lr.days > 1 ? 's' : ''})${adminNote ? '; note: ' + adminNote : ''}`);
  // Notify the member of the decision
  try {
    sendPushToUser(db, lr.memberId, { title: status === 'approved' ? '✅ Leave approved' : '❌ Leave rejected', body: `Your ${lr.type} (${lr.fromDate} to ${lr.toDate}) was ${status}.`, tag: 'leave', url: '/' }).catch(()=>{});
    notifyUser(db, lr.memberId, { title: `Leave ${status}`, message: `Your ${lr.type} from ${lr.fromDate} to ${lr.toDate} was ${status}.${adminNote ? ' Note: ' + adminNote : ''}`, type: 'leave' });
  } catch(e) {}
  writeDB(db);
  res.json(db.leaveRequests[i]);
});


// ── LEAVE REPORT (applied / approved / paid / unpaid) ─────────────────────────
function buildLeaveReport(db, opts) {
  opts = opts || {};
  const all = (db.leaveRequests || []).slice();
  const fromY = opts.year ? parseInt(opts.year) : null;
  const inYear = (r) => !fromY || (new Date(r.fromDate).getFullYear() === fromY || new Date(r.toDate).getFullYear() === fromY);
  const rows = all.filter(inYear);
  // per-employee summary
  const byUser = {};
  rows.forEach(r => {
    const k = r.memberId;
    if (!byUser[k]) byUser[k] = { userId: k, name: r.memberName, applied: 0, approved: 0, rejected: 0, pending: 0, paidDays: 0, unpaidDays: 0, appliedDays: 0, approvedDays: 0 };
    const u = byUser[k];
    u.applied++; u.appliedDays += (r.days || 0);
    if (r.status === 'approved') {
      u.approved++; u.approvedDays += (r.days || 0);
      if (isPaidLeaveType(r.type)) u.paidDays += (r.days || 0); else u.unpaidDays += (r.days || 0);
    } else if (r.status === 'rejected') u.rejected++;
    else u.pending++;
  });
  const summary = Object.values(byUser).sort((a, b) => a.name.localeCompare(b.name));
  const totals = summary.reduce((t, u) => ({
    applied: t.applied + u.applied, approved: t.approved + u.approved, rejected: t.rejected + u.rejected, pending: t.pending + u.pending,
    paidDays: t.paidDays + u.paidDays, unpaidDays: t.unpaidDays + u.unpaidDays, appliedDays: t.appliedDays + u.appliedDays, approvedDays: t.approvedDays + u.approvedDays
  }), { applied: 0, approved: 0, rejected: 0, pending: 0, paidDays: 0, unpaidDays: 0, appliedDays: 0, approvedDays: 0 });
  return { summary, totals, detail: rows.sort((a, b) => new Date(b.fromDate) - new Date(a.fromDate)) };
}

// Diagnostic: what leave data exists in each store (admin only)
app.get('/api/leave-diagnostic', auth, adminOnly, (req, res) => {
  const db = readDB();
  const oldLeaves = db.leaves || [];
  const newReqs = db.leaveRequests || [];
  res.json({
    oldStore: { count: oldLeaves.length, sample: oldLeaves.slice(0, 5).map(l => ({ id: l.id, who: l.memberName || l.userName, from: l.fromDate, to: l.toDate, type: l.type, status: l.status })) },
    newStore: { count: newReqs.length, migrated: newReqs.filter(r => r.migratedFromLeaves).length, sample: newReqs.slice(0, 5).map(r => ({ id: r.id, who: r.memberName, from: r.fromDate, to: r.toDate, type: r.type, status: r.status, migrated: !!r.migratedFromLeaves })) }
  });
});

// Manual trigger: run the old→new leave migration on demand (admin only)
app.post('/api/leave-migrate', auth, adminOnly, (req, res) => {
  const before = (readDB().leaveRequests || []).length;
  migrateOldLeaves();
  const db = readDB();
  const after = (db.leaveRequests || []).length;
  res.json({ ok: true, movedNow: after - before, totalInNewStore: after, oldStoreCount: (db.leaves || []).length });
});

app.get('/api/leave-report', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(buildLeaveReport(db, { year: req.query.year }));
});

app.get('/api/leave-report.xlsx', auth, adminOnly, (req, res) => {
  const db = readDB();
  const rep = buildLeaveReport(db, { year: req.query.year });
  const XLSX = require('xlsx');
  // Summary sheet
  const sHdr = ['Employee', 'Applications', 'Approved', 'Rejected', 'Pending', 'Approved Days', 'Paid Days', 'Unpaid Days'];
  const sAoa = [sHdr];
  rep.summary.forEach(u => sAoa.push([u.name, u.applied, u.approved, u.rejected, u.pending, u.approvedDays, u.paidDays, u.unpaidDays]));
  sAoa.push(['TOTAL', rep.totals.applied, rep.totals.approved, rep.totals.rejected, rep.totals.pending, rep.totals.approvedDays, rep.totals.paidDays, rep.totals.unpaidDays]);
  const ws1 = XLSX.utils.aoa_to_sheet(sAoa);
  ws1['!cols'] = [{wch:24},{wch:13},{wch:10},{wch:10},{wch:10},{wch:14},{wch:11},{wch:12}];
  // Detail sheet
  const dHdr = ['Employee', 'Type', 'Paid/Unpaid', 'From', 'To', 'Days', 'Status', 'Reason', 'Applied On', 'Admin Note'];
  const dAoa = [dHdr];
  rep.detail.forEach(r => dAoa.push([
    r.memberName, r.type, isPaidLeaveType(r.type) ? 'Paid' : 'Unpaid', r.fromDate, r.toDate, r.days,
    r.status, r.reason || '', r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '', r.adminNote || ''
  ]));
  const ws2 = XLSX.utils.aoa_to_sheet(dAoa);
  ws2['!cols'] = [{wch:24},{wch:16},{wch:12},{wch:12},{wch:12},{wch:7},{wch:11},{wch:40},{wch:13},{wch:30}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
  XLSX.utils.book_append_sheet(wb, ws2, 'All Applications');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="Leave_Report_${req.query.year || 'all'}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.post('/api/assignments/bulk-delete', auth, (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided.' });
  const db = readDB();
  let deleted = 0;
  ids.forEach(id => {
    const a = db.assignments.find(x => x.id === id);
    if (!a) return;
    const isAdmin = req.user.role === 'admin';
    const isCreator = a.subAssignedBy === req.user.id || a.reportingPersonId === req.user.id;
    if (isAdmin || isCreator) {
      db.assignments = db.assignments.filter(x => x.id !== id && x.parentAssignmentId !== id);
      deleted++;
    }
  });
  writeDB(db);
  res.json({ ok: true, deleted });
});

// ── ATTENDANCE ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
// FIRM RULES — the single source of truth for office policy.
// These used to be hardcoded constants. They are now editable under
// Settings → Rules, and the values below are only the fallback defaults.
// Anything marked "enforced" here genuinely drives the engine, so the number
// shown in the Rules tab is always the number the system applies. Rules that
// cannot be automated live in `policySections` as plain text.
// ═══════════════════════════════════════════════════════════
const DEFAULT_RULES = {
  // ── Office timing (enforced) ──
  officeIn: '09:30',            // day starts
  officeOut: '18:30',           // day ends
  lateGrace: '10:00',           // punch in after this = Late
  lunchStart: '13:30',
  lunchEnd: '14:15',
  // ── Attendance (enforced) ──
  // Required hours differ by role: Chartered Accountants and Partners do 8,
  // everyone else 9. fullDayHours is the "everyone else" figure.
  fullDayHours: 9,              // >= this = full day (articles / staff / CS)
  fullDayHoursCA: 8,            // >= this = full day for CAs and Partners
  halfDayHours: 4.5,            // >= this but < full day = half day; below = absent
  lateMarksPerHalfDay: 3,       // N late marks in a month = 1 half-day deduction (reported)
  // ── Weekly off (enforced) ──
  sundayOff: true,
  weekOffSaturdays: [2, 4],     // which Saturdays of the month are holidays
  // ── Leave (enforced) ──
  paidLeavesPerYear: 18,        // accrues monthly = /12
  joiningCutoffDay: 15,         // joined on/before this day => that month accrues
  carryForwardMax: 0,           // days carried into the next year (0 = lapse)
  leaveNoticeDays: 3,           // planned leave should be applied this many days ahead
  maxConsecutiveLeave: 0,       // 0 = no cap
  sandwichRule: false,          // holidays falling between leave days count as leave
  // ── Compensatory off (enforced) ──
  compOffEnabled: true,
  compOffExpiryDays: 90,        // 0 = never expires
  // ── Notice period (documented) ──
  probationMonths: 6,
  noticeDuringProbation: 15,
  noticeAfterConfirmation: 60,
  // ── Free-text policy the system cannot enforce ──
  policySections: [],           // [{ title, body }]
  updatedAt: '', updatedBy: ''
};
let _rulesCache = null;
function getRules(db) {
  if (db && db.rules) return { ...DEFAULT_RULES, ...db.rules };
  if (!_rulesCache) { try { _rulesCache = { ...DEFAULT_RULES, ...((readDB().rules) || {}) }; } catch (e) { _rulesCache = { ...DEFAULT_RULES }; } }
  return _rulesCache;
}
function invalidateRules() { _rulesCache = null; }

// Kept as fallbacks so nothing breaks if a rule is blank
const OFFICE_IN  = '09:30';
const OFFICE_OUT = '18:30';
const LATE_GRACE = '10:00';
const MIN_HOURS  = 9;

function todayStr() {
  return new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}); // YYYY-MM-DD in IST
}
function timeStr() {
  return new Date().toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', hour12:false});
}
function calcHours(inT, outT) {
  if (!inT || !outT) return 0;
  const [ih,im] = inT.split(':').map(Number);
  const [oh,om] = outT.split(':').map(Number);
  return Math.max(0, ((oh*60+om)-(ih*60+im))/60);
}
// Required hours for a full day depend on who it is:
// Chartered Accountants and Partners = 8h, everyone else = 9h (both editable in Rules).
function fullDayHoursFor(db, userId) {
  const R = getRules(db);
  const u = (db && db.users || []).find(x => x.id === userId);
  const desig = String((u && u.designation) || '').toLowerCase();
  const qual  = String((u && u.qualification) || 'CA').toUpperCase();
  const isCaOrPartner = qual === 'CA' || desig.includes('partner');
  return isCaOrPartner ? (num(R.fullDayHoursCA) || 8) : (num(R.fullDayHours) || MIN_HOURS);
}
function calcStatus(punchIn, punchOut, workHours, db, userId) {
  const R = getRules(db);
  const full = userId ? fullDayHoursFor(db, userId) : (num(R.fullDayHours) || MIN_HOURS);
  const half = num(R.halfDayHours) || 0;
  const grace = R.lateGrace || LATE_GRACE;
  if (!punchIn) return 'Absent';
  if (punchOut && half && workHours < half) return 'Absent';       // too short to count as a half day
  if (punchOut && workHours < full) return 'Half Day';
  return punchIn > grace ? 'Late' : 'Present';
}
// legacy signature kept for safety
function calcStatusLegacy(punchIn, punchOut, workHours) {
  if (!punchIn) return 'Absent';
  if (punchOut && workHours < MIN_HOURS) return 'Half Day';
  if (punchOut) return punchIn > LATE_GRACE ? 'Late' : 'Present';
  return punchIn > LATE_GRACE ? 'Late' : 'Present';
}

// 2nd and 4th Saturdays are FIXED HOLIDAYS; 1st, 3rd and 5th Saturdays are working days.
// Which Saturdays are weekly offs is a firm rule (default 2nd & 4th)
function isSecondOrFourthSaturday(dateStr, db) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return false;               // Not Saturday
  const nth = Math.ceil(d.getDate() / 7);           // which Saturday of the month
  const list = (getRules(db).weekOffSaturdays || [2, 4]).map(Number);
  return list.includes(nth);
}

function isSaturdayWorking(dateStr, db) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return null;                // Not Saturday
  return !isSecondOrFourthSaturday(dateStr, db);    // true = working
}

// A date the firm has marked as a GARP holiday (festival / government / other)
function isCompanyHoliday(dateStr, db) {
  const list = (db && db.holidays) || [];
  return list.some(h => h.date === dateStr);
}

// Reason a day is off, or null if it is a working day
function nonWorkingReason(dateStr, db) {
  const R = getRules(db);
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 0 && R.sundayOff !== false) return 'Sunday';
  if (isSecondOrFourthSaturday(dateStr, db)) return 'Saturday Off';
  const h = ((db && db.holidays) || []).find(x => x.date === dateStr);
  if (h) return h.name || 'Holiday';
  return null;
}

function isWorkingDay(dateStr, db) {
  return nonWorkingReason(dateStr, db) === null;
}

// Who is included in attendance & payroll:
//  - role must be 'member'
//  - excludes Partners / Managing Partners (by designation)
//  - only Greater Noida (HO) employees
function isAttendanceMember(u) {
  if (!u || u.role !== 'member') return false;
  const desig = (u.designation || '').toLowerCase();
  if (desig.includes('partner')) return false;            // excludes "Partner" and "Managing Partner"
  const branch = (u.branch || '').toLowerCase();
  if (!branch.includes('greater noida')) return false;    // only Greater Noida (HO)
  return true;
}

function getLeaveBalance(db, userId, year) {
  const R = getRules(db);
  const now = new Date();
  const curYear = year || now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const user = (db.users || []).find(u => u.id === userId);
  const cutoff = num(R.joiningCutoffDay) || 15;

  // Calculate months eligible based on joining date
  let eligibleMonths = curMonth;
  if (user?.joiningDate) {
    const jDate = new Date(user.joiningDate);
    if (jDate.getFullYear() === curYear) {
      const joinMonth = jDate.getMonth() + 1;
      const joinDay = jDate.getDate();
      // Joined on/before the cut-off day => that month accrues; else from next month
      eligibleMonths = curMonth - joinMonth + (joinDay <= cutoff ? 1 : 0);
      eligibleMonths = Math.max(0, eligibleMonths);
    } else if (jDate.getFullYear() > curYear) {
      eligibleMonths = 0;
    }
  }

  // Monthly accrual comes straight from the "paid leaves per year" rule
  const perMonth = (num(R.paidLeavesPerYear) || 18) / 12;
  const accrued = parseFloat((eligibleMonths * perMonth).toFixed(1));

  // Opening balance added by admin
  const openingLeave = parseFloat(user?.openingLeave) || 0;

  // Manual adjustments by admin
  const adjustments = (db.leaves || []).filter(l =>
    l.userId === userId && l.type === 'Adjustment' && l.status === 'approved' &&
    new Date(l.fromDate).getFullYear() === curYear
  ).reduce((s, l) => s + (l.days || 0), 0);

  const totalAccrued = parseFloat((accrued + openingLeave + adjustments).toFixed(1));

  // Used: approved paid leaves this year
  const used = (db.leaves || []).filter(l =>
    l.userId === userId && l.status === 'approved' &&
    l.type === 'Paid' && new Date(l.fromDate).getFullYear() === curYear
  ).reduce((s, l) => s + (l.days || 0), 0);

  return {
    accrued: totalAccrued,
    used: parseFloat(used.toFixed(1)),
    remaining: parseFloat((totalAccrued - used).toFixed(1)),
    openingLeave,
    adjustments: parseFloat(adjustments.toFixed(1))
  };
}

// Punch In
app.post('/api/attendance/punch-in', auth, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const _cfg = db.settings || {};
  const sv = req.body && req.body.siteVisit ? req.body.siteVisit : null;
  if (_cfg.mobileOnlyPunch) {
    const ua = req.headers['user-agent'] || '';
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua))
      return res.status(403).json({ error: 'MOBILE_REQUIRED', message: 'Please punch in from your mobile device.' });
  }
  if (_cfg.wifiCheckEnabled && (_cfg.officeIPs||[]).length) {
    const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || '';
    const onWifi = _cfg.officeIPs.some(p => ip.startsWith(p.trim()));
    // Off office WiFi: allow only if the user logs a site visit
    if (!onWifi && !sv)
      return res.status(403).json({ error: 'NOT_ON_WIFI', message: 'You are outside the office. Log a site visit to punch in.', needsSiteVisit: true });
  }
  const today = todayStr();
  const existing = db.attendance.find(a => a.userId === req.user.id && a.date === today);
  if (existing && existing.punchIn) return res.status(400).json({ error: 'Already punched in today at ' + existing.punchIn });
  const now = timeStr();
  const _R = getRules(db);
  const isLate = now > (_R.lateGrace || LATE_GRACE);
  const holidayReason = nonWorkingReason(today, db);   // non-null => working on a holiday / weekly off
  if (existing) {
    existing.punchIn = now; existing.isLate = isLate;
    if (holidayReason) { existing.holidayWork = true; existing.holidayName = holidayReason; }
    if (sv) { existing.offSite = true; existing.status = 'Site Visit'; }
  } else {
    db.attendance.push({ id: newId(), userId: req.user.id, userName: req.user.name, date: today, punchIn: now, punchOut: null, workHours: 0, status: sv ? 'Site Visit' : 'Present', isLate, offSite: !!sv, holidayWork: !!holidayReason, holidayName: holidayReason || '', createdAt: new Date().toISOString() });
  }
  // Working on a holiday / weekly off earns a compensatory off (full day until punch-out says otherwise)
  let compOffMsg = '';
  if (holidayReason && _R.compOffEnabled !== false) {
    creditCompOff(db, req.user, today, 1);
    compOffMsg = ' You are working on a holiday (' + holidayReason + ') — a compensatory off has been credited.';
  }
  // Record the site visit if provided
  if (sv) {
    if (!db.siteVisits) db.siteVisits = [];
    const cl = sv.clientId ? (db.clients || []).find(c => c.id === sv.clientId) : null;
    db.siteVisits.push({
      id: newId(), userId: req.user.id, userName: req.user.name,
      date: today, type: 'punch-in',
      site: sv.site || '', clientId: sv.clientId || '', clientName: cl ? cl.name : (sv.clientName || ''),
      purpose: sv.purpose || '', notes: sv.notes || '', time: now, createdAt: new Date().toISOString()
    });
  }
  writeDB(db);
  res.json({ ok: true, punchIn: now, isLate, offSite: !!sv, holidayWork: !!holidayReason, holidayName: holidayReason || '', message: (isLate ? `Late punch in at ${now} (office starts ${_R.officeIn || OFFICE_IN})` : `Punched in at ${now} ✓`) + compOffMsg });
});

// Punch Out
app.post('/api/attendance/punch-out', auth, (req, res) => {
  const db = readDB();
  const _cfg = db.settings || {};
  const sv = req.body && req.body.siteVisit ? req.body.siteVisit : null;
  if (_cfg.mobileOnlyPunch) {
    const ua = req.headers['user-agent'] || '';
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua))
      return res.status(403).json({ error: 'MOBILE_REQUIRED', message: 'Please punch out from your mobile device.' });
  }
  if (_cfg.wifiCheckEnabled && (_cfg.officeIPs||[]).length) {
    const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || '';
    const onWifi = _cfg.officeIPs.some(p => ip.startsWith(p.trim()));
    if (!onWifi && !sv)
      return res.status(403).json({ error: 'NOT_ON_WIFI', message: 'You are outside the office. Log a site visit to punch out.', needsSiteVisit: true });
  }
  const today = todayStr();
  const rec = db.attendance.find(a => a.userId === req.user.id && a.date === today);
  if (!rec || !rec.punchIn) return res.status(400).json({ error: 'Please punch in first.' });
  if (rec.punchOut) return res.status(400).json({ error: 'Already punched out today at ' + rec.punchOut });
  const now = timeStr();
  rec.punchOut = now;
  rec.workHours = parseFloat(calcHours(rec.punchIn, now).toFixed(2));
  const _RO = getRules(db);
  rec.isEarlyLeave = now < (_RO.officeOut || OFFICE_OUT);
  // Site visits (logged at punch-in or now) keep their Site Visit status; don't overwrite with Present/Late
  if (rec.offSite || sv) {
    rec.offSite = true;
    rec.status = 'Site Visit';
  } else {
    rec.status = calcStatus(rec.punchIn, now, rec.workHours, db, req.user.id);
  }
  // Worked on a holiday / weekly off: a full day earns 1 comp-off, a short day earns 0.5.
  // "Full day" is that person's own requirement (8h for CA/Partner, 9h otherwise).
  if (nonWorkingReason(today, db) && _RO.compOffEnabled !== false) {
    creditCompOff(db, req.user, today, rec.workHours >= fullDayHoursFor(db, req.user.id) ? 1 : 0.5);
  }
  if (sv) {
    rec.offSite = true;
    if (!db.siteVisits) db.siteVisits = [];
    const cl = sv.clientId ? (db.clients || []).find(c => c.id === sv.clientId) : null;
    db.siteVisits.push({
      id: newId(), userId: req.user.id, userName: req.user.name,
      date: today, type: 'punch-out',
      site: sv.site || '', clientId: sv.clientId || '', clientName: cl ? cl.name : (sv.clientName || ''),
      purpose: sv.purpose || '', notes: sv.notes || '', time: now, createdAt: new Date().toISOString()
    });
  }
  writeDB(db);
  res.json({ ok: true, punchIn: rec.punchIn, punchOut: now, workHours: rec.workHours, status: rec.status, isEarlyLeave: rec.isEarlyLeave });
});

// Get attendance (admin sees all, member sees own)
app.get('/api/attendance', auth, (req, res) => {
  const db = readDB();
  if (!db.attendance) return res.json([]);
  const { month, year, userId } = req.query;
  let data = db.attendance;
  if (req.user.role !== 'admin') data = data.filter(a => a.userId === req.user.id);
  else if (userId) data = data.filter(a => a.userId === userId);
  if (month && year) data = data.filter(a => a.date.startsWith(`${year}-${String(month).padStart(2,'0')}`));
  else if (year) data = data.filter(a => a.date.startsWith(year));
  res.json(data.sort((a,b) => b.date.localeCompare(a.date)));
});

// Get today's attendance for current user
app.get('/api/attendance/today', auth, (req, res) => {
  const db = readDB();
  const today = todayStr();
  const rec = (db.attendance || []).find(a => a.userId === req.user.id && a.date === today);
  res.json(rec || null);
});

// Admin: manually mark attendance
app.post('/api/attendance/mark', auth, payrollAccess, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const { userId, date, status, punchIn, punchOut, notes, remark } = req.body;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const existing = db.attendance.findIndex(a => a.userId === userId && a.date === date);
  const rec = { id: newId(), userId, userName: user.name, date, status: status || 'Present', punchIn: punchIn || null, punchOut: punchOut || null, workHours: punchIn && punchOut ? parseFloat(calcHours(punchIn,punchOut).toFixed(2)) : 0, notes: notes || '', remark: (remark !== undefined ? remark : (notes || '')), markedByAdmin: true, createdAt: new Date().toISOString() };
  if (existing > -1) db.attendance[existing] = { ...db.attendance[existing], ...rec, id: db.attendance[existing].id };
  else db.attendance.push(rec);
  logAudit(db, req, existing > -1 ? 'updated' : 'created', 'attendance', userId, user.name,
    `${date} marked ${rec.status}${rec.punchIn ? ' in ' + rec.punchIn : ''}${rec.punchOut ? ' out ' + rec.punchOut : ''}`);
  writeDB(db);
  res.json(rec);
});

// Set/update a private remark (hidden comment) on an attendance record. Admin/HR only.
app.put('/api/attendance/remark', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const { userId, date, remark } = req.body || {};
  if (!userId || !date) return res.status(400).json({ error: 'userId and date required.' });
  if (!db.attendance) db.attendance = [];
  let idx = db.attendance.findIndex(a => a.userId === userId && a.date === date);
  if (idx === -1) {
    // create a stub record so a remark can be attached even if the day has no attendance yet
    const user = db.users.find(u => u.id === userId);
    db.attendance.push({ id: newId(), userId, userName: user ? user.name : '', date, status: 'Absent', punchIn: null, punchOut: null, workHours: 0, createdAt: new Date().toISOString() });
    idx = db.attendance.length - 1;
  }
  db.attendance[idx].remark = (remark || '').toString().slice(0, 500);
  db.attendance[idx].remarkBy = req.user.name;
  db.attendance[idx].remarkAt = new Date().toISOString();
  logAudit(db, req, 'updated', 'attendance', db.attendance[idx].userId, db.attendance[idx].userName,
    `${db.attendance[idx].date} remark set: "${db.attendance[idx].remark || '—'}"`);
  writeDB(db);
  res.json({ ok: true, remark: db.attendance[idx].remark });
});

// ── ADMIN: edit or delete a specific punch/attendance record ──────────────────
// Edit punch-in/out, status, remark and recompute hours. Identified by record id OR userId+date.
app.put('/api/attendance/record', auth, adminOrHr, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const { id, userId, date, punchIn, punchOut, status, remark } = req.body || {};
  let idx = -1;
  if (id) idx = db.attendance.findIndex(a => a.id === id);
  if (idx === -1 && userId && date) idx = db.attendance.findIndex(a => a.userId === userId && a.date === date);
  if (idx === -1) {
    // create the record if it doesn't exist yet (e.g. fixing a forgotten punch)
    if (!userId || !date) return res.status(400).json({ error: 'Provide id, or userId and date.' });
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    db.attendance.push({ id: newId(), userId, userName: user.name, date, status: 'Present', punchIn: null, punchOut: null, workHours: 0, createdAt: new Date().toISOString() });
    idx = db.attendance.length - 1;
  }
  const rec = db.attendance[idx];
  const _aBefore = { ...rec }; // snapshot for the audit trail
  const norm = t => { if (t === undefined) return undefined; if (t === null || t === '') return null; const m = String(t).match(/^(\d{1,2}):(\d{2})$/); return m ? (m[1].padStart(2,'0') + ':' + m[2]) : rec.punchIn; };
  if (punchIn !== undefined) rec.punchIn = norm(punchIn);
  if (punchOut !== undefined) rec.punchOut = norm(punchOut);
  if (status !== undefined && status) rec.status = status;
  if (remark !== undefined) rec.remark = String(remark).slice(0, 500);
  // recompute hours + late flag
  rec.workHours = (rec.punchIn && rec.punchOut) ? parseFloat(calcHours(rec.punchIn, rec.punchOut).toFixed(2)) : 0;
  if (rec.punchIn) rec.isLate = rec.punchIn > (getRules(db).lateGrace || LATE_GRACE);
  rec.editedByAdmin = req.user.name;
  rec.editedAt = new Date().toISOString();
  const _aChanged = diffFields(_aBefore, rec, ['punchIn','punchOut','status','remark','workHours']);
  logAudit(db, req, 'updated', 'attendance', rec.userId, rec.userName,
    `${rec.date} — ${_aChanged || 'no field change'}`);
  writeDB(db);
  res.json({ ok: true, record: rec });
});

// Delete an attendance record (admin only). By id, or userId+date.
app.delete('/api/attendance/record', auth, adminOrHr, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const id = req.query.id || (req.body && req.body.id);
  const userId = req.query.userId || (req.body && req.body.userId);
  const date = req.query.date || (req.body && req.body.date);
  const before = db.attendance.length;
  const _gone = db.attendance.find(a => id ? a.id === id : (a.userId === userId && a.date === date));
  if (id) db.attendance = db.attendance.filter(a => a.id !== id);
  else if (userId && date) db.attendance = db.attendance.filter(a => !(a.userId === userId && a.date === date));
  else return res.status(400).json({ error: 'Provide id, or userId and date.' });
  // also clear any linked site-visit log entry for that day (so it doesn't re-create on backfill)
  if (userId && date) db.siteVisits = (db.siteVisits || []).filter(v => !(v.userId === userId && v.date === date));
  if (_gone) logAudit(db, req, 'deleted', 'attendance', _gone.userId, _gone.userName,
    `${_gone.date} record removed (was ${_gone.status || '—'}${_gone.punchIn ? ', in ' + _gone.punchIn : ''}${_gone.punchOut ? ', out ' + _gone.punchOut : ''})`);
  writeDB(db);
  res.json({ ok: true, deleted: before - db.attendance.length });
});

// ── BUSINESS DEVELOPMENT (Leads) ─────────────────────────────────────────────
const LEAD_STATUSES = ['Generated POC', 'Contacted POC', 'Fixed Meeting with POC', 'Met with POC', 'Got the Assignment', 'Lost the Assignment'];

app.get('/api/leads', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const leads = (db.leads || []).slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ leads, statuses: LEAD_STATUSES });
});

app.post('/api/leads', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  if (!db.leads) db.leads = [];
  const { name, poc, pocDesignation, status, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Lead name is required.' });
  const st = LEAD_STATUSES.includes(status) ? status : 'Generated POC';
  const now = new Date().toISOString();
  const lead = {
    id: newId(),
    name: String(name).trim(),
    poc: (poc || '').trim(),
    pocDesignation: (pocDesignation || '').trim(),
    status: st,
    createdBy: req.user.id, createdByName: req.user.name,
    createdAt: now, updatedAt: now,
    events: [{ id: newId(), type: 'created', status: st, note: (note || '').trim(), byId: req.user.id, byName: req.user.name, date: now }]
  };
  db.leads.push(lead);
  writeDB(db);
  res.json(lead);
});

app.put('/api/leads/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const lead = (db.leads || []).find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const { name, poc, pocDesignation } = req.body || {};
  if (name !== undefined) lead.name = String(name).trim() || lead.name;
  if (poc !== undefined) lead.poc = String(poc).trim();
  if (pocDesignation !== undefined) lead.pocDesignation = String(pocDesignation).trim();
  lead.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(lead);
});

// Update status and/or add an event to the trail
app.post('/api/leads/:id/event', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const lead = (db.leads || []).find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const { status, note, date } = req.body || {};
  const now = new Date().toISOString();
  const evStatus = LEAD_STATUSES.includes(status) ? status : lead.status;
  const ev = {
    id: newId(),
    type: (status && status !== lead.status) ? 'status' : 'note',
    status: evStatus,
    note: (note || '').trim(),
    byId: req.user.id, byName: req.user.name,
    date: (date && !isNaN(new Date(date))) ? new Date(date).toISOString() : now
  };
  if (!lead.events) lead.events = [];
  lead.events.push(ev);
  if (status && LEAD_STATUSES.includes(status)) lead.status = status;
  lead.updatedAt = now;
  writeDB(db);
  res.json(lead);
});

app.delete('/api/leads/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const before = (db.leads || []).length;
  db.leads = (db.leads || []).filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true, deleted: before - (db.leads || []).length });
});

// ── Government Tenders (Business Development) ────────────────────────────────
// Standard bidder-side tender lifecycle (see e-procurement tender stages)
const TENDER_STATUSES = ['Identified', 'Bid Submitted', 'Technical Evaluation', 'Financial Bid Opened', 'Under Evaluation', 'Awarded', 'Lost', 'Cancelled / Retendered'];
const TENDER_CATEGORIES = ['psu_company', 'psu_bank'];

app.get('/api/tenders', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const tenders = (db.tenders || []).slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ tenders, statuses: TENDER_STATUSES, categories: TENDER_CATEGORIES });
});

app.post('/api/tenders', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  if (!db.tenders) db.tenders = [];
  const { category, psuName, tenderRef, natureOfWork, applicationDate, dueDate, tenderValue, quotationValue, emdAmount, emdStatus, source, tenderFee, bidOpeningDate, l1Value, partnerId, partnerName, status, note } = req.body || {};
  if (!psuName || !String(psuName).trim()) return res.status(400).json({ error: 'Name of PSU is required.' });
  const cat = TENDER_CATEGORIES.includes(category) ? category : 'psu_company';
  const st = TENDER_STATUSES.includes(status) ? status : 'Identified';
  // Partner following up — pre-filled with the logged-in user by default
  let pId = partnerId || req.user.id;
  let pName = (partnerName || '').trim();
  if (!pName) { const u = (db.users || []).find(x => x.id === pId); pName = u ? u.name : req.user.name; }
  const now = new Date().toISOString();
  const tender = {
    id: newId(),
    category: cat,
    psuName: String(psuName).trim(),
    tenderRef: (tenderRef || '').trim(),
    natureOfWork: (natureOfWork || '').trim(),
    applicationDate: applicationDate ? String(applicationDate).slice(0, 10) : '',
    dueDate: dueDate ? String(dueDate).slice(0, 10) : '',
    tenderValue: num(tenderValue),
    quotationValue: num(quotationValue),
    emdAmount: num(emdAmount),
    emdStatus: (emdStatus || '').trim(),
    source: (source || '').trim(),
    tenderFee: num(tenderFee),
    bidOpeningDate: bidOpeningDate ? String(bidOpeningDate).slice(0, 10) : '',
    l1Value: num(l1Value),
    partnerId: pId, partnerName: pName,
    status: st,
    createdBy: req.user.id, createdByName: req.user.name,
    createdAt: now, updatedAt: now,
    events: [{ id: newId(), type: 'created', status: st, note: (note || '').trim(), byId: req.user.id, byName: req.user.name, date: now }]
  };
  db.tenders.push(tender);
  writeDB(db);
  res.json(tender);
});

app.put('/api/tenders/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const t = (db.tenders || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender not found.' });
  const { category, psuName, tenderRef, natureOfWork, applicationDate, dueDate, tenderValue, quotationValue, emdAmount, emdStatus, source, tenderFee, bidOpeningDate, l1Value, partnerId, partnerName } = req.body || {};
  if (category !== undefined && TENDER_CATEGORIES.includes(category)) t.category = category;
  if (psuName !== undefined) t.psuName = String(psuName).trim() || t.psuName;
  if (tenderRef !== undefined) t.tenderRef = String(tenderRef).trim();
  if (natureOfWork !== undefined) t.natureOfWork = String(natureOfWork).trim();
  if (applicationDate !== undefined) t.applicationDate = applicationDate ? String(applicationDate).slice(0, 10) : '';
  if (dueDate !== undefined) t.dueDate = dueDate ? String(dueDate).slice(0, 10) : '';
  if (tenderValue !== undefined) t.tenderValue = num(tenderValue);
  if (quotationValue !== undefined) t.quotationValue = num(quotationValue);
  if (emdAmount !== undefined) t.emdAmount = num(emdAmount);
  if (emdStatus !== undefined) t.emdStatus = String(emdStatus).trim();
  if (source !== undefined) t.source = String(source).trim();
  if (tenderFee !== undefined) t.tenderFee = num(tenderFee);
  if (bidOpeningDate !== undefined) t.bidOpeningDate = bidOpeningDate ? String(bidOpeningDate).slice(0, 10) : '';
  if (l1Value !== undefined) t.l1Value = num(l1Value);
  if (partnerId !== undefined) {
    t.partnerId = partnerId;
    const u = (db.users || []).find(x => x.id === partnerId);
    t.partnerName = (partnerName || (u ? u.name : t.partnerName) || '').trim();
  } else if (partnerName !== undefined) {
    t.partnerName = String(partnerName).trim();
  }
  t.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(t);
});

// Add a remark / status change to the tender trail
app.post('/api/tenders/:id/event', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const t = (db.tenders || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender not found.' });
  const { status, note, date } = req.body || {};
  const now = new Date().toISOString();
  const evStatus = TENDER_STATUSES.includes(status) ? status : t.status;
  const ev = {
    id: newId(),
    type: (status && status !== t.status) ? 'status' : 'note',
    status: evStatus,
    note: (note || '').trim(),
    byId: req.user.id, byName: req.user.name,
    date: (date && !isNaN(new Date(date))) ? new Date(date).toISOString() : now
  };
  if (!t.events) t.events = [];
  t.events.push(ev);
  if (status && TENDER_STATUSES.includes(status)) t.status = status;
  t.updatedAt = now;
  writeDB(db);
  res.json(t);
});

app.delete('/api/tenders/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const before = (db.tenders || []).length;
  db.tenders = (db.tenders || []).filter(x => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true, deleted: before - (db.tenders || []).length });
});

// ═══════════════════════════════════════════════════════════
// IMPORT: ICAI Tender Monitoring Division opportunities
// https://tmdicai.org/Opportunities.php  (public listing, robots.txt has no rules)
// The parser works off TEXT markers ("Days are left", "Posted On:", "Address:")
// rather than CSS classes, so a restyle of their site won't break it. If they
// change the wording, the preview simply returns 0 rows (never a silent import).
// ═══════════════════════════════════════════════════════════
const ICAI_TMD_URL = 'https://tmdicai.org/Opportunities.php';
const MONTHS_ABBR = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
}
// "Jul, 17, 2026" -> "2026-07-17"
function parseTmdDate(s) {
  const m = String(s || '').match(/([A-Za-z]{3})[a-z]*\s*,?\s*(\d{1,2})\s*,?\s*(\d{4})/);
  if (!m) return '';
  const mo = MONTHS_ABBR[m[1].toLowerCase()];
  if (!mo) return '';
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
}
// Best-effort nature of work from the tender description
function inferNature(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('concurrent audit')) return 'Concurrent Audit';
  if (t.includes('statutory audit') || t.includes('statutory auditor')) return 'Statutory Audit';
  if (t.includes('internal audit') || t.includes('internal auditor')) return 'Internal Audit';
  if (t.includes('stock audit')) return 'Stock Audit';
  if (t.includes('forensic')) return 'Forensic Audit';
  if (t.includes('external audit')) return 'External Audit';
  if (t.includes('financial audit') || t.includes('financial statement')) return 'Financial Audit';
  if (t.includes('revenue audit')) return 'Revenue Audit';
  if (t.includes('empanel')) return 'Empanelment';
  if (t.includes('audit')) return 'Audit';
  return 'Others';
}
// PSU Banks vs PSU Companies — the two sub-tabs in Business Development
function inferCategory(name) {
  return /\bbank\b|sahakari|cooperative bank|co-operative bank/i.test(String(name || ''))
    ? 'psu_bank' : 'psu_company';
}

// Turn the listing HTML into records. Markup-independent by design.
function parseTmdOpportunities(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Preserve the "View PDF" link (unique per opportunity) as an inline text marker
  s = s.replace(/<a[^>]*href=["'][^"']*count1\.php\?pdf_id=([^"'&]+)[^"']*["'][^>]*>/gi, '\n@@PDF:$1@@\n');
  // Keep the post id too (used as a stable reference)
  s = s.replace(/href=["'][^"']*Post\.php\?postid=([^"'&=]+={0,2})["']/gi, '\n@@POST:$1@@\n');
  s = s.replace(/<(br|\/p|\/div|\/h\d|\/li|\/td|\/tr|\/span|\/a)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{2,}/g, '\n');

  const re = /([^\n]{4,200})\n(?:\s*)(\d+)\s+Days?\s+(?:are|is)\s+left\s*\n([A-Za-z]{3}[a-z]*\s*,?\s*\d{1,2}\s*,?\s*\d{4})\s*\n([\s\S]{0,1200}?)@@PDF:([^@\n]+)@@([\s\S]{0,1500}?)Posted On\s*:\s*([A-Za-z]{3}[a-z]*\s*,?\s*\d{1,2}\s*,?\s*\d{4})/g;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    const heading = m[1].trim();
    const daysLeft = parseInt(m[2], 10);
    const dueDate = parseTmdDate(m[3]);
    const description = m[4].replace(/@@POST:[^@\n]+@@/g, '').replace(/\s*\n\s*/g, ' ').trim();
    const pdfId = m[5].trim();
    const tail = m[6] || '';
    const postedOn = parseTmdDate(m[7]);
    const addrM = tail.match(/Address\s*:\s*([^\n]*)/i) || s.slice(m.index).match(/Address\s*:\s*([^\n]*)/i);
    const mailM = s.slice(m.index, m.index + 3000).match(/Email\s*:\s*([^\s\n]+@[^\s\n]+)/i);
    const postM = tail.match(/@@POST:([^@\n]+)@@/) || m[4].match(/@@POST:([^@\n]+)@@/);
    if (!heading || !dueDate) continue;
    // Heading is "Organisation, City, State" — the org is everything before the city
    const bits = heading.split(',').map(x => x.trim()).filter(Boolean);
    const orgName = bits.length > 2 ? bits.slice(0, bits.length - 2).join(', ') : (bits[0] || heading);
    out.push({
      ref: pdfId.slice(0, 64),
      postId: postM ? postM[1] : '',
      psuName: orgName || heading,
      heading,
      location: bits.length > 1 ? bits.slice(-2).join(', ') : '',
      address: addrM ? addrM[1].trim() : '',
      email: mailM ? mailM[1].trim() : '',
      description,
      natureOfWork: inferNature(heading + ' ' + description),
      category: inferCategory(heading),
      dueDate, postedOn, daysLeft,
      pdfUrl: 'https://tmdicai.org/count1.php?pdf_id=' + pdfId,
      sourceUrl: postM ? 'https://tmdicai.org/Post.php?postid=' + postM[1] : ICAI_TMD_URL
    });
  }
  // de-dupe within the page itself
  const seen = new Set();
  return out.filter(o => { if (seen.has(o.ref)) return false; seen.add(o.ref); return true; });
}

// A tender's identity, derived from its CONTENT rather than from ICAI's pdf_id.
// The pdf_id is stable today, but if ICAI ever re-uploads a document the id
// changes and the same tender would import again. PSU + due date + the opening
// of the description is what actually identifies a tender.
function tenderImportKey(o) {
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const basis = norm(o.psuName) + '|' + String(o.dueDate || '') + '|' + norm(o.description).slice(0, 120);
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 20);
}
// Recover a tender's description. Rows imported before we stored it separately
// still carry it at the front of their first remark:
//   "<description> · Address: … · Email: … · Tender PDF: …"
function tenderDescriptionOf(t) {
  if (t && t.description) return t.description;
  const ev = ((t && t.events) || [])[0];
  if (ev && ev.note) return String(ev.note).split(/\s+·\s+(?:Address:|Email:|Tender PDF:)/)[0].trim();
  return '';
}
// Identity of an ALREADY-STORED tender, always content-based.
// NB: we deliberately do NOT fall back to tenderRef — ICAI's pdf_id rotates over
// time, so the same tender comes back with a new id and would look "new".
function storedTenderKey(t) {
  return tenderImportKey({ psuName: t.psuName, dueDate: t.dueDate, description: tenderDescriptionOf(t) });
}
// Every id a stored tender can be recognised by
function tenderKeySet(tenders) {
  const s = new Set();
  (tenders || []).forEach(t => {
    if (t.importKey) s.add(t.importKey);
    s.add(storedTenderKey(t));                    // works for legacy rows too
    if (t.sourceRef) s.add(t.sourceRef);
  });
  return s;
}

async function fetchTmdHtml() {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(ICAI_TMD_URL, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'GARP-Tracker/1.0 (+practice management; contact your admin)', 'Accept': 'text/html' }
    });
    if (!r.ok) throw new Error('ICAI site returned ' + r.status);
    return await r.text();
  } finally { clearTimeout(to); }
}

// Preview what would be imported — never writes anything
app.get('/api/tenders/import/preview', auth, partnerOrAdmin, async (req, res) => {
  try {
    const html = await fetchTmdHtml();
    const items = parseTmdOpportunities(html);
    const db = readDB();
    const have = tenderKeySet(db.tenders);
    const rows = items.map(i => {
      const key = tenderImportKey(i);
      return { ...i, importKey: key, alreadyImported: have.has(key) || have.has(i.ref) };
    });
    res.json({
      ok: true, source: ICAI_TMD_URL, count: rows.length,
      items: rows,
      // If the parse comes back empty their page layout/wording likely changed —
      // send a snippet so it can be diagnosed without guessing.
      debug: rows.length ? undefined : String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch the ICAI tender list: ' + (e.message || 'unknown error') });
  }
});

// Import the selected opportunities as Government Tenders
app.post('/api/tenders/import', auth, partnerOrAdmin, (req, res) => {
  const { items, partnerId, partnerName } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nothing selected to import.' });
  const db = readDB();
  if (!db.tenders) db.tenders = [];
  const have = tenderKeySet(db.tenders);
  const now = new Date().toISOString();
  let pId = partnerId || req.user.id;
  let pName = (partnerName || '').trim();
  if (!pName) { const u = (db.users || []).find(x => x.id === pId); pName = u ? u.name : req.user.name; }
  let created = 0, skipped = 0;
  items.forEach(i => {
    if (!i || !i.ref || !i.psuName) return;
    const key = tenderImportKey(i);
    // Skip if we already hold this tender under EITHER identity, and guard against
    // the same tender appearing twice within one payload.
    if (have.has(key) || have.has(i.ref)) { skipped++; return; }
    const noteBits = [i.description, i.address ? 'Address: ' + i.address : '', i.email ? 'Email: ' + i.email : '', i.pdfUrl ? 'Tender PDF: ' + i.pdfUrl : ''].filter(Boolean);
    const t = {
      id: newId(),
      category: TENDER_CATEGORIES.includes(i.category) ? i.category : 'psu_company',
      psuName: String(i.psuName).slice(0, 200),
      importKey: key,
      description: String(i.description || '').slice(0, 400),
      // ICAI's pdf_id rotates, so it is NOT a tender reference — keep it only as a
      // source token and leave Tender Ref free for the real one from the document.
      sourceRef: String(i.ref).slice(0, 80),
      tenderRef: '',
      natureOfWork: i.natureOfWork || '',
      applicationDate: '',                      // not applied yet — set when the bid goes in
      dueDate: i.dueDate || '',
      tenderValue: 0, quotationValue: 0, emdAmount: 0, emdStatus: '',
      source: 'ICAI TMD', tenderFee: 0, bidOpeningDate: '', l1Value: 0,
      sourceUrl: i.sourceUrl || '', pdfUrl: i.pdfUrl || '',
      location: i.location || '', contactEmail: i.email || '',
      partnerId: pId, partnerName: pName,
      status: 'Identified',
      importedFrom: 'ICAI TMD', importedAt: now,
      createdBy: req.user.id, createdByName: req.user.name,
      createdAt: now, updatedAt: now,
      events: [{ id: newId(), type: 'created', status: 'Identified', note: noteBits.join(' · ').slice(0, 1000), byId: req.user.id, byName: req.user.name, date: now }]
    };
    db.tenders.push(t); have.add(key); if (t.sourceRef) have.add(t.sourceRef); created++;
  });
  if (created) logAudit(db, req, 'created', 'client', '', 'Government tenders', `imported ${created} tender(s) from ICAI TMD`);
  writeDB(db);
  res.json({ ok: true, created, skipped });
});

// ═══════════════════════════════════════════════════════════
// FIRM PROFILE — GARP's own credentials, used to judge tender eligibility
// ═══════════════════════════════════════════════════════════
const DEFAULT_FIRM_PROFILE = {
  firmName: 'G A R P & Associates', frn: '', constitutionDate: '',
  partnersTotal: 0, fcaPartners: 0, caEmployees: 0, totalStaff: 0,
  turnoverY1: 0, turnoverY2: 0, turnoverY3: 0,          // last three financial years
  peerReview: false, peerReviewValidTill: '',
  cagEmpanelled: false, cagCategory: '', rbiEmpanelled: false, gemRegistered: false,
  experienceYears: 0, psuAuditExp: false, bankAuditExp: false,
  states: [],                                            // where we can serve, e.g. ["Uttar Pradesh","Delhi"]
  // Registration numbers — routinely demanded in tender/empanelment forms
  pan: '', gstin: '', msme: '',                          // MSME / Udyam registration no.
  defaultTenderPartnerId: '', defaultTenderPartnerName: '',
  autoSync: true,
  members: [],           // partners/members read off the ICAI Firm Card / Member Card
  cardImports: [],       // audit of card imports {kind, at, byName, fields}
  experience: [],        // client-wise audit experience — feeds "similar work" matching
  configured: false      // set once an admin saves the profile; until then, unset flags mean "unknown"
};
function getFirmProfile(db) { return { ...DEFAULT_FIRM_PROFILE, ...(db.firmProfile || {}) }; }

// ── Client-wise audit experience registry ────────────────────────────────────
// Each record is one engagement. The eligibility engine matches tender "similar work"
// / "PSU experience" / "internal audit of PSU" clauses against these.
const EXP_CLIENT_TYPES = ['PSU', 'PSU Bank', 'Nationalised Bank', 'Private Bank', 'Government', 'Government Department',
  'Listed Company', 'Autonomous Body', 'Statutory Corporation', 'Trust / Society', 'Private Company', 'Other'];
const EXP_ASSIGN_TYPES = ['Statutory Audit', 'Internal Audit', 'Concurrent Audit', 'Tax Audit', 'GST Audit',
  'Stock Audit', 'Revenue Audit', 'Management Audit', 'Due Diligence', 'Other'];
function normExpRecord(b) {
  const ongoing = !!b.ongoing;
  return {
    id: b.id || newId(),
    client: String(b.client || '').trim().slice(0, 160),
    clientType: String(b.clientType || '').trim().slice(0, 60),
    assignmentType: String(b.assignmentType || '').trim().slice(0, 60),
    sector: String(b.sector || '').trim().slice(0, 80),
    fromDate: String(b.fromDate || '').slice(0, 10),
    toDate: ongoing ? '' : String(b.toDate || '').slice(0, 10),
    ongoing,
    feeValue: num(b.feeValue),
    refNo: String(b.refNo || '').trim().slice(0, 80),
    remarks: String(b.remarks || '').trim().slice(0, 600),
    at: new Date().toISOString()
  };
}
// The tags a client type counts as. A PSU bank is a bank AND a PSU AND government-owned,
// so a tender asking for any of those should be satisfied by it.
function clientTags(ct) {
  const s = String(ct || '').toLowerCase();
  const tags = new Set();
  if (/bank/.test(s)) tags.add('bank');
  if (/psu|public\s*sector|undertaking/.test(s)) tags.add('psu');
  if (/govern|govt|ministry|department|municipal|nigam|autonomous|statutory|authority|\bboard\b|corporation/.test(s)) tags.add('government');
  if (/listed/.test(s)) tags.add('listed');
  if (/private|pvt/.test(s)) tags.add('private');
  if (/trust|society|ngo|section\s*8/.test(s)) tags.add('trust');
  if (tags.has('bank') && /psu|public|nationali|scheduled/.test(s)) { tags.add('psu'); tags.add('government'); }
  if (tags.has('psu')) tags.add('government');   // every PSU is government-owned
  return tags;
}
function assignTag(a) {
  const s = String(a || '').toLowerCase();
  if (/internal/.test(s)) return 'internal';
  if (/concurrent/.test(s)) return 'concurrent';
  if (/statutory/.test(s)) return 'statutory';
  if (/\btax\b/.test(s)) return 'tax';
  if (/gst/.test(s)) return 'gst';
  if (/stock/.test(s)) return 'stock';
  if (/revenue/.test(s)) return 'revenue';
  if (/management/.test(s)) return 'management';
  return 'other';
}
// Distinct calendar years an engagement spanned (fair "years of experience" — no
// double-counting overlapping clients, no over-counting across gaps).
function expYearSet(r, into) {
  const f = new Date(r.fromDate);
  const t = (r.ongoing || !r.toDate) ? new Date() : new Date(r.toDate);
  if (isNaN(f) || isNaN(t)) return;
  for (let y = f.getFullYear(); y <= t.getFullYear(); y++) into.add(y);
}
// Match the experience registry against one requirement.
//   want = { types:Set, kinds:Set, minYears:Number, minCount:Number }
function matchExperience(profile, want) {
  const recs = Array.isArray(profile.experience) ? profile.experience : [];
  const matches = recs.filter(r =>
    (want.types.size ? want.types.has(assignTag(r.assignmentType)) : true) &&
    (want.kinds.size ? [...clientTags(r.clientType)].some(x => want.kinds.has(x)) : true));
  const yset = new Set();
  matches.forEach(r => expYearSet(r, yset));
  return { total: recs.length, matches, count: matches.length, years: yset.size };
}

// ── Firm rules ───────────────────────────────────────────────────────────────
// Readable by every staff member (it's the office handbook); only admins edit.
app.get('/api/rules', auth, (req, res) => {
  const R = getRules(readDB());
  res.json({ ...R, canEdit: req.user.role === 'admin' });
});
app.put('/api/rules', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = getRules(db);
  const b = req.body || {};
  const r = { ...before };
  ['officeIn','officeOut','lateGrace','lunchStart','lunchEnd']
    .forEach(f => { if (b[f] !== undefined) r[f] = String(b[f] || '').trim(); });
  ['fullDayHours','fullDayHoursCA','halfDayHours','lateMarksPerHalfDay','paidLeavesPerYear','joiningCutoffDay',
   'carryForwardMax','leaveNoticeDays','maxConsecutiveLeave','compOffExpiryDays',
   'probationMonths','noticeDuringProbation','noticeAfterConfirmation']
    .forEach(f => { if (b[f] !== undefined) r[f] = num(b[f]); });
  ['sundayOff','sandwichRule','compOffEnabled']
    .forEach(f => { if (b[f] !== undefined) r[f] = !!b[f]; });
  if (b.weekOffSaturdays !== undefined) {
    r.weekOffSaturdays = (Array.isArray(b.weekOffSaturdays) ? b.weekOffSaturdays : [])
      .map(Number).filter(n => n >= 1 && n <= 5);
  }
  if (b.policySections !== undefined && Array.isArray(b.policySections)) {
    r.policySections = b.policySections
      .filter(s => s && (String(s.title || '').trim() || String(s.body || '').trim()))
      .slice(0, 40)
      .map(s => ({ title: String(s.title || '').trim().slice(0, 120), body: String(s.body || '').trim().slice(0, 4000) }));
  }
  // Guard rails: a half day can't be longer than the shortest full day
  const _minFull = Math.min(num(r.fullDayHours) || 9, num(r.fullDayHoursCA) || 8);
  if (r.halfDayHours >= _minFull) r.halfDayHours = Math.max(0, _minFull / 2);
  r.updatedAt = new Date().toISOString();
  r.updatedBy = req.user.name;
  db.rules = r;
  const changed = diffFields(before, r, Object.keys(DEFAULT_RULES).filter(k => !['policySections','weekOffSaturdays','updatedAt','updatedBy'].includes(k)));
  logAudit(db, req, 'updated', 'settings', 'rules', 'Firm rules', changed || 'policy text / week-offs updated');
  writeDB(db);
  invalidateRules();
  res.json({ ...r, canEdit: true });
});

// ═══════════════════════════════════════════════════════════
// DELEGATION OF AUTHORITY — permissions matrix + approval limits
// Only a full admin may read or change this; that is what keeps it un-escalatable.
// ═══════════════════════════════════════════════════════════
app.get('/api/delegation', auth, adminOnly, (req, res) => {
  const db = readDB();
  const d = getDelegation(db);
  res.json({
    capabilities: CAPABILITIES.map(([key, group, label, description]) => ({ key, group, label, description })),
    grants: d.grants,
    limits: d.limits,
    updatedAt: d.updatedAt, updatedBy: d.updatedBy,
    people: (db.users || []).filter(u => u.active !== false)
      .map(u => ({ id: u.id, name: u.name, role: u.role, designation: u.designation || '' }))
  });
});
app.put('/api/delegation', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = getDelegation(db);
  const inGrants = (req.body && req.body.grants) || {};
  const validIds = new Set((db.users || []).map(u => u.id));
  const grants = {};
  CAP_KEYS.forEach(k => {
    // Only real, non-admin user ids are stored. Admins hold everything implicitly, so
    // listing them here would be noise that could later be mistaken for the source of truth.
    grants[k] = (Array.isArray(inGrants[k]) ? inGrants[k] : [])
      .filter(id => validIds.has(id))
      .filter(id => { const u = (db.users || []).find(x => x.id === id); return u && u.role !== 'admin'; });
  });
  const changed = CAP_KEYS.filter(k => (before.grants[k] || []).join(',') !== grants[k].join(','));
  db.delegation = { ...(db.delegation || {}), grants, limits: before.limits, migrated: true,
    updatedAt: new Date().toISOString(), updatedBy: req.user.name };
  logAudit(db, req, 'updated', 'settings', 'delegation', 'Delegation of Authority',
    changed.length ? 'changed: ' + changed.join(', ') : 'no capability change');
  writeDB(db);
  res.json(getDelegation(db));
});
// ── Approval limits (who may approve what, up to how much) ──────────────────
function normLimit(b, db) {
  const u = (db.users || []).find(x => x.id === b.approverId);
  return {
    id: b.id || newId(),
    matter: String(b.matter || '').trim().slice(0, 160),
    approverId: String(b.approverId || ''),
    approverName: u ? u.name : String(b.approverName || '').trim().slice(0, 120),
    limitAmount: num(b.limitAmount),
    unlimited: !!b.unlimited,
    notes: String(b.notes || '').trim().slice(0, 600),
    updatedAt: new Date().toISOString()
  };
}
app.post('/api/delegation/limits', auth, adminOnly, (req, res) => {
  const db = readDB();
  const d = getDelegation(db);
  const rec = normLimit(req.body || {}, db);
  if (!rec.matter) return res.status(400).json({ error: 'Matter is required.' });
  const limits = d.limits.concat([rec]);
  db.delegation = { ...(db.delegation || {}), grants: d.grants, limits, migrated: true };
  logAudit(db, req, 'created', 'settings', 'delegation', 'Approval limit', rec.matter + ' → ' + (rec.approverName || '—'));
  writeDB(db);
  res.json(getDelegation(db));
});
app.put('/api/delegation/limits/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const d = getDelegation(db);
  const i = d.limits.findIndex(r => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found.' });
  const limits = d.limits.slice();
  limits[i] = normLimit({ ...limits[i], ...req.body, id: limits[i].id }, db);
  db.delegation = { ...(db.delegation || {}), grants: d.grants, limits, migrated: true };
  logAudit(db, req, 'updated', 'settings', 'delegation', 'Approval limit', limits[i].matter);
  writeDB(db);
  res.json(getDelegation(db));
});
app.delete('/api/delegation/limits/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const d = getDelegation(db);
  const rec = d.limits.find(r => r.id === req.params.id);
  const limits = d.limits.filter(r => r.id !== req.params.id);
  db.delegation = { ...(db.delegation || {}), grants: d.grants, limits, migrated: true };
  logAudit(db, req, 'deleted', 'settings', 'delegation', 'Approval limit', rec ? rec.matter : req.params.id);
  writeDB(db);
  res.json(getDelegation(db));
});

app.get('/api/firm-profile', auth, partnerOrAdmin, (req, res) => {
  res.json(getFirmProfile(readDB()));
});
app.put('/api/firm-profile', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = getFirmProfile(db);
  const b = req.body || {};
  const p = { ...before };
  ['firmName','frn','constitutionDate','cagCategory','peerReviewValidTill','pan','gstin','msme','defaultTenderPartnerId','defaultTenderPartnerName']
    .forEach(f => { if (b[f] !== undefined) p[f] = String(b[f] || '').trim().toUpperCase() === '' ? '' : String(b[f]).trim(); });
  // Registration numbers are always stored upper-case
  ['pan','gstin','msme','frn'].forEach(f => { if (p[f]) p[f] = String(p[f]).toUpperCase(); });
  ['partnersTotal','fcaPartners','caEmployees','totalStaff','turnoverY1','turnoverY2','turnoverY3','experienceYears']
    .forEach(f => { if (b[f] !== undefined) p[f] = num(b[f]); });
  ['peerReview','cagEmpanelled','rbiEmpanelled','gemRegistered','psuAuditExp','bankAuditExp','autoSync']
    .forEach(f => { if (b[f] !== undefined) p[f] = !!b[f]; });
  if (b.states !== undefined) {
    p.states = Array.isArray(b.states) ? b.states.map(s => String(s).trim()).filter(Boolean)
      : String(b.states || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  }
  p.configured = true;   // an admin has now told us what the firm actually holds
  db.firmProfile = p;
  const changed = diffFields(before, p, Object.keys(DEFAULT_FIRM_PROFILE).filter(k => k !== 'states' && k !== 'experience'));
  logAudit(db, req, 'updated', 'settings', 'firm-profile', 'Firm eligibility profile', changed || 'states/other updated');
  writeDB(db);
  res.json(p);
});

// ── Client-wise audit experience: add / edit / delete ────────────────────────
// Partners maintain this (it feeds Business Development eligibility), so partner+admin.
app.get('/api/firm-profile/experience/meta', auth, partnerOrAdmin, (req, res) => {
  res.json({ clientTypes: EXP_CLIENT_TYPES, assignmentTypes: EXP_ASSIGN_TYPES });
});
app.post('/api/firm-profile/experience', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const p = getFirmProfile(db);
  if (!Array.isArray(p.experience)) p.experience = [];
  const rec = normExpRecord(req.body || {});
  if (!rec.client) return res.status(400).json({ error: 'Client name is required.' });
  p.experience.unshift(rec);
  db.firmProfile = p;
  logAudit(db, req, 'created', 'settings', 'firm-profile', 'Audit experience', 'added ' + rec.client + ' (' + (rec.assignmentType || '—') + ')');
  writeDB(db);
  res.json(p);
});
app.put('/api/firm-profile/experience/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const p = getFirmProfile(db);
  const arr = Array.isArray(p.experience) ? p.experience : [];
  const i = arr.findIndex(r => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Experience record not found.' });
  arr[i] = { ...arr[i], ...normExpRecord({ ...arr[i], ...req.body, id: arr[i].id }) };
  p.experience = arr;
  db.firmProfile = p;
  logAudit(db, req, 'updated', 'settings', 'firm-profile', 'Audit experience', 'edited ' + arr[i].client);
  writeDB(db);
  res.json(p);
});
app.delete('/api/firm-profile/experience/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const p = getFirmProfile(db);
  const arr = Array.isArray(p.experience) ? p.experience : [];
  const rec = arr.find(r => r.id === req.params.id);
  p.experience = arr.filter(r => r.id !== req.params.id);
  db.firmProfile = p;
  logAudit(db, req, 'deleted', 'settings', 'firm-profile', 'Audit experience', 'removed ' + (rec ? rec.client : req.params.id));
  writeDB(db);
  res.json(p);
});

// ═══════════════════════════════════════════════════════════
// ICAI FIRM CARD / MEMBER CARD IMPORT
// The cards downloaded from ICAI's self-service portal carry the firm's
// constitution and its members. Layout varies, so this is label-driven
// best-effort extraction and ALWAYS goes through a human review step.
// ═══════════════════════════════════════════════════════════
function pdfDateToISO(s) {
  const t = String(s || '').trim();
  let m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);          // 05/04/2011 (dd/mm/yyyy)
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m = t.match(/(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{4})/);         // 05-Apr-2011 / 5 April 2011
  if (m) {
    const mo = MONTHS_ABBR[m[2].slice(0,3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(parseInt(m[1],10)).padStart(2,'0')}`;
  }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}
function labelValue(text, labels) {
  for (const lab of labels) {
    const re = new RegExp(lab + '\\s*[:\\-]?\\s*([^\\n]{1,120})', 'i');
    const m = text.match(re);
    if (m && m[1] && m[1].trim()) return m[1].trim().replace(/\s{2,}/g, ' ');
  }
  return '';
}
const INDIA_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh','Andaman and Nicobar Islands','Dadra and Nagar Haveli','Daman and Diu','Lakshadweep'];

// Pick a person's name out of loose table text (used when the name is printed
// before the membership number rather than after it).
function cardNameFromTokens(txt) {
  const DROP = /^(full|part|time|active|inactive|yes|no|na|ho|br|nil|and|partner|proprietor|paid|assistant|member|sr|s)$/i;
  return String(txt || '')
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
    .replace(/\b\d{6}\b/g, ' ')
    .replace(/#/g, ' ')
    .replace(/\b(FCA|ACA)\b/gi, ' ')
    .split(/\s+/)
    .filter(w => /^[A-Za-z][A-Za-z.]{1,}$/.test(w) && !DROP.test(w))
    .slice(-4)          // the name is the last few words before the number
    .join(' ')
    .trim();
}

// Parse one member table (PROPRIETOR/PARTNERS or PAID ASSISTANTS) out of the card.
// Real ICAI cards wrap names across lines and even across page breaks, e.g.
//   "154967 PRAVIN FCA Full Time 13/03/2013 2021" ... then "TUKARAM BHISE" on the next page.
function parseCardMemberBlock(block, isPartner, acc, seen) {
  if (!block) return;
  const s = block
    .replace(/\d{4}\/[A-Za-z]{3}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+Page\s+\d+\s+of\s+\d+/gi, ' ')  // page footers
    .replace(/PROPRIETOR\s*\/\s*PARTNERS\s*:|PAID\s*ASSISTANTS\s*:/gi, ' ')
    .replace(/MRN\s+NAME\s+COP_STATUS[^\n]*/gi, ' ')                                          // column headers
    .replace(/Individual\s*Practice\s*\/?\s*Association[\s\S]{0,80}?Occupation/gi, ' ')
    .replace(/YR\s*OF\s*DISA\s*QUALF|YR\s*OF\s*DISA|QUALF/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A membership number is exactly 6 digits standing alone. \b...\b makes "136616W"
  // (the firm's own FRN, used as an in-charge code) NOT match — which matters.
  const re = /\b(\d{6})\b\s*#?\s*/g;
  const starts = [];
  let m;
  while ((m = re.exec(s))) starts.push({ no: m[1], at: m.index, end: re.lastIndex });
  const STOP = /^(full|part|time|active|inactive|yes|no|na|ho|br|nil|and)$/i;
  starts.forEach((st, i) => {
    const chunk = s.slice(st.end, i + 1 < starts.length ? starts[i + 1].at : s.length);
    const pre = s.slice(i > 0 ? starts[i - 1].end : 0, st.at);   // text between the previous MRN and this one
    const stM = chunk.match(/\b(FCA|ACA)\b/);
    const status = stM ? stM[1].toUpperCase() : '';
    const parts = status ? chunk.split(new RegExp('\\b' + status + '\\b')) : [chunk];
    let name = (parts[0] || '').replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
    if (name) {
      // Name sits AFTER the number (real ICAI card). Recover any fragment that
      // spilled past the status/date because the row wrapped over a page break.
      const extra = parts.slice(1).join(' ')
        .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
        .split(/\s+/)
        .filter(w => /^[A-Za-z][A-Za-z.]{1,}$/.test(w) && !STOP.test(w))
        .slice(0, 4);   // a wrapped name is a word or two — never a paragraph
      if (extra.length) name = (name + ' ' + extra.join(' ')).trim();
    } else {
      // Nothing before the status => the name sits BEFORE the number on this layout
      name = cardNameFromTokens(pre);
    }
    name = name.replace(/^\d{1,3}[.)\s]+/, '').replace(/[,]+$/, '').trim();
    const dates = (chunk.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(pdfDateToISO).filter(Boolean);
    if (seen.has(st.no)) return;
    seen.add(st.no);
    acc.push({
      membershipNo: st.no,
      name,
      status,
      joinedFirmDate: dates[0] || '',
      leftDate: dates[1] || '',
      isPartner: !!isPartner,
      source: 'Firm Card'
    });
  });
}

// ICAI Firm Card -> firm details + partner list
function extractFirmCard(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const out = { members: [], warnings: [], states: [] };

  // ── Header only. Everything below "Details of Merger" belongs to OTHER firms
  // that merged into us — reading the FRN/date from there is simply wrong.
  const marks = [/Details\s*of\s*Merger/i, /Details\s*of\s*De\s*[- ]?Merger/i, /Head\s*Office\s*and\s*Branch\s*Details/i, /PROPRIETOR\s*\/\s*PARTNERS/i]
    .map(r => text.search(r)).filter(i => i > -1);
  const head = text.slice(0, marks.length ? Math.min(...marks) : text.length);

  const frnM = head.match(/Firm\s*Reg(?:n|istration)?\.?\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d{6}\s*[A-Za-z])/i);
  out.frn = frnM ? frnM[1].replace(/\s+/g, '').toUpperCase() : '';

  const nameM = head.match(/Name\s*of\s*the\s*Firm\s*[:\-]?\s*([^\n]+)/i);
  out.firmName = nameM ? nameM[1].trim().replace(/^M\/?s\.?\s*/i, '').trim() : '';

  const dcM = head.match(/Date\s*(?:Constituted|of\s*Constitution)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]+\d{4})/i);
  out.constitutionDate = dcM ? pdfDateToISO(dcM[1]) : '';

  const gstM = head.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/);
  if (gstM) out.gstin = gstM[1];

  // ── Members: ONLY the firm's own two tables ──
  const pStart = text.search(/PROPRIETOR\s*\/\s*PARTNERS\s*:/i);
  const aStart = text.search(/PAID\s*ASSISTANTS\s*:/i);
  // The tables are followed by the firm's own address block ("M/S. ... PINCODE: 201308").
  // Without stopping there, the address words get glued onto the last member's name and
  // the PIN code gets read as a membership number. Search only AFTER the tables begin,
  // because "M/s." also appears in the header ("Name of the Firm M/s. ...").
  const memStart = pStart > -1 ? pStart : (aStart > -1 ? aStart : 0);
  const stopRe = /\(Name\s*in\s*Block\s*Letters|THIS\s*DOES\s*NOT\s*CONSTITUTE|Disclaimer\s*:|PINCODE\s*:|\bM\/S\.\s|Note\s*:/i;
  const rel = text.slice(memStart).search(stopRe);
  const tailStart = rel > -1 ? memStart + rel : text.length;
  const seen = new Set();
  if (pStart > -1) parseCardMemberBlock(text.slice(pStart, aStart > pStart ? aStart : tailStart), true, out.members, seen);
  if (aStart > -1) parseCardMemberBlock(text.slice(aStart, tailStart), false, out.members, seen);

  // ── Branch states (handy for the "states we can serve" eligibility check) ──
  const bStart = text.search(/Head\s*Office\s*and\s*Branch\s*Details/i);
  if (bStart > -1) {
    const bEnd = pStart > bStart ? pStart : text.length;
    const bBlock = text.slice(bStart, bEnd).replace(/\s+/g, ' ').toUpperCase();
    INDIA_STATES.forEach(st => { if (bBlock.includes(st.toUpperCase())) out.states.push(st); });
    out.states = [...new Set(out.states)];
  }

  const partners = out.members.filter(m => m.isPartner && !m.leftDate);
  out.derived = {
    partnersTotal: partners.length,
    fcaPartners: partners.filter(m => m.status === 'FCA').length,
    caEmployees: out.members.filter(m => !m.isPartner && !m.leftDate).length
  };
  if (!out.members.length) out.warnings.push('No members found — this may not be an ICAI Firm Card, or it may be a scanned copy.');
  if (!out.frn) out.warnings.push('Firm Registration Number not found — please type it in.');
  if (!out.constitutionDate) out.warnings.push('Date of constitution not found — please type it in.');
  return out;
}
// ICAI Member Card -> one member
function extractMemberCard(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const flat = text.replace(/\s+/g, ' ');
  const out = { warnings: [] };
  const mv = labelValue(text, ['Membership\\s*(?:No\\.?|Number)', 'M\\.?\\s*No', 'MRN']);
  const mm = String(mv).match(/(\d{6})/) || flat.match(/Membership\s*(?:No\.?|Number)\s*[:\-]?\s*(\d{6})/i) || flat.match(/\b(\d{6})\b/);
  out.membershipNo = mm ? mm[1] : '';
  let nm = labelValue(text, ['Name\\s*of\\s*(?:the\\s*)?Member', 'Member\\s*Name', '\\bName\\b']);
  out.name = nm.replace(/\b\d{6}\b/g, '').replace(/\b(FCA|ACA)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  out.status = /\bFCA\b/i.test(flat) ? 'FCA' : (/\bACA\b/i.test(flat) ? 'ACA' : '');
  out.enrolmentDate = pdfDateToISO(labelValue(text, ['Date\\s*of\\s*(?:Enrol|Enroll)ment', 'Date\\s*of\\s*Admission', 'Associate\\s*Since', 'Date\\s*of\\s*Associateship']));
  out.fellowDate = pdfDateToISO(labelValue(text, ['Date\\s*of\\s*Fellow(?:ship)?', 'Fellow\\s*Since']));
  out.cop = /certificate\s*of\s*practice|\bCOP\b/i.test(flat);
  out.copDate = pdfDateToISO(labelValue(text, ['Date\\s*of\\s*(?:issue\\s*of\\s*)?COP', 'COP\\s*Date', 'Certificate\\s*of\\s*Practice\\s*(?:since|date)']));
  if (!out.membershipNo) out.warnings.push('Membership number not found — this may not be a Member Card, or it may be a scanned copy.');
  if (!out.name) out.warnings.push('Member name not found — please type it in.');
  return out;
}

// Parse an uploaded ICAI card and return a PREVIEW — writes nothing
app.post('/api/firm-profile/parse-card', auth, adminOnly, async (req, res) => {
  const { fileBase64, kind } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'No file provided.' });
  if (!['firm', 'member'].includes(kind)) return res.status(400).json({ error: 'kind must be "firm" or "member".' });
  let buf;
  try { buf = Buffer.from(String(fileBase64).split(',').pop(), 'base64'); }
  catch (e) { return res.status(400).json({ error: 'Could not read the uploaded file.' }); }
  if (buf.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'Please upload the card as a PDF.' });
  let pdfParse;
  try { pdfParse = require('pdf-parse/lib/pdf-parse.js'); }
  catch (e) { return res.status(500).json({ error: 'PDF reader not installed on the server.' }); }
  let data;
  try { data = await pdfParse(buf, { max: 10 }); }
  catch (e) { return res.status(400).json({ error: 'Could not read this PDF: ' + (e.message || 'unknown') }); }
  const text = String(data.text || '');
  if (text.replace(/\s/g, '').length < 40)
    return res.status(400).json({ error: 'This PDF has no readable text — it looks like a scanned image. Please download the card again from the ICAI portal (the original is text-based).' });
  const extracted = kind === 'firm' ? extractFirmCard(text) : extractMemberCard(text);
  const profile = getFirmProfile(readDB());
  res.json({ ok: true, kind, extracted, current: profile, pages: data.numpages });
});

// Apply a reviewed card import to the firm profile
app.post('/api/firm-profile/apply-card', auth, adminOnly, (req, res) => {
  const { kind, data } = req.body || {};
  if (!['firm', 'member'].includes(kind)) return res.status(400).json({ error: 'kind must be "firm" or "member".' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Nothing to apply.' });
  const db = readDB();
  const p = getFirmProfile(db);
  const applied = [];
  if (kind === 'firm') {
    ['frn', 'firmName', 'constitutionDate', 'gstin'].forEach(f => {
      if (data[f] !== undefined && String(data[f]).trim() && String(data[f]) !== String(p[f] || '')) { p[f] = String(data[f]).trim(); applied.push(f); }
    });
    if (Array.isArray(data.members) && data.members.length) {
      const byNo = new Map((p.members || []).map(m => [m.membershipNo, m]));
      data.members.forEach(m => {
        if (!m || !m.membershipNo) return;
        byNo.set(m.membershipNo, { ...(byNo.get(m.membershipNo) || {}), ...m });
      });
      p.members = [...byNo.values()];
      applied.push(data.members.length + ' member(s)');
    }
    // Branch states off the card feed the "states we can serve" eligibility check
    if (Array.isArray(data.states) && data.states.length) {
      p.states = [...new Set((p.states || []).concat(data.states))];
      applied.push(data.states.length + ' state(s)');
    }
  } else {
    if (!data.membershipNo) return res.status(400).json({ error: 'A membership number is required.' });
    const byNo = new Map((p.members || []).map(m => [m.membershipNo, m]));
    const prev = byNo.get(data.membershipNo) || {};
    byNo.set(data.membershipNo, {
      ...prev,
      membershipNo: data.membershipNo,
      name: data.name || prev.name || '',
      status: data.status || prev.status || '',
      enrolmentDate: data.enrolmentDate || prev.enrolmentDate || '',
      fellowDate: data.fellowDate || prev.fellowDate || '',
      cop: data.cop !== undefined ? !!data.cop : !!prev.cop,
      copDate: data.copDate || prev.copDate || '',
      isPartner: data.isPartner !== undefined ? !!data.isPartner : (prev.isPartner !== undefined ? !!prev.isPartner : true),
      linkedUserId: data.linkedUserId || prev.linkedUserId || '',
      source: 'Member Card'
    });
    p.members = [...byNo.values()];
    applied.push('member ' + data.membershipNo);
  }
  // Keep the eligibility counts in step with the member list (anyone who has left is excluded)
  const partners = (p.members || []).filter(m => m.isPartner && !m.leftDate);
  p.partnersTotal = partners.length || p.partnersTotal;
  p.fcaPartners = partners.filter(m => String(m.status).toUpperCase() === 'FCA').length || p.fcaPartners;
  p.caEmployees = (p.members || []).filter(m => !m.isPartner && !m.leftDate).length || p.caEmployees;
  if (!p.experienceYears && p.constitutionDate) {
    const d = new Date(p.constitutionDate);
    if (!isNaN(d)) p.experienceYears = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
  }
  p.configured = true;
  if (!p.cardImports) p.cardImports = [];
  p.cardImports.unshift({ kind, at: new Date().toISOString(), byName: req.user.name, fields: applied.join(', ') });
  p.cardImports = p.cardImports.slice(0, 20);
  db.firmProfile = p;
  logAudit(db, req, 'updated', 'settings', 'firm-profile', 'Firm profile', (kind === 'firm' ? 'Firm Card' : 'Member Card') + ' imported: ' + applied.join(', '));
  writeDB(db);
  res.json({ ok: true, profile: p, applied });
});

// Remove a member row
app.delete('/api/firm-profile/members/:membershipNo', auth, adminOnly, (req, res) => {
  const db = readDB();
  const p = getFirmProfile(db);
  const before = (p.members || []).length;
  p.members = (p.members || []).filter(m => m.membershipNo !== req.params.membershipNo);
  const partners = p.members.filter(m => m.isPartner);
  p.partnersTotal = partners.length;
  p.fcaPartners = partners.filter(m => String(m.status).toUpperCase() === 'FCA').length;
  db.firmProfile = p;
  logAudit(db, req, 'deleted', 'settings', 'firm-profile', 'Firm profile', 'removed member ' + req.params.membershipNo);
  writeDB(db);
  res.json({ ok: true, deleted: before - p.members.length, profile: p });
});

// ═══════════════════════════════════════════════════════════
// TENDER PDF READING + ELIGIBILITY
// Best-effort: government tender PDFs have no standard layout, and many are
// scanned images with no text layer at all. Everything extracted here is a
// SUGGESTION for a human to confirm — never a substitute for reading the PDF.
// ═══════════════════════════════════════════════════════════
function toAmount(numStr, unit) {
  let v = parseFloat(String(numStr || '').replace(/,/g, ''));
  if (!isFinite(v)) return 0;
  const u = String(unit || '').toLowerCase();
  if (/^(lakh|lac|lakhs|lacs)$/.test(u)) v *= 1e5;
  else if (/^(crore|crores|cr)$/.test(u)) v *= 1e7;
  return Math.round(v);
}
// A money value must be *identifiable* as money: either it carries a currency
// marker (Rs./INR/₹) or a unit (lakh/crore). A bare number is NOT accepted —
// otherwise "during the last 3 F.Y. ... Rs. 50 Lakhs" reads as ₹3.
// Groups: 1=amount w/ currency, 2=its unit, 3=amount w/ unit, 4=that unit.
const AMT = '(?:(?:Rs\\.?|INR|₹)\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*(lakhs?|lacs?|crores?|crs?|cr)?' +
            '|([\\d][\\d,]*(?:\\.\\d+)?)\\s*(lakhs?|lacs?|crores?|crs?|cr)\\b)';
// Find the nearest money value after a keyword. The gap is [\s\S] rather than
// [^.] because Indian tenders are full of abbreviations ("Rs.", "F.Y.", "No.",
// "Ltd.") and a period-blocked gap simply never reaches the amount.
function moneyNear(text, leads, win) {
  for (const lead of leads) {
    const m = text.match(new RegExp(lead + '[\\s\\S]{0,' + (win || 120) + '}?' + AMT, 'i'));
    if (m) {
      const v = toAmount(m[1] || m[3], m[2] || m[4]);
      if (v) return { value: v, raw: m[0].replace(/\s+/g, ' ').trim().slice(0, 170) };
    }
  }
  return null;
}
function firstMatch(text, patterns) {
  for (const re of patterns) { const m = text.match(re); if (m) return m; }
  return null;
}

// ── Reading the eligibility criteria as WRITTEN ──────────────────────────────
// Tenders call this section a dozen different things. We find it, cut it at the
// next major heading, split it into the points the tender itself uses, and keep
// the original wording so a partner can read exactly what was asked.
const ELIG_HEADINGS = [
  'eligibility\\s*(?:criteria|conditions|requirements?)?',
  '(?:pre[\\s-]*)?qualification\\s*(?:criteria|requirements?)?',
  'qualifying\\s*(?:criteria|requirements?)',
  'minimum\\s*(?:eligibility|qualification|criteria|requirements?)',
  'essential\\s*(?:qualification|criteria|requirements?)',
  // "TECHNICAL REQUIREMENTS" is where IITs/NITs and many PSUs put the eligibility
  // criteria — without this the whole section is missed and nothing is extracted.
  'technical\\s*(?:eligibility|criteria|qualification|requirements?)',
  'eligibility\\s*of\\s*(?:the\\s*)?(?:bidder|firm|applicant)',
  "bidder['’`]?s?\\s*(?:eligibility|qualification)",   // PDFs use curly apostrophes far more than straight ones
  'who\\s*(?:can|may)\\s*apply',
  'conditions?\\s*of\\s*eligibility',
  'criteria\\s*for\\s*(?:empanelment|selection|eligibility)',
  'eligibility\\s*(?:and|&)\\s*qualification',
  'requirements?\\s*of\\s*(?:the\\s*)?(?:bidder|firm|applicant)',
  // Marks-based technical evaluation tables — banks/PSUs (SIDBI, NABARD, etc.) score
  // rather than pass/fail, and name the section "Technical Bid Criteria" or
  // "Compliance to (the) Technical Bid Criteria".
  '(?:compliance\\s*(?:to|of)\\s*(?:the\\s*)?)?technical\\s*(?:bid|evaluation)\\s*criteria',
  'technical\\s*evaluation\\s*(?:criteria|parameters?|matrix)',
  'evaluation\\s*(?:criteria|parameters?|matrix)\\s*(?:for\\s*technical)?',
  'marks?\\s*(?:based\\s*)?(?:evaluation|criteria)',
  'scoring\\s*(?:criteria|matrix|parameters?)'
];
// Nouns that commonly trail a heading ("Minimum Eligibility **Criteria**")
const HEADING_TAIL = '(?:[ \\t]+(?:criteria|conditions?|requirements?|norms?|parameters?|of\\s*(?:the\\s*)?(?:bidder|firm|applicant)s?))*';
// Where the eligibility section stops. These must match a HEADING LINE, not a
// stray mention — a clause may legitimately say "experience in a similar scope of
// work", which must not truncate the section.
const END_WORDS =
  'scope\\s*of\\s*work|scope\\s*and\\s*coverage|instructions?\\s*to\\s*bidders?|' +
  'evaluation\\s*(?:criteria|process|method|of\\s*bids?)?|selection\\s*(?:process|procedure|criteria)|' +
  'terms?\\s*(?:and|&)\\s*conditions?|general\\s*(?:conditions?|instructions?)|' +
  'submission\\s*of\\s*(?:bid|tender|proposal)s?|financial\\s*bid|price\\s*bid|commercial\\s*bid|' +
  'declaration|schedule\\s*of\\s*\\w+|deciding\\s*award|award\\s*of\\s*contract|' +
  'payment\\s*terms?|earnest\\s*money|tender\\s*fee|important\\s*dates?|key\\s*dates?|' +
  'documents?\\s*to\\s*be\\s*(?:submitted|enclosed)|checklist';
const SECTION_END = new RegExp(
  '(?:^|\\n)[ \\t]*(?:\\(?\\d{1,2}(?:\\.\\d{1,2})*[.)]?[ \\t]*)?(?:' + END_WORDS + ')[ \\t]*(?::|\\n|$)', 'i');
// "Annexure-A" / "Appendix-B" is a section terminator ONLY as a real heading — i.e. after
// a blank line. Inside a criteria table it appears in the "documents to be furnished"
// column ("...shall be attached with Annexure-C") on an ordinary line, which must NOT
// truncate the section and drop the rows below it.
const SECTION_END_ANNEX = /\n[ \t]*\n[ \t]*(?:annexure|appendix)\s*[-–]?\s*[A-Z0-9]/i;

function findEligibilitySection(rawText) {
  // Page furniture lands in the middle of a criterion when a clause spans a page break,
  // and then reads as part of the clause text. Drop it before anything else.
  const text = String(rawText || '')
    .replace(/^[ \t]*page\s*\d{1,3}\s*(?:of|\/)\s*\d{1,3}[ \t]*$/gim, '')
    .replace(/[ \t ]+/g, ' ');
  const cands = [];
  for (const h of ELIG_HEADINGS) {
    // The heading sits on its own line, optionally numbered ("3. Eligibility Criteria"),
    // may carry a trailing noun, and may be followed by a colon with the text on the
    // SAME line ("Eligibility Criteria: The firm shall...") — all are common. It may also
    // be prefixed with an annexure/section label ("9.3 Annexure–III: Compliance to
    // Technical Bid Criteria"), so allow that between the number and the heading word.
    const re = new RegExp(
      '(?:^|\\n)[ \\t]*(?:\\(?\\d{1,2}(?:\\.\\d{1,2})*[.)]?[ \\t]*)?' +
      '(?:(?:annexure|appendix|section|clause|schedule|part|para(?:graph)?)\\s*[-–—]?\\s*[IVXLC0-9]{0,5}\\s*[:.)\\-–—]?[ \\t]*)?' +
      '(' + h + ')' +
      HEADING_TAIL + '[ \\t]*(?::|\\n|$)', 'gi');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[0].length;
      const rest = text.slice(start);
      const e1 = rest.match(SECTION_END);
      const e2 = rest.match(SECTION_END_ANNEX);
      const endM = (e1 && e2) ? (e1.index <= e2.index ? e1 : e2) : (e1 || e2);
      // Stop at the next heading. An end-marker at position 0 is meaningful: it means
      // this heading had nothing under it (a contents-page entry), so the candidate
      // collapses to an empty body and is discarded below.
      const end = endM ? endM.index : Math.min(rest.length, 6000);
      const body = rest.slice(0, end).trim();
      if (body.replace(/\s/g, '').length < 20) continue;   // heading with nothing under it
      // "Minimum Requirement" also names a TABLE COLUMN. When it does, its body opens
      // with the sibling column header ("Documents to be furnished / Supporting"). Picking
      // it as the section start would drop the Sr-No column and shift every row — so skip
      // it and let the real "Eligibility Criteria" heading win.
      if (/^documents?\b|^supporting\b/i.test(body)) continue;
      cands.push({ title: m[1].trim(), body, points: splitClauses(body).length, len: body.length });
    }
  }
  if (!cands.length) return null;
  // Tenders name this section more than once (contents page, cross-references).
  // The real one is whichever actually yields the most criteria.
  cands.sort((a, b) => (b.points - a.points) || (b.len - a.len));
  return { title: cands[0].title, body: cands[0].body };
}

// Split a section into the points the document itself numbers.
// Clause markers, anchored to the START OF A LINE.
// This anchoring is the whole point: a bare "1." floating mid-sentence is almost never
// a clause marker, but "01.04.2026" and "Rs. 50.00 lakhs" look exactly like one. Tenders
// are full of both, and treating a date as a bullet silently chops a criterion in half.
const CL_LINE = new RegExp(
  '^[ \\t]*(?:' +
    '\\((\\d{1,2})\\)[ \\t]+' +                     // (1)
    '|(\\d{1,2}(?:\\.\\d{1,2})+)[.)]?[ \\t]+' +     // 1.1  2.3.4
    '|(\\d{1,2})[.)][ \\t]+' +                      // 1.   2)
    '|\\(([a-z]{1,4})\\)[ \\t]*' +                  // (a) (ii) (iv)
    '|([a-z])[.)][ \\t]+' +                         // a.   b)
    '|([•▪●○*])[ \\t]*' +                           // bullets
    '|([-–—])[ \\t]+' +                             // dashes
  ')', 'gim');
// Parenthesised markers are unambiguous even mid-line, so they are a safe second pass
// for PDFs whose text extraction lost the line breaks. Bare digits are NOT safe here.
const CL_INLINE = /(?:^|[\s;])\((\d{1,2}|[a-z]{1,4})\)[ \t]+/gim;
// Don't end a "sentence" on an abbreviation — Rs. / No. / F.Y. / i.e. are not full stops.
const ABBREV = /(?:\b(?:Rs|No|Sr|Nos|Mr|Ms|M\/s|Dr|Ltd|Pvt|Co|viz|etc|approx|Vol|Sec|Cl|Annex|Ref|w\.e\.f|i\.e|e\.g|F\.Y|A\.Y|A\/c|P\.F|E\.S\.I)\.|\b[A-Z]\.)$/i;

// Government eligibility criteria are very often a table:
//   Sr No | Criteria | Minimum Requirement | Documents to be furnished
// pdf-parse flattens that to a lone row-number per line followed by the cells, and the
// row numbers 1..N collide with every year ("2023-24", "FY 2025-26", "03 years"), so the
// generic marker splitter lands on the wrong column and silently drops half the criteria.
// This reads the table row by row and keeps only the requirement, dropping the
// "Documents to be furnished" column (which otherwise pollutes every criterion).
const DOC_COL = /\b(?:self[\s-]*certified|self[\s-]*attested|photocopy|copy\s*of\s*(?:audited|firm|the)|work\s*order\s*\/|to\s*be\s*(?:attached|furnished|enclosed|submitted)|shall\s*be\s*attached|shall\s*be\s*enclosed|documentary\s*(?:proof|evidence)|annexure\s*[-–]?\s*[A-Z]\b)/i;
function parseCriteriaTable(body) {
  const s = String(body || '').replace(/\r/g, '');

  // Which table are we looking at? Two shapes are common in CA tenders:
  //   (A) pass/fail:  Sr No | Criteria | Minimum Requirement | Documents to be furnished
  //   (B) scored:     Sl No | Criteria | Marks | Maximum Marks (Weightage) | Bidders Response
  const isDocTable   = /minimum\s*requirement|eligibility\s*(?:norms?|parameters?)/i.test(s)
                    && /documents?\s*(?:to\s*be\s*furnished|required|supporting)|supporting\s*documents?/i.test(s);
  const isMarksTable = /\bmarks?\b/i.test(s)
                    && /weightage|maximum\s*marks|bidder.?s?\s*response/i.test(s)
                    && /\bcriteria\b/i.test(s);
  if (!isDocTable && !isMarksTable) return null;

  const lines = s.split('\n');
  // Row boundaries = a line that is JUST a small number (the Sr. No cell).
  const rowAt = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(\d{1,2})[.)]?\s*$/.exec(lines[i]);
    if (m) rowAt.push({ i, n: parseInt(m[1], 10) });
  }
  // Walk the Sr-No sequence 1,2,3,… GREEDILY, skipping any lone number that isn't the
  // next expected row (in a marks table the "Marks" cell — 10, 15 — is also a lone number
  // sitting between rows, and would otherwise break a naive consecutive-run search).
  const best = [];
  let want = 1;
  for (let k = 0; k < rowAt.length; k++) {
    if (rowAt[k].n === want) { best.push(rowAt[k]); want++; }
  }
  if (best.length < 2) return null;   // need a real 1..N sequence

  const out = [];
  for (let k = 0; k < best.length; k++) {
    const from = best[k].i + 1;
    const to = k + 1 < best.length ? best[k + 1].i : lines.length;
    const rowLines = lines.slice(from, to);

    if (isMarksTable) {
      // Row layout: [Criteria …][Marks number][Maximum Marks / Weightage bands …].
      // The Criteria cell is the actual requirement; the Weightage cell holds the SCORING
      // bands (turnover slabs, year slabs). The Marks value is a lone number that sits
      // between them, so cut the criterion at the first lone number and keep the rest as
      // the scoring bands — where thresholds like "₹1 crore" and "7 years" actually live.
      let splitIdx = rowLines.findIndex(l => /^\s*\d{1,2}\s*$/.test(l));
      if (splitIdx < 1) splitIdx = rowLines.length;   // no marks cell found — keep it all
      const crit  = rowLines.slice(0, splitIdx).join(' ').replace(/\s+/g, ' ').trim();
      const bands = rowLines.slice(splitIdx + 1).join(' ').replace(/\s+/g, ' ').trim();
      if (crit.length >= 12) out.push({ n: String(best[k].n), text: crit.slice(0, 600), bands: bands.slice(0, 900), scored: true });
      continue;
    }

    // Doc table: keep the requirement, drop the trailing "Documents to be furnished" column.
    let cell = rowLines.join(' ').replace(/\s+/g, ' ').trim();
    const dm = DOC_COL.exec(cell);
    if (dm && dm.index > 20) cell = cell.slice(0, dm.index).trim();
    if (cell.length >= 12) out.push({ n: String(best[k].n), text: cell.slice(0, 600) });
  }
  return out.length >= 2 ? out : null;
}

function splitClauses(body) {
  const s = String(body || '').replace(/\r/g, '');

  const table = parseCriteriaTable(s);
  if (table) return table;

  function collect(re, minHits) {
    const hits = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(s))) {
      const label = m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || m[7] || '•';
      const at = m.index + (m[0].length - m[0].replace(/^[\s;]+/, '').length);
      const rest = s.slice(re.lastIndex, re.lastIndex + 14);
      // "Rs 5.00 crore" wraps onto its own line and looks exactly like clause "5.00".
      // Reading it as a marker splits the real criterion in half. Two tells:
      // a money/measure unit right after it, or a zero-padded sub-number (5.00, 2.05)
      // which no tender ever uses for numbering.
      const isAmount = /^\s*(?:crores?|crs?\b|cr\b|lakhs?|lacs?|thousand|million|billion|%|percent|per\s*cent)/i.test(rest);
      const zeroPadded = /^\d{1,2}\.0\d*$/.test(String(label));
      if (!isAmount && !zeroPadded) hits.push({ at, end: re.lastIndex, label: String(label) });
      if (re.lastIndex === m.index) re.lastIndex++;   // never spin on a zero-width match
    }
    return hits.length >= minHits ? dominant(hits) : null;
  }

  // Clause numbers inside one section share a parent ("2.1, 2.2, 2.3…"). A stray
  // "5.00" that survives the checks above still won't match that parent, so drop
  // outliers when a clear majority agrees. Only applies to dotted numbering.
  function dominant(hits) {
    const parents = {};
    let dotted = 0;
    hits.forEach(h => { const m = /^(\d{1,2})\.\d/.exec(h.label); if (m) { parents[m[1]] = (parents[m[1]] || 0) + 1; dotted++; } });
    if (dotted < 3) return hits;
    const top = Object.keys(parents).sort((a, b) => parents[b] - parents[a])[0];
    if (parents[top] / dotted < 0.6) return hits;
    return hits.filter(h => { const m = /^(\d{1,2})\.\d/.exec(h.label); return !m || m[1] === top; });
  }

  // Two markers is the threshold: one lone "1." is a numbered paragraph, not a list.
  const hits = collect(CL_LINE, 2) || collect(CL_INLINE, 2);

  const out = [];
  if (!hits) {
    // Unnumbered prose — fall back to sentences so we still show points
    const parts = [];
    let buf = '';
    s.split(/(?<=\.)\s+(?=[A-Z(])/).forEach(seg => {
      buf = buf ? buf + ' ' + seg : seg;
      if (!ABBREV.test(buf.trim())) { parts.push(buf.trim()); buf = ''; }
    });
    if (buf.trim()) parts.push(buf.trim());
    parts.map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length > 25).slice(0, 20)
      .forEach((t, i) => out.push({ n: String(i + 1), text: t.slice(0, 600) }));
    return out;
  }
  hits.forEach((h, i) => {
    const text = s.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : s.length)
      .replace(/\s+/g, ' ').trim();
    if (text.length >= 12) out.push({ n: h.label, text: text.slice(0, 600) });
  });
  return out.slice(0, 30);
}
// Pull whatever structured criteria we can out of the tender text
function extractTenderCriteria(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = { raw: {} };
  // Read the criteria the way the tender writes them: find the section, keep the
  // wording, and split it into the tender's own points.
  const sec = findEligibilitySection(text);
  if (sec) {
    out.sectionTitle = sec.title;
    out.sectionText = sec.body.slice(0, 4000);
    out.clauses = splitClauses(sec.body);
  } else {
    out.clauses = [];
  }
  const emd = moneyNear(t, ['(?:EMD|Earnest\\s*Money(?:\\s*Deposit)?)'], 90);
  // Sanity floors: a misread ("3") must never pass as a real requirement
  if (emd && emd.value >= 500) { out.emdAmount = emd.value; out.raw.emd = emd.raw; }
  const fee = moneyNear(t, ['(?:Tender\\s*(?:Document\\s*)?Fee|Cost\\s*of\\s*(?:the\\s*)?(?:Tender|Bid|Document)s?|Application\\s*Fee|Processing\\s*Fee)'], 90);
  if (fee && fee.value >= 50) { out.tenderFee = fee.value; out.raw.fee = fee.raw; }
  const to = moneyNear(t, [
    'turnover[\\s\\S]{0,50}?(?:not\\s*less\\s*than|at\\s*least|min(?:imum)?|shall\\s*be|should\\s*be)',
    '(?:minimum|min\\.?|average|avg\\.?)?\\s*(?:annual\\s*)?turnover'
  ], 150);
  if (to && to.value >= 10000) { out.minTurnover = to.value; out.raw.turnover = to.raw; }
  const mYr = firstMatch(t, [
    /(?:firm|firms)[\s\S]{0,80}?(?:in\s*existence|standing|established|practice)[\s\S]{0,40}?(\d{1,2})\s*(?:\+)?\s*years/i,
    /(?:minimum|at\s*least|not\s*less\s*than)\s*(\d{1,2})\s*years[\s\S]{0,60}?(?:experience|standing|existence|practice)/i,
    /(\d{1,2})\s*years[\s\S]{0,40}?(?:of\s*)?(?:experience|standing|existence)/i
  ]);
  if (mYr) { out.minYears = parseInt(mYr[1], 10); out.raw.years = mYr[0].trim().slice(0, 160); }
  const mP = firstMatch(t, [
    /(?:minimum|at\s*least|not\s*less\s*than)\s*(\d{1,2})\s*(?:full[\s-]*time\s*)?partners/i,
    /(\d{1,2})\s*(?:full[\s-]*time\s*)?partners[^.]{0,40}?(?:required|mandatory|minimum)/i
  ]);
  if (mP) { out.minPartners = parseInt(mP[1], 10); out.raw.partners = mP[0].trim().slice(0, 160); }
  const mF = firstMatch(t, [/(\d{1,2})\s*(?:partners?\s*)?(?:should\s*be\s*|must\s*be\s*)?FCA/i, /FCA[^.]{0,30}?(?:minimum|at\s*least)\s*(\d{1,2})/i]);
  if (mF) { out.minFcaPartners = parseInt(mF[1], 10); out.raw.fca = mF[0].trim().slice(0, 120); }
  if (/peer\s*review/i.test(t)) { out.peerReviewRequired = true; out.raw.peer = (t.match(/[^.]{0,80}peer\s*review[^.]{0,80}/i) || [''])[0].trim().slice(0, 180); }
  if (/(?:C\s*&\s*AG|CAG)\s*(?:empanel|empanell?ed|panel)/i.test(t)) { out.cagRequired = true; out.raw.cag = (t.match(/[^.]{0,60}(?:C\s*&\s*AG|CAG)[^.]{0,80}/i) || [''])[0].trim().slice(0, 180); }
  if (/RBI\s*(?:empanel|empanell?ed|panel)/i.test(t)) { out.rbiRequired = true; out.raw.rbi = (t.match(/[^.]{0,60}RBI[^.]{0,80}/i) || [''])[0].trim().slice(0, 180); }
  return out;
}

// Judge ONE criterion, as written, against the firm profile.
// status: met | not-met | unknown (asked but we can't answer) | info (no auto-check)
function judgeClause(profile, c) {
  const text = String(c.text || '');
  const t = text.toLowerCase();
  const money = v => '₹' + Number(v || 0).toLocaleString('en-IN');
  const out = { n: c.n, text: text.slice(0, 400), kind: 'other', status: 'info', note: '' };
  const firmYears = (() => {
    let y = num(profile.experienceYears);
    if (!y && profile.constitutionDate) {
      const d = new Date(profile.constitutionDate);
      if (!isNaN(d)) y = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
    }
    return y;
  })();
  const tYears = [num(profile.turnoverY1), num(profile.turnoverY2), num(profile.turnoverY3)].filter(v => v > 0);
  const turnoverBest = tYears.length ? Math.max.apply(null, tYears) : 0;
  const turnoverMin = tYears.length ? Math.min.apply(null, tYears) : 0;
  const turnoverAvg = tYears.length ? Math.round(tYears.reduce((a, b) => a + b, 0) / tYears.length) : 0;
  const numIn = (re) => { const m = text.match(re); return m ? parseInt(m[1] || m[2], 10) : 0; };

  // Not a requirement we can test — it's a declaration to sign
  if (/blacklist|debar|black\s*list/.test(t)) {
    return { ...out, kind: 'declaration', status: 'info', note: 'Declaration — confirm the firm is not blacklisted/debarred.' };
  }
  if (/convict(?:ed|ion)|court\s*of\s*law|criminal\s*case|prosecut/.test(t)) {
    return { ...out, kind: 'declaration', status: 'info', note: 'Declaration — confirm no conviction, and sign the annexure named in the clause.' };
  }
  // A document to attach, not a capability to test
  if (/^(?:copy|photocopy|self[\s-]*attested|scanned)\b|shall\s*attach|to\s*be\s*enclosed|duly\s*signed\s*annexure|authority\s*letter/.test(t)
      && !/turnover|partner|experience|empanel/.test(t)) {
    return { ...out, kind: 'document', status: 'info', note: 'Document to attach with the bid — no eligibility test.' };
  }
  // Similar / past work experience — MUST run before turnover & registration, because
  // these clauses say "GST audit and filing of GST return for a listed PSU", and "GST"
  // would otherwise be misread as a GST-registration requirement and wrongly pass.
  if (/similar\s*(?:kind|nature|type|line)?\s*(?:of\s*)?(?:work|assignment|audit|nature|services?|experience)|(?:experience|carried\s*out|executed|completed|handled|performed|conducted)[\s\S]{0,90}?(?:audit|assignment)[\s\S]{0,140}?(?:psu|public\s*sector|government|govt|nigam|\bboard\b|authorit|corporation|undertaking|listed|municipal|\bbanks?\b|scheduled\s*commercial|concurrent)|(?:internal|concurrent|statutory|tax|gst|stock|revenue)\s*audit[\s\S]{0,80}?(?:psu|public\s*sector|government|govt|nigam|\bboard\b|authorit|corporation|undertaking|listed|\bbanks?\b)/.test(t)) {
    out.kind = 'similar_work';
    const src = (text + ' ' + (c.bands || '')).toLowerCase();
    // What KIND of assignment and WHOSE books does the clause ask for?
    const types = new Set();
    if (/internal\s*audit/.test(src)) types.add('internal');
    if (/concurrent\s*audit|concurrent/.test(src)) types.add('concurrent');
    if (/statutory\s*audit/.test(src)) types.add('statutory');
    if (/tax\s*audit/.test(src)) types.add('tax');
    if (/gst\s*(?:audit|return|filing)/.test(src)) types.add('gst');
    if (/stock\s*audit/.test(src)) types.add('stock');
    if (/revenue\s*audit/.test(src)) types.add('revenue');
    const kinds = new Set();
    if (/\bbank|scheduled\s*commercial|concurrent/.test(src)) kinds.add('bank');
    if (/psu|public\s*sector|undertaking|\bpsus?\b/.test(src)) kinds.add('psu');
    if (/government|govt|ministry|\bdepartment|nigam|municipal|autonomous|statutory\s*(?:body|corporation)|authorit|\bboard\b/.test(src)) kinds.add('government');
    if (/listed/.test(src)) kinds.add('listed');
    const minYears = num((src.match(/(?:minimum|at\s*least|min\.?|not\s*less\s*than)\s*(?:of\s*)?(\d{1,2})\s*years/) || [])[1]);
    const minCount = num((src.match(/(?:minimum|at\s*least|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:listed|psu|assignment|client|organi[sz]ation|bank|number|no\.?)|(\d{1,2})\s*(?:listed|psu[s]?|similar\s*assignment)/) || []).slice(1).find(Boolean));

    const label = (types.size ? [...types].map(x => x[0].toUpperCase() + x.slice(1)).join('/') + ' audit' : 'similar work')
      + (kinds.size ? ' for ' + [...kinds].join('/') : '');
    const needStr = 'Needs ' + label + (minYears ? ', min ' + minYears + ' yrs' : '') + (minCount ? ', min ' + minCount + ' client(s)' : '');
    // Match on the full criteria, and separately on the CLIENT KIND alone. The client kind
    // (PSU / bank / listed) is the hard part; the assignment type after "i.e." is often
    // illustrative, so a client-kind match of a different audit type is a "review", not a fail.
    const full = matchExperience(profile, { types, kinds, minYears, minCount });
    const kindOnly = matchExperience(profile, { types: new Set(), kinds, minYears, minCount });
    const ev = m => m.matches.slice(0, 4).map(r => {
      const yr = r.fromDate ? (r.fromDate.slice(0, 4) + (r.ongoing ? '–present' : (r.toDate ? '–' + r.toDate.slice(0, 4) : ''))) : '';
      return r.client + (r.clientType || r.assignmentType ? ' (' + [r.clientType, r.assignmentType].filter(Boolean).join(', ') + (yr ? ', ' + yr : '') + ')' : (yr ? ' (' + yr + ')' : ''));
    }).join('; ');

    if (!full.total) {
      return { ...out, status: 'unknown',
        note: needStr + '. No audit-experience records on file yet — add them in Firm Profile → Audit Experience so this can be checked.' };
    }
    const okCount = full.count >= (minCount || 1);
    const okYears = minYears ? full.years >= minYears : true;
    if (okCount && okYears) {
      return { ...out, status: 'met', required: minCount || 1,
        note: needStr + ' · we have ' + full.count + ' matching engagement(s)' + (full.years ? ' across ' + full.years + ' year(s)' : '') + (ev(full) ? ' — e.g. ' + ev(full) : '') };
    }
    if (full.count > 0) {   // right type, but short on count/years — a genuine shortfall
      const gap = [];
      if (!okCount) gap.push('need ' + (minCount || 1) + ', have ' + full.count);
      if (!okYears) gap.push('need ' + minYears + ' yrs, have ' + full.years);
      return { ...out, status: 'not-met', required: minCount || 1, note: needStr + ' (' + gap.join('; ') + ') — ' + ev(full) };
    }
    if (types.size && kindOnly.count > 0) {   // we serve the right client kind, different audit type
      return { ...out, status: 'unknown',
        note: needStr + ' — we have ' + kindOnly.count + ' engagement(s) for these clients but of a different audit type; confirm they count. E.g. ' + ev(kindOnly) };
    }
    return { ...out, status: 'not-met', required: minCount || 1,
      note: needStr + ' — no matching records in Audit Experience.' };
  }
  // Firm category / MEF ranking ("The firm should be Category-I as per ICAI ranking")
  if (/\bcategor(?:y|ies)\b/.test(t) && /(?:as\s*per|icai|mef|ranking|multipurpose\s*empanel|empanel)/.test(t)) {
    out.kind = 'category';
    const want = (text.match(/categor(?:y|ies)\s*[-–:]?\s*(I{1,3}V?|IV|[1-4])\b/i) || [])[1];
    const have = profile.mefCategory || profile.firmCategory || '';
    if (want && have) {
      const norm = x => String(x).toUpperCase().replace(/[^IV1-4]/g, '');
      return { ...out, status: norm(have) === norm(want) ? 'met' : 'not-met',
        note: 'Requires Category ' + want + ' · Firm Profile says Category ' + have + '.' };
    }
    return { ...out, status: 'unknown',
      note: 'Requires ' + (want ? 'Category ' + want : 'a specific ICAI/MEF category') + ' — firm category is not recorded in the Firm Profile. Confirm from the latest MEF / Firm Card.' };
  }
  // Turnover / receipts / fee income  (tenders word this many ways)
  if (/turnover|gross\s*receipt|annual\s*receipt|professional\s*receipt|fee\s*income|gross\s*(?:professional\s*)?fee|revenue/.test(t)) {
    out.kind = 'turnover';
    // WHOSE turnover? Clauses like "experience in an Institute imparting Technical
    // Education having minimum turnover of Rs 5.00 crore" describe the CLIENT, not us.
    // Testing our books against the client's turnover invents a false "Not Eligible".
    const thirdParty = /(?:institute|university|college|school|autonomous\s*body|organisation|organization|department|undertaking|client|company|entity)[^.]{0,80}?(?:having|with|of)\s*(?:a\s*)?(?:minimum\s*)?(?:annual\s*)?turnover/.test(t);
    const aboutUs = /(?:bidder|firm|applicant|agency|tenderer|company)['’s]*\s*(?:annual\s*|average\s*|gross\s*)*(?:turnover|receipts?)|turnover\s*of\s*the\s*(?:bidder|firm|applicant|agency|tenderer)/.test(t);
    if (thirdParty && !aboutUs) {
      return { ...out, kind: 'experience', status: 'info',
        note: 'The turnover figure here belongs to the client/institute, not to us — this clause is about where our experience was gained. Read it manually.' };
    }
    // "AVERAGE annual turnover over the last 3 years", "minimum X on EACH year basis",
    // and "turnover in ANY ONE of the last 3 years" are three different tests. Using
    // our best year for all three would pass a firm that does not actually qualify.
    const wantsAvg = /\baverage|\bavg\b|\bmean\b/.test(t);
    const wantsEach = /each\s*year|every\s*year|each\s*of\s*the|in\s*each|all\s*(?:the\s*)?three\s*(?:financial\s*)?years?|consecutive/.test(t);
    const ourTurnover = wantsAvg ? turnoverAvg : (wantsEach ? turnoverMin : turnoverBest);
    const basis = wantsAvg ? 'average of ' + tYears.length + ' yr'
                : wantsEach ? 'lowest of ' + tYears.length + ' yr' : 'best year';
    const m = moneyNear(text, ['(?:turnover|receipts?|fee\\s*income|fees?|revenue)'], 130) || moneyNear(text, ['(?:minimum|at\\s*least|not\\s*less\\s*than|of)'], 60);
    let need = m && m.value >= 10000 ? m.value : 0;
    // Scored matrices ("Marks" table) put the amount in the WEIGHTAGE bands, not the
    // criteria cell — e.g. "₹1 cr but <₹5 cr → 5 marks … >₹10 cr → 15 marks". The
    // qualifying floor is the SMALLEST slab; read it from the bands so we can still judge.
    let scoredFloor = false;
    if (!need && c.bands) {
      const amts = []; const re = /(?:₹|Rs\.?|INR)\s*([\d][\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|crs?|cr)\b/gi;
      let mm; while ((mm = re.exec(c.bands))) { const v = toAmount(mm[1], mm[2]); if (v >= 10000) amts.push(v); }
      if (amts.length) { need = Math.min.apply(null, amts); scoredFloor = true; }
    }
    if (!need) return { ...out, status: 'unknown', note: 'Turnover/receipts required but the amount could not be read — open the PDF.' };
    out.required = need;
    if (!ourTurnover) return { ...out, status: 'unknown', note: 'Requires ' + money(need) + ' — our turnover is blank in the Firm Profile.' };
    out.status = ourTurnover >= need ? 'met' : 'not-met';
    out.note = (scoredFloor ? 'Scored — minimum to score marks: ' : 'Requires ') + money(need)
             + (wantsAvg ? ' (average)' : '') + ' · we have ' + money(ourTurnover) + ' (' + basis + ')';
    return out;
  }
  // Peer review
  if (/peer\s*review/.test(t)) {
    out.kind = 'peer_review';
    if (!profile.peerReview) return { ...out, status: 'not-met', note: 'Peer Review certificate required — Firm Profile says we do not hold one.' };
    if (profile.peerReviewValidTill && profile.peerReviewValidTill < todayStr())
      return { ...out, status: 'not-met', note: 'Our Peer Review certificate expired on ' + profile.peerReviewValidTill + '.' };
    return { ...out, status: 'met', note: 'We hold a valid Peer Review certificate' + (profile.peerReviewValidTill ? ' (till ' + profile.peerReviewValidTill + ')' : '') + '.' };
  }
  // CAG empanelment
  if (/c\s*&?\s*ag|comptroller\s*(?:and|&)\s*auditor/.test(t)) {
    out.kind = 'cag';
    return profile.cagEmpanelled
      ? { ...out, status: 'met', note: 'We are CAG empanelled' + (profile.cagCategory ? ' (Category ' + profile.cagCategory + ')' : '') + '.' }
      : { ...out, status: 'not-met', note: 'CAG empanelment required — Firm Profile says we are not empanelled.' };
  }
  // RBI empanelment
  if (/\brbi\b|reserve\s*bank/.test(t)) {
    out.kind = 'rbi';
    return profile.rbiEmpanelled
      ? { ...out, status: 'met', note: 'We are RBI empanelled.' }
      : { ...out, status: 'not-met', note: 'RBI empanelment required — Firm Profile says we are not empanelled.' };
  }
  // Partners (FCA-specific if the clause says so).
  // Must be about the NUMBER OF PARTNERS — not merely a clause naming "Partnership firm /
  // LLP" as a permitted constitution. Otherwise "Partnership firm … minimum of 7 years"
  // is misread as "7 partners" and a firm is wrongly failed.
  const partnerCount = /\bfca\b|fellow\s*member/.test(t)
    || /(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*|or\s*more\s*)?(?:fca\s*|fellow\s*|chartered\s*accountants?\s*|cas?\s*)?(?:as\s*)?partners?\b/i.test(t)
    || /partners?\b[\s\S]{0,20}?(?:minimum|at\s*least|not\s*less\s*than|shall\s*be|should\s*be)\s*\d/i.test(t)
    || /number\s*of\s*(?:ca\s*)?(?:as\s*)?partners?/i.test(t)
    || /\bproprietor\b/.test(t);
  if (partnerCount) {
    out.kind = 'partners';
    // "CA to be DEPLOYED should be FCA with 5 years' experience" is about the person we
    // put on the job, not about how many partners the firm has. Counting partners here
    // reads the "5 year" as a partner count and reports nonsense.
    if (/to\s*be\s*deployed|deployed|posted|assigned\s*to\s*(?:the\s*)?(?:work|assignment)|team\s*leader|engagement\s*partner/.test(t)) {
      const haveFca = num(profile.fcaPartners);
      return { ...out, kind: 'staffing', status: 'info',
        note: 'About the person we deploy, not a firm-level count. We have ' + (haveFca || 'no') + ' FCA partner(s) on record — confirm one meets the experience asked here.' };
    }
    // COMPOUND CLAUSE — the common tender phrasing is
    //   "minimum 3 full time partners, out of which at least 2 should be FCA"
    // Reading that as "3 FCA required" fails a firm that actually qualifies, so the
    // total and the FCA sub-requirement must be pulled out and checked separately.
    const comp = t.match(/(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*)?partners?\b[\s\S]{0,60}?(?:out\s*of\s*(?:which|whom)|of\s*(?:which|whom)|including|whereof)[\s\S]{0,30}?(\d{1,2})[\s\S]{0,25}?(?:fca|fellow)/i)
      // "at least 5 CAs or more as partners and at least 3 CAs should be FCA"
      || t.match(/(\d{1,2})\s*(?:cas?|chartered\s*accountants?)?[\s\S]{0,20}?(?:or\s*more\s*)?(?:as\s*)?partners?\b[\s\S]{0,50}?\band\b[\s\S]{0,40}?(\d{1,2})\s*(?:cas?|chartered\s*accountants?)?[\s\S]{0,25}?(?:should\s*be\s*|must\s*be\s*|to\s*be\s*)?(?:fca|fellow)/i);
    if (comp) {
      out.kind = 'partners_fca';
      const needTot = num(comp[1]), needFca = num(comp[2]);
      out.required = needTot;
      const haveTot = num(profile.partnersTotal), haveFca = num(profile.fcaPartners);
      if (!haveTot || !haveFca) {
        return { ...out, status: 'unknown',
          note: 'Requires ' + needTot + ' partner(s) incl. ' + needFca + ' FCA — partner counts are blank in the Firm Profile.' };
      }
      const okTot = haveTot >= needTot, okFca = haveFca >= needFca;
      out.status = (okTot && okFca) ? 'met' : 'not-met';
      out.note = 'Requires ' + needTot + ' partner(s) (we have ' + haveTot + (okTot ? ' ✓' : ' ✗') +
                 ') incl. ' + needFca + ' FCA (we have ' + haveFca + (okFca ? ' ✓' : ' ✗') + ')';
      return out;
    }
    const wantsFca = /\bfca\b|fellow/.test(t);
    out.kind = wantsFca ? 'fca_partners' : 'partners';
    const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than|atleast)\s*(?:of\s*)?(\d{1,2})/i)
              || numIn(/(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*)?(?:fca\s*|fellow\s*)?partners?/i)
              || numIn(/partners?[^.]{0,25}?(\d{1,2})/i);
    if (!need) return { ...out, status: 'info', note: 'Mentions partners but no minimum number could be read — check the PDF.' };
    out.required = need;
    const have = wantsFca ? num(profile.fcaPartners) : num(profile.partnersTotal);
    if (!have) return { ...out, status: 'unknown', note: 'Requires ' + need + (wantsFca ? ' FCA partner(s)' : ' partner(s)') + ' — count is blank in the Firm Profile.' };
    out.status = have >= need ? 'met' : 'not-met';
    out.note = 'Requires ' + need + (wantsFca ? ' FCA partner(s)' : ' partner(s)') + ' · we have ' + have;
    return out;
  }
  // Years of standing / existence / years in operation
  if (/year/.test(t) && /(experience|standing|existence|practice|established|constitut|operat|in\s*business|incorporat)/.test(t)) {
    out.kind = 'experience';
    // Prefer the stated MINIMUM ("minimum of 7 years in operation") over the first stray
    // number — clauses like "registered for the last 3 years … minimum of 7 years in
    // operation" carry two, and grabbing "3" would understate the real gate.
    const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than|min\.?|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:\+)?\s*years/i)
              || numIn(/(\d{1,2})\s*(?:\+)?\s*years?\s*(?:in\s*(?:operation|business|existence)|of\s*(?:experience|standing|existence|operation))/i)
              || numIn(/(\d{1,2})\s*(?:\+)?\s*years?/i);
    if (!need) return { ...out, status: 'info', note: 'Mentions experience but no number of years could be read.' };
    out.required = need;
    if (!firmYears) return { ...out, status: 'unknown', note: 'Requires ' + need + ' years — firm age is blank in the Firm Profile.' };
    out.status = firmYears >= need ? 'met' : 'not-met';
    out.note = 'Requires ' + need + ' years · we have ' + firmYears + (c.scored ? ' (scored — see bands)' : '');
    return out;
  }
  // Qualified staff
  if (/qualified\s*(?:assistant|staff|chartered)|chartered\s*accountants?\s*(?:on\s*(?:its\s*)?rolls?|employed)|audit\s*staff|semi[\s-]*qualified/.test(t)) {
    out.kind = 'ca_staff';
    const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than)\s*(\d{1,2})/i) || numIn(/(\d{1,2})\s*(?:qualified|chartered|ca\b)/i);
    const have = num(profile.caEmployees);
    if (!need) return { ...out, status: 'info', note: 'Mentions qualified staff but no number could be read.' };
    out.required = need;
    if (!have) return { ...out, status: 'unknown', note: 'Requires ' + need + ' qualified staff — count is blank in the Firm Profile.' };
    out.status = have >= need ? 'met' : 'not-met';
    out.note = 'Requires ' + need + ' · we have ' + have;
    return out;
  }
  // Registrations  ("GST registration should be available with the bidder")
  if (/\bgstin?\b|\bgst\b|\bpan\b|\bmsme\b|udyam|registration\s*(?:no|number|certificate)/.test(t)) {
    out.kind = 'registration';
    const need = [];
    if (/\bgstin?\b|\bgst\b/.test(t) && !profile.gstin) need.push('GSTIN');
    if (/\bpan\b/.test(t) && !profile.pan) need.push('PAN');
    if (/(\bmsme\b|udyam)/.test(t) && !profile.msme) need.push('MSME/Udyam');
    if (need.length) return { ...out, status: 'unknown', note: 'Asks for ' + need.join(', ') + ' — not filled in the Firm Profile.' };
    return { ...out, status: 'met', note: 'Registration numbers are on file in the Firm Profile.' };
  }
  // Local presence
  if (/office|branch|located|situated|local\s*presence|head\s*quarter/.test(t)) {
    out.kind = 'location';
    const states = (profile.states || []).map(s => s.toLowerCase()).filter(Boolean);
    const ours = (profile.states || []).join(', ') || 'not set';
    const hit = states.find(s => t.includes(s));
    if (hit) return { ...out, status: 'met', note: 'We have a presence in ' + hit.replace(/\b\w/g, ch => ch.toUpperCase()) + '.' };
    // Name the place the tender actually wants — "check the location" helps nobody.
    const pm = c.text.match(/(?:office|branch|presence)[^.]{0,40}?\b(?:in|at)\s+([A-Z][A-Za-z]+(?:\s*\([^)]{1,12}\))?)/);
    const place = pm ? pm[1].trim() : '';
    // Scope mandatory/preference to the SENTENCE holding the place. Clauses routinely
    // pair the two — "should have a branch office in X. Preference to head office in X."
    // Reading "preference" from the second sentence would downgrade a hard requirement.
    const sent = pm ? (c.text.slice(0, pm.index + pm[0].length).split(/(?<=\.)\s+/).pop() || c.text) : c.text;
    const st = sent.toLowerCase();
    const mand = /should|shall|must|required/.test(st) && !/preference|preferab|desirab/.test(st);
    return { ...out, status: place ? 'unknown' : 'info',
      note: place
        ? 'Wants an office in ' + place + (mand ? ' (mandatory)' : ' (preference only)') + ' — our states: ' + ours + '. Confirm whether we have a registered office there.'
        : 'Mentions office/location — check whether a local office is mandatory. Our states: ' + ours + '.' };
  }
  // EMD / fee: a cost, not a qualification
  if (/emd|earnest\s*money|bid\s*security|tender\s*fee|cost\s*of\s*(?:tender|bid|document|rfp)/.test(t)) {
    const m = moneyNear(text, ['(?:emd|earnest\\s*money|bid\\s*security|fee|cost)'], 90);
    return { ...out, kind: 'cost', status: 'info', note: m ? 'Payable: ' + money(m.value) : 'A fee/EMD is payable — see the PDF.' };
  }
  return out;   // unclassified → shown as-is for a human to read
}

// Compare what the tender wants against what GARP has.
// Deliberately three-state: we never hard-fail on a criterion we couldn't read.
function evaluateEligibility(profile, crit, tender) {
  const reasons = [], fails = [];
  let checks = 0, unknowns = 0;   // unknowns = the tender asks, but our profile can't answer
  const money = v => '₹' + Number(v || 0).toLocaleString('en-IN');

  // ── Preferred path: judge the tender's OWN points, one by one ──
  if (profile && profile.configured && (crit.clauses || []).length) {
    const points = crit.clauses.map(c => judgeClause(profile, c));
    const notMet = points.filter(p => p.status === 'not-met');
    const unk = points.filter(p => p.status === 'unknown');
    const met = points.filter(p => p.status === 'met');
    let verdict;
    if (notMet.length) verdict = 'Not Eligible';
    else if (unk.length || !met.length) verdict = 'Needs Review';
    else verdict = 'Eligible';
    const summary = met.length + ' of ' + points.filter(p => p.status !== 'info').length + ' checkable criteria met'
      + (notMet.length ? ' · ' + notMet.length + ' not met' : '')
      + (unk.length ? ' · ' + unk.length + ' need info' : '');
    return {
      verdict, points, summary,
      sectionTitle: crit.sectionTitle || '',
      checks: points.filter(p => p.status !== 'info').length,
      unknowns: unk.length, failCount: notMet.length,
      reasons: [summary].concat(
        notMet.map(p => '✗ ' + p.note),
        unk.map(p => '⚠ ' + p.note),
        met.map(p => '✓ ' + p.note)
      )
    };
  }

  // Until the firm profile is actually filled in, an unset flag means "we don't
  // know", NOT "we don't have it" — so never declare Not Eligible off a blank profile.
  if (!profile || !profile.configured) {
    const wants = [];
    if (crit.minTurnover) wants.push('turnover ' + money(crit.minTurnover));
    if (crit.minYears) wants.push(crit.minYears + ' years standing');
    if (crit.minPartners) wants.push(crit.minPartners + ' partners');
    if (crit.minFcaPartners) wants.push(crit.minFcaPartners + ' FCA partners');
    if (crit.peerReviewRequired) wants.push('peer review certificate');
    if (crit.cagRequired) wants.push('CAG empanelment');
    if (crit.rbiRequired) wants.push('RBI empanelment');
    return {
      verdict: 'Needs Review',
      reasons: ['⚠ Firm profile not set up — fill it in under Settings → Firm Profile to enable automatic eligibility checks.']
        .concat(wants.length ? ['This tender appears to require: ' + wants.join(', ')] : []),
      checks: 0, unknowns: wants.length, failCount: 0
    };
  }
  const ourTurnover = Math.max(num(profile.turnoverY1), num(profile.turnoverY2), num(profile.turnoverY3));
  if (crit.minTurnover) {
    checks++;
    if (!ourTurnover) { unknowns++; reasons.push('⚠ Turnover required ' + money(crit.minTurnover) + ' — our turnover not filled in the firm profile'); }
    else if (ourTurnover >= crit.minTurnover) reasons.push('✓ Turnover ' + money(ourTurnover) + ' meets ' + money(crit.minTurnover));
    else { fails.push('Turnover ' + money(ourTurnover) + ' is below the required ' + money(crit.minTurnover)); }
  }
  if (crit.minYears) {
    checks++;
    let ourYears = num(profile.experienceYears);
    if (!ourYears && profile.constitutionDate) {
      const d = new Date(profile.constitutionDate);
      if (!isNaN(d)) ourYears = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
    }
    if (!ourYears) { unknowns++; reasons.push('⚠ ' + crit.minYears + ' years standing required — our firm age not filled in'); }
    else if (ourYears >= crit.minYears) reasons.push('✓ ' + ourYears + ' years standing meets ' + crit.minYears);
    else fails.push('Firm standing ' + ourYears + ' years is below the required ' + crit.minYears);
  }
  if (crit.minPartners) {
    checks++;
    const p = num(profile.partnersTotal);
    if (!p) { unknowns++; reasons.push('⚠ ' + crit.minPartners + ' partners required — partner count not filled in'); }
    else if (p >= crit.minPartners) reasons.push('✓ ' + p + ' partners meets ' + crit.minPartners);
    else fails.push('Only ' + p + ' partners against the required ' + crit.minPartners);
  }
  if (crit.minFcaPartners) {
    checks++;
    const f = num(profile.fcaPartners);
    if (!f) { unknowns++; reasons.push('⚠ ' + crit.minFcaPartners + ' FCA partners required — FCA count not filled in'); }
    else if (f >= crit.minFcaPartners) reasons.push('✓ ' + f + ' FCA partners meets ' + crit.minFcaPartners);
    else fails.push('Only ' + f + ' FCA partners against the required ' + crit.minFcaPartners);
  }
  if (crit.peerReviewRequired) {
    checks++;
    if (!profile.peerReview) fails.push('Peer review certificate required — firm profile says we do not hold one');
    else if (profile.peerReviewValidTill && profile.peerReviewValidTill < todayStr())
      fails.push('Peer review certificate expired on ' + profile.peerReviewValidTill);
    else reasons.push('✓ Peer review certificate held' + (profile.peerReviewValidTill ? ' (valid till ' + profile.peerReviewValidTill + ')' : ''));
  }
  if (crit.cagRequired) {
    checks++;
    if (profile.cagEmpanelled) reasons.push('✓ CAG empanelled' + (profile.cagCategory ? ' (Cat ' + profile.cagCategory + ')' : ''));
    else fails.push('CAG empanelment required — firm profile says we are not CAG empanelled');
  }
  if (crit.rbiRequired) {
    checks++;
    if (profile.rbiEmpanelled) reasons.push('✓ RBI empanelled');
    else fails.push('RBI empanelment required — firm profile says we are not RBI empanelled');
  }
  // Location is advisory only — most tenders allow outside firms
  const states = (profile.states || []).map(s => s.toLowerCase());
  const loc = String((tender && (tender.location || tender.psuName)) || '').toLowerCase();
  if (states.length && loc) {
    const near = states.some(s => s && loc.includes(s));
    reasons.push(near ? '✓ Location matches one of our states' : 'ℹ Outside our listed states — check if local presence is mandatory');
  }
  // A clear fail is a fail. Otherwise we only say "Eligible" when every criterion
  // the tender asked for was actually verified against the firm profile — an
  // unverified criterion must never be reported as Eligible.
  let verdict;
  if (fails.length) verdict = 'Not Eligible';
  else if (checks === 0 || unknowns > 0) verdict = 'Needs Review';
  else verdict = 'Eligible';
  return { verdict, reasons: fails.map(f => '✗ ' + f).concat(reasons), checks, unknowns, failCount: fails.length };
}

// Download the tender PDF and read its text (best-effort)
async function readTenderPdf(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'GARP-Tracker/1.0' } });
    if (!r.ok) return { ok: false, error: 'PDF fetch returned ' + r.status };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) return { ok: false, error: 'PDF larger than 20 MB — skipped' };
    if (buf.slice(0, 4).toString() !== '%PDF') return { ok: false, error: 'Link did not return a PDF' };
    let pdfParse;
    try { pdfParse = require('pdf-parse/lib/pdf-parse.js'); }
    catch (e) { return { ok: false, error: 'pdf-parse not installed' }; }
    const data = await pdfParse(buf, { max: 40 }); // first 40 pages covers the eligibility clauses
    const text = String(data.text || '');
    const pages = data.numpages || 1;
    // Scanned tenders are images with no text layer — EXCEPT that stamping tools
    // still add a real "Page 3 of 23" footer to every page. A 23-page scan therefore
    // yields a few hundred characters of pure boilerplate, which a naive length check
    // mistakes for readable text (and we'd then silently extract nothing).
    // So: strip the boilerplate and measure actual letters, and letters per page.
    const body = text
      .replace(/page\s*\d+\s*(?:of|\/)\s*\d+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const letters = (body.match(/[A-Za-z]/g) || []).length;
    const perPage = letters / pages;
    if (letters < 400 || perPage < 80) {
      return {
        ok: false, scanned: true, pages, letters,
        error: `This tender is a scanned document — ${pages} page(s) but only ${letters} characters of selectable text. It can't be read automatically; open the PDF and check the criteria by hand.`
      };
    }
    return { ok: true, text, pages, letters };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'PDF download timed out' : (e.message || 'Could not read PDF') };
  } finally { clearTimeout(to); }
}

// Read one tender's PDF, extract criteria, judge eligibility, and record it
async function analyseTender(db, tender, actor) {
  const url = tender.pdfUrl || tender.sourceUrl;
  if (!url) return { ok: false, error: 'No tender document link on this tender' };
  const read = await readTenderPdf(url);
  const profile = getFirmProfile(db);
  if (!read.ok) {
    tender.extracted = { error: read.error, scanned: !!read.scanned, at: new Date().toISOString() };
    tender.eligibility = { verdict: 'Needs Review', reasons: ['⚠ ' + read.error], at: new Date().toISOString() };
    return { ok: false, error: read.error, verdict: 'Needs Review' };
  }
  const crit = extractTenderCriteria(read.text);
  const ev = evaluateEligibility(profile, crit, tender);
  // Fill blank money fields from the PDF — never overwrite what a human typed
  if (crit.emdAmount && !num(tender.emdAmount)) tender.emdAmount = crit.emdAmount;
  if (crit.tenderFee && !num(tender.tenderFee)) tender.tenderFee = crit.tenderFee;
  if (crit.minTurnover && !num(tender.tenderValue)) tender.tenderValue = 0; // turnover is a criterion, not the tender value
  tender.extracted = { ...crit, pages: read.pages, at: new Date().toISOString() };
  tender.eligibility = {
    verdict: ev.verdict, reasons: ev.reasons, checks: ev.checks,
    points: ev.points || [],                 // the tender's own criteria, judged one by one
    summary: ev.summary || '',
    sectionTitle: ev.sectionTitle || crit.sectionTitle || '',
    at: new Date().toISOString()
  };
  tender.updatedAt = new Date().toISOString();
  if (!tender.events) tender.events = [];
  tender.events.push({
    id: newId(), type: 'note', status: tender.status,
    note: 'Auto-check from tender PDF — ' + ev.verdict + (ev.reasons.length ? ': ' + ev.reasons.join(' | ') : ''),
    byId: 'system', byName: actor || 'Auto-import', date: new Date().toISOString()
  });
  return { ok: true, verdict: ev.verdict, reasons: ev.reasons, extracted: tender.extracted };
}

// ═══════════════════════════════════════════════════════════
// HOURLY AUTO-SYNC of ICAI tenders
// One listing fetch per hour, and at most a few PDFs per run so we stay a
// polite visitor to their site. Can be switched off in the firm profile.
// ═══════════════════════════════════════════════════════════
const SYNC_PDF_PER_RUN = 5;
let _syncRunning = false;
async function runTenderSync(trigger) {
  if (_syncRunning) return { skipped: 'already running' };
  _syncRunning = true;
  try {
    let db = readDB();
    const profile = getFirmProfile(db);
    if (profile.autoSync === false && trigger !== 'manual') { return { skipped: 'auto-sync off' }; }
    const html = await fetchTmdHtml();
    const items = parseTmdOpportunities(html);
    db = readDB();
    if (!db.tenders) db.tenders = [];
    const have = tenderKeySet(db.tenders);
    const now = new Date().toISOString();
    const pId = profile.defaultTenderPartnerId || '';
    const pName = profile.defaultTenderPartnerName || '';
    const fresh = [];
    items.forEach(i => {
      if (!i.ref) return;
      const key = tenderImportKey(i);
      if (have.has(key) || have.has(i.ref)) return;
      const noteBits = [i.description, i.address ? 'Address: ' + i.address : '', i.email ? 'Email: ' + i.email : '', i.pdfUrl ? 'Tender PDF: ' + i.pdfUrl : ''].filter(Boolean);
      const t = {
        id: newId(),
        category: TENDER_CATEGORIES.includes(i.category) ? i.category : 'psu_company',
        psuName: String(i.psuName).slice(0, 200), tenderRef: '', sourceRef: String(i.ref).slice(0, 80),
        importKey: key, description: String(i.description || '').slice(0, 400),
        natureOfWork: i.natureOfWork || '', applicationDate: '', dueDate: i.dueDate || '',
        tenderValue: 0, quotationValue: 0, emdAmount: 0, emdStatus: '',
        source: 'ICAI TMD', tenderFee: 0, bidOpeningDate: '', l1Value: 0,
        sourceUrl: i.sourceUrl || '', pdfUrl: i.pdfUrl || '',
        location: i.location || '', contactEmail: i.email || '',
        partnerId: pId, partnerName: pName,
        status: 'Identified', importedFrom: 'ICAI TMD (auto)', importedAt: now,
        createdBy: 'system', createdByName: 'Auto-sync', createdAt: now, updatedAt: now,
        events: [{ id: newId(), type: 'created', status: 'Identified', note: noteBits.join(' · ').slice(0, 1000), byId: 'system', byName: 'Auto-sync', date: now }]
      };
      db.tenders.push(t); have.add(key); if (t.sourceRef) have.add(t.sourceRef); fresh.push(t);
    });
    // Read a few tender PDFs per run: newest first, and any older ones never analysed
    const backlog = db.tenders.filter(t => t.importedFrom && String(t.importedFrom).startsWith('ICAI TMD') && !t.extracted && t.pdfUrl);
    const queue = [];
    fresh.forEach(t => { if (queue.length < SYNC_PDF_PER_RUN) queue.push(t); });
    backlog.forEach(t => { if (queue.length < SYNC_PDF_PER_RUN && !queue.includes(t)) queue.push(t); });
    let analysed = 0, eligible = 0;
    for (const t of queue) {
      try {
        const r = await analyseTender(db, t, 'Auto-sync');
        analysed++;
        if (r.ok && r.verdict === 'Eligible') eligible++;
      } catch (e) { /* keep going */ }
    }
    db.tenderSync = { at: now, found: items.length, imported: fresh.length, analysed, trigger: trigger || 'hourly' };
    writeDB(db);
    // Tell partners/admins about new tenders we look eligible for
    const newEligible = fresh.filter(t => t.eligibility && t.eligibility.verdict === 'Eligible');
    if (newEligible.length) {
      const recips = (db.users || []).filter(u => u.role === 'admin' || (u.designation || '').toLowerCase().includes('partner'));
      recips.forEach(u => {
        try {
          notifyUser(db, u.id, {
            title: '🏛 New tender(s) you may be eligible for',
            message: newEligible.slice(0, 5).map(t => t.psuName + ' — ' + t.natureOfWork + ' (due ' + (t.dueDate || 'n/a') + ')').join('; ') + (newEligible.length > 5 ? ' …and more' : ''),
            type: 'tender'
          });
          sendPushToUser(db, u.id, { title: '🏛 ' + newEligible.length + ' new eligible tender(s)', body: newEligible[0].psuName + ' — due ' + (newEligible[0].dueDate || 'n/a'), tag: 'tender', url: '/' }).catch(()=>{});
        } catch (e) {}
      });
      writeDB(db);
    }
    if (fresh.length || analysed) console.log(`🏛 Tender sync: ${items.length} listed, ${fresh.length} new, ${analysed} PDF(s) read, ${eligible} eligible`);
    return { found: items.length, imported: fresh.length, analysed };
  } catch (e) {
    console.error('Tender sync error:', e.message);
    try { const db = readDB(); db.tenderSync = { at: new Date().toISOString(), error: e.message, trigger: trigger || 'hourly' }; writeDB(db); } catch (x) {}
    return { error: e.message };
  } finally { _syncRunning = false; }
}
setInterval(() => { runTenderSync('hourly'); }, 60 * 60 * 1000);   // every hour
setTimeout(() => { runTenderSync('startup'); }, 90 * 1000);        // and shortly after boot

// Sync status + manual trigger
app.get('/api/tenders/sync-status', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  res.json({ ...(db.tenderSync || {}), autoSync: getFirmProfile(db).autoSync !== false });
});
app.post('/api/tenders/sync-now', auth, partnerOrAdmin, async (req, res) => {
  const r = await runTenderSync('manual');
  res.json({ ok: !r.error, ...r });
});

// ── Clean up duplicates already sitting in the data ──────────────────────────
// Groups tenders by content identity and keeps ONE per group: whichever has the
// most human activity (remarks/edits), falling back to the oldest. Only touches
// imported tenders — anything typed in by hand is left alone.
function tenderHumanEvents(t) {
  return ((t && t.events) || []).filter(e => e && e.byId && e.byId !== 'system' && e.type !== 'created').length;
}
app.post('/api/tenders/dedupe', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const all = db.tenders || [];
  const groups = new Map();
  all.forEach(t => {
    if (!t.importedFrom) return;                    // hand-made tenders are never touched
    // Always group on CONTENT. Grouping on tenderRef would find nothing, because
    // ICAI hands out a fresh pdf_id each time — which is how the duplicates arose.
    const key = t.importKey || storedTenderKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const remove = new Set();
  let dupeGroups = 0;
  groups.forEach(list => {
    if (list.length < 2) return;
    dupeGroups++;
    list.sort((a, b) => (tenderHumanEvents(b) - tenderHumanEvents(a)) ||
                        String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    list.slice(1).forEach(t => remove.add(t.id));   // keep list[0]
  });
  if (remove.size) {
    db.tenders = all.filter(t => !remove.has(t.id));
    logAudit(db, req, 'deleted', 'client', '', 'Government tenders', `removed ${remove.size} duplicate imported tender(s)`);
    writeDB(db);
  }
  res.json({ ok: true, removed: remove.size, groups: dupeGroups, remaining: (db.tenders || []).length });
});

// ── Read every imported tender's PDF, with live progress ─────────────────────
// The read runs in the background and the client polls /analyse-progress, so a
// long batch never blocks or times out the request.
let _batchJob = { running: false, total: 0, done: 0, eligible: 0, notEligible: 0, review: 0, failed: 0, startedAt: 0, finishedAt: 0, current: '', by: '' };
function batchSnapshot() {
  const j = _batchJob;
  const elapsed = j.startedAt ? ((j.finishedAt || Date.now()) - j.startedAt) / 1000 : 0;
  const avg = j.done ? elapsed / j.done : 0;
  const left = Math.max(0, j.total - j.done);
  return {
    running: j.running, total: j.total, done: j.done,
    percent: j.total ? Math.round((j.done / j.total) * 100) : 0,
    eligible: j.eligible, notEligible: j.notEligible, review: j.review, failed: j.failed,
    current: j.current, by: j.by,
    elapsedSec: Math.round(elapsed),
    etaSec: (j.running && avg) ? Math.round(avg * left) : 0
  };
}
async function runBatchAnalyse(ids, actor) {
  _batchJob = { running: true, total: ids.length, done: 0, eligible: 0, notEligible: 0, review: 0, failed: 0, startedAt: Date.now(), finishedAt: 0, current: '', by: actor };
  for (const id of ids) {
    let db = readDB();                                   // re-read each time so we don't clobber concurrent edits
    const t = (db.tenders || []).find(x => x.id === id);
    if (!t) { _batchJob.done++; continue; }
    _batchJob.current = t.psuName || '';
    try {
      const r = await analyseTender(db, t, actor);
      const v = t.eligibility ? t.eligibility.verdict : '';
      if (v === 'Eligible') _batchJob.eligible++;
      else if (v === 'Not Eligible') _batchJob.notEligible++;
      else _batchJob.review++;
      if (!r.ok) _batchJob.failed++;
      writeDB(db);
    } catch (e) { _batchJob.failed++; }
    _batchJob.done++;
  }
  _batchJob.running = false;
  _batchJob.finishedAt = Date.now();
  _batchJob.current = '';
  console.log(`🏛 Batch PDF read finished: ${_batchJob.done}/${_batchJob.total}`);
}
app.post('/api/tenders/analyse-all', auth, partnerOrAdmin, (req, res) => {
  if (_batchJob.running) return res.status(409).json({ error: 'A read is already running.', progress: batchSnapshot() });
  const force = String((req.body && req.body.force) || req.query.force || '') === '1';
  const db = readDB();
  const ids = (db.tenders || [])
    .filter(t => t.pdfUrl && (force || !t.extracted))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))   // soonest deadline first
    .map(t => t.id);
  if (!ids.length) return res.json({ ok: true, started: false, total: 0, message: 'Nothing to read.' });
  runBatchAnalyse(ids, req.user.name);                   // deliberately not awaited
  res.json({ ok: true, started: true, total: ids.length, progress: batchSnapshot() });
});
app.get('/api/tenders/analyse-progress', auth, partnerOrAdmin, (req, res) => res.json(batchSnapshot()));

// ── Delete several tenders at once ───────────────────────────────────────────
app.post('/api/tenders/bulk-delete', auth, partnerOrAdmin, (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No tenders selected.' });
  const db = readDB();
  const set = new Set(ids);
  const gone = (db.tenders || []).filter(t => set.has(t.id));
  db.tenders = (db.tenders || []).filter(t => !set.has(t.id));
  if (gone.length) {
    logAudit(db, req, 'deleted', 'client', '', 'Government tenders',
      `deleted ${gone.length} tender(s): ` + gone.slice(0, 5).map(t => t.psuName).join(', ') + (gone.length > 5 ? '…' : ''));
    writeDB(db);
  }
  res.json({ ok: true, deleted: gone.length });
});

// Re-run the PDF read + eligibility check for one tender, on demand
app.post('/api/tenders/:id/analyse', auth, partnerOrAdmin, async (req, res) => {
  const db = readDB();
  const t = (db.tenders || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender not found.' });
  const r = await analyseTender(db, t, req.user.name);
  writeDB(db);
  res.json({ ok: r.ok, verdict: t.eligibility ? t.eligibility.verdict : 'Needs Review', eligibility: t.eligibility, extracted: t.extracted, error: r.error });
});

// ── LEAVES ─────────────────────────────────────────────────────────────────────
// Apply for leave
app.post('/api/leaves', auth, (req, res) => {
  const db = readDB();
  if (!db.leaves) db.leaves = [];
  const { fromDate, toDate, type, reason } = req.body;
  if (!fromDate || !toDate || !reason) return res.status(400).json({ error: 'From date, to date and reason required.' });
  // Calculate days (simple calendar diff, excluding weekends optional)
  const from = new Date(fromDate), to = new Date(toDate);
  const days = Math.round((to - from) / 864e5) + 1;
  if (days <= 0) return res.status(400).json({ error: 'Invalid dates.' });
  // Check balance for Paid Leave
  if (type === 'Paid') {
    const bal = getLeaveBalance(db, req.user.id);
    if (days > bal.remaining) return res.status(400).json({ error: `Insufficient leave balance. Remaining: ${bal.remaining} days.` });
  }
  const leave = { id: newId(), userId: req.user.id, userName: req.user.name, fromDate, toDate, days, type: type || 'Paid', reason, status: 'pending', adminNote: '', createdAt: new Date().toISOString() };
  db.leaves.push(leave);
  writeDB(db);
  res.json(leave);
});

// Get leaves
app.get('/api/leaves', auth, (req, res) => {
  const db = readDB();
  if (!db.leaves) return res.json([]);
  if (req.user.role === 'admin') return res.json([...db.leaves].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
  res.json(db.leaves.filter(l => l.userId === req.user.id).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Approve/reject leave (admin only)
app.put('/api/leaves/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const i = (db.leaves || []).findIndex(l => l.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Leave not found.' });
  const { status, adminNote } = req.body;
  db.leaves[i].status = status;
  db.leaves[i].adminNote = adminNote || '';
  db.leaves[i].reviewedAt = new Date().toISOString();
  // If approved, mark those days in attendance
  if (status === 'approved') {
    const leave = db.leaves[i];
    const user = db.users.find(u => u.id === leave.userId);
    const from = new Date(leave.fromDate), to = new Date(leave.toDate);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
      const dateStr = d.toISOString().slice(0,10);
      const existing = (db.attendance || []).findIndex(a => a.userId === leave.userId && a.date === dateStr);
      // Map leave type to attendance status
      const LT = leave.type;
      let attStatus;
      if (LT === 'WFH') attStatus = 'Work from Home';
      else if (LT === 'HalfDay') attStatus = 'Half Day';
      else if (LT === 'Casual Leave' || LT === 'Sick Leave' || LT === 'Earned Leave') attStatus = LT;
      else if (LT === 'Leave Without Pay' || LT === 'Unpaid') attStatus = 'Leave Without Pay';
      else if (LT === 'Paid') attStatus = 'Paid Leave';   // legacy
      else attStatus = LT || 'Leave';
      const rec = { id: newId(), userId: leave.userId, userName: leave.userName, date: dateStr, punchIn: null, punchOut: null, workHours: 0, status: attStatus, leaveId: leave.id, createdAt: new Date().toISOString() };
      if (existing > -1) db.attendance[existing] = { ...db.attendance[existing], ...rec };
      else { if (!db.attendance) db.attendance = []; db.attendance.push(rec); }
    }
  }
  writeDB(db);
  res.json(db.leaves[i]);
});

// Admin: adjust leave balance (add opening balance or bonus)
app.post('/api/leaves/adjust', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.leaves) db.leaves = [];
  const { userId, days, note, year } = req.body;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  // Store adjustment as a special leave record
  const adj = {
    id: newId(), userId, userName: user.name,
    fromDate: `${year || new Date().getFullYear()}-01-01`,
    toDate: `${year || new Date().getFullYear()}-01-01`,
    days: parseFloat(days) || 0,
    type: 'Adjustment', reason: note || 'Admin balance adjustment',
    status: 'approved', adminNote: 'Manual adjustment by admin',
    createdAt: new Date().toISOString()
  };
  db.leaves.push(adj);
  writeDB(db);
  res.json({ ok: true, adj });
});

// Get leave balance (supports adjustments)
app.get('/api/leaves/balance', auth, (req, res) => {
  const db = readDB();
  const userId = req.query.userId || req.user.id;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const bal = getLeaveBalance(db, userId, year);
  bal.compOff = getCompOffBalance(db, userId);
  res.json(bal);
});

// ═══════════════════════════════════════════════════════════
// HOLIDAY CALENDAR (Indian festivals + government holidays)
// Source: Central Government gazetted & restricted holiday list
// ═══════════════════════════════════════════════════════════
const INDIA_HOLIDAY_CALENDAR = {
  2026: [
    // ── Gazetted (mandatory central government holidays) ──
    { date: '2026-01-26', name: 'Republic Day',            type: 'Gazetted' },
    { date: '2026-03-04', name: 'Holi',                    type: 'Gazetted' },
    { date: '2026-03-21', name: 'Id-ul-Fitr (tentative)',  type: 'Gazetted' },
    { date: '2026-03-26', name: 'Rama Navami',             type: 'Gazetted' },
    { date: '2026-03-31', name: 'Mahavir Jayanti',         type: 'Gazetted' },
    { date: '2026-04-03', name: 'Good Friday',             type: 'Gazetted' },
    { date: '2026-05-01', name: 'Buddha Purnima',          type: 'Gazetted' },
    { date: '2026-05-27', name: 'Id-ul-Zuha / Bakrid (tentative)', type: 'Gazetted' },
    { date: '2026-06-26', name: 'Muharram (tentative)',    type: 'Gazetted' },
    { date: '2026-08-15', name: 'Independence Day',        type: 'Gazetted' },
    { date: '2026-08-26', name: 'Id-e-Milad (tentative)',  type: 'Gazetted' },
    { date: '2026-09-04', name: 'Janmashtami',             type: 'Gazetted' },
    { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti',  type: 'Gazetted' },
    { date: '2026-10-20', name: 'Dussehra',                type: 'Gazetted' },
    { date: '2026-11-08', name: 'Diwali (Deepavali)',      type: 'Gazetted' },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti',      type: 'Gazetted' },
    { date: '2026-12-25', name: 'Christmas Day',           type: 'Gazetted' },
    // ── Restricted / optional festival holidays ──
    { date: '2026-01-01', name: "New Year's Day",                  type: 'Restricted' },
    { date: '2026-01-03', name: "Hazarat Ali's Birthday",          type: 'Restricted' },
    { date: '2026-01-14', name: 'Pongal / Makar Sankranti',        type: 'Restricted' },
    { date: '2026-01-23', name: 'Vasant Panchami',                 type: 'Restricted' },
    { date: '2026-02-01', name: 'Guru Ravidas Jayanti',            type: 'Restricted' },
    { date: '2026-02-12', name: 'Maharishi Dayanand Saraswati Jayanti', type: 'Restricted' },
    { date: '2026-02-15', name: 'Maha Shivaratri',                 type: 'Restricted' },
    { date: '2026-02-19', name: 'Shivaji Jayanti',                 type: 'Restricted' },
    { date: '2026-03-03', name: 'Holika Dahan',                    type: 'Restricted' },
    { date: '2026-03-19', name: 'Ugadi / Gudi Padwa',              type: 'Restricted' },
    { date: '2026-03-20', name: 'Jumat-ul-Vida',                   type: 'Restricted' },
    { date: '2026-04-05', name: 'Easter Sunday',                   type: 'Restricted' },
    { date: '2026-04-14', name: 'Vaisakhi / Mesadi',               type: 'Restricted' },
    { date: '2026-04-15', name: 'Bahag Bihu',                      type: 'Restricted' },
    { date: '2026-05-09', name: 'Rabindranath Tagore Jayanti',     type: 'Restricted' },
    { date: '2026-07-16', name: 'Rath Yatra',                      type: 'Restricted' },
    { date: '2026-08-26', name: 'Onam',                            type: 'Restricted' },
    { date: '2026-08-28', name: 'Raksha Bandhan',                  type: 'Restricted' },
    { date: '2026-09-14', name: 'Ganesh Chaturthi',                type: 'Restricted' },
    { date: '2026-10-18', name: 'Maha Saptami',                    type: 'Restricted' },
    { date: '2026-10-19', name: 'Maha Ashtami',                    type: 'Restricted' },
    { date: '2026-10-26', name: 'Maharishi Valmiki Jayanti',       type: 'Restricted' },
    { date: '2026-10-29', name: 'Karva Chauth',                    type: 'Restricted' },
    { date: '2026-11-09', name: 'Govardhan Puja',                  type: 'Restricted' },
    { date: '2026-11-11', name: 'Bhai Dooj',                       type: 'Restricted' },
    { date: '2026-11-15', name: 'Chhath Puja',                     type: 'Restricted' },
    { date: '2026-11-24', name: 'Guru Tegh Bahadur Martyrdom Day', type: 'Restricted' },
    { date: '2026-12-23', name: "Hazarat Ali's Birthday",          type: 'Restricted' },
    { date: '2026-12-24', name: 'Christmas Eve',                   type: 'Restricted' }
  ]
};
const HOLIDAY_YEARS = Object.keys(INDIA_HOLIDAY_CALENDAR).map(Number).sort();

// List the reference calendar for a year + which dates GARP has marked as holidays
app.get('/api/holidays', auth, (req, res) => {
  const db = readDB();
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const marked = (db.holidays || []).filter(h => (h.date || '').startsWith(String(year)));
  const markedDates = new Set(marked.map(h => h.date));
  const catalog = (INDIA_HOLIDAY_CALENDAR[year] || []).map(h => ({
    ...h,
    day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(h.date + 'T00:00:00').getDay()],
    selected: markedDates.has(h.date)
  })).sort((a, b) => a.date.localeCompare(b.date));
  // Custom "other" holidays the admin added that aren't in the reference calendar
  const catalogDates = new Set((INDIA_HOLIDAY_CALENDAR[year] || []).map(h => h.date));
  const custom = marked.filter(h => !catalogDates.has(h.date)).sort((a, b) => a.date.localeCompare(b.date));
  res.json({ year, years: HOLIDAY_YEARS, catalog, custom, holidays: marked });
});

// Admin marks which festival/government holidays are GARP holidays for a year
app.put('/api/holidays', auth, adminOnly, (req, res) => {
  const db = readDB();
  const year = parseInt(req.body && req.body.year) || new Date().getFullYear();
  const dates = Array.isArray(req.body && req.body.dates) ? req.body.dates : [];
  if (!db.holidays) db.holidays = [];
  const catalog = INDIA_HOLIDAY_CALENDAR[year] || [];
  const catalogDates = new Set(catalog.map(h => h.date));
  // Keep other years, and keep this year's custom (non-catalog) holidays untouched
  const kept = db.holidays.filter(h => !String(h.date || '').startsWith(String(year)) || !catalogDates.has(h.date));
  const picked = dates
    .filter(d => catalogDates.has(d))
    .map(d => { const c = catalog.find(x => x.date === d); return { date: d, name: c.name, type: c.type, source: 'catalog' }; });
  db.holidays = kept.concat(picked).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  logAudit(db, req, 'updated', 'holiday', String(year), `${year} holiday list`, `${picked.length} holiday(s) marked for ${year}`);
  writeDB(db);
  res.json({ ok: true, count: picked.length, holidays: db.holidays.filter(h => String(h.date).startsWith(String(year))) });
});

// Admin adds a custom "other" holiday (not in the reference calendar)
app.post('/api/holidays', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.holidays) db.holidays = [];
  const { date, name } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date is required.' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Holiday name is required.' });
  if (db.holidays.some(h => h.date === date)) return res.status(400).json({ error: 'That date is already a holiday.' });
  const h = { date, name: String(name).trim(), type: 'Other', source: 'custom' };
  db.holidays.push(h);
  db.holidays.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  logAudit(db, req, 'created', 'holiday', h.date, h.name, `custom holiday added on ${h.date}`);
  writeDB(db);
  res.json(h);
});

app.delete('/api/holidays/:date', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = (db.holidays || []).length;
  const _h = (db.holidays || []).find(h => h.date === req.params.date);
  db.holidays = (db.holidays || []).filter(h => h.date !== req.params.date);
  if (_h) logAudit(db, req, 'deleted', 'holiday', _h.date, _h.name, `holiday removed from ${_h.date}`);
  writeDB(db);
  res.json({ ok: true, deleted: before - db.holidays.length });
});

// ═══════════════════════════════════════════════════════════
// COMPENSATORY OFF — earned by working on a holiday / weekly off
// ═══════════════════════════════════════════════════════════
function getCompOffBalance(db, userId) {
  const list = (db.compOffs || []).filter(c => c.userId === userId);
  const earned = list.filter(c => c.status !== 'revoked').reduce((s, c) => s + (c.days || 0), 0);
  const used = list.filter(c => c.status === 'used').reduce((s, c) => s + (c.days || 0), 0);
  return {
    earned: parseFloat(earned.toFixed(1)),
    used: parseFloat(used.toFixed(1)),
    available: parseFloat((earned - used).toFixed(1))
  };
}

// Credit a comp-off when someone works on a non-working day. Idempotent per user+date.
function creditCompOff(db, user, dateStr, days) {
  if (!db.compOffs) db.compOffs = [];
  const reason = nonWorkingReason(dateStr, db);
  if (!reason) return null;                                    // it was a normal working day
  const existing = db.compOffs.find(c => c.userId === user.id && c.earnedDate === dateStr);
  if (existing) { existing.days = days; return existing; }     // already credited — just refresh the value
  const c = {
    id: newId(), userId: user.id, userName: user.name,
    earnedDate: dateStr, days: days, reason: reason,
    status: 'available', grantedBy: 'system',
    createdAt: new Date().toISOString()
  };
  db.compOffs.push(c);
  return c;
}

// Consume `days` worth of comp-off for a user (oldest first)
function consumeCompOff(db, userId, days, leaveId) {
  let need = days;
  const avail = (db.compOffs || [])
    .filter(c => c.userId === userId && c.status === 'available')
    .sort((a, b) => String(a.earnedDate).localeCompare(String(b.earnedDate)));
  for (const c of avail) {
    if (need <= 0) break;
    c.status = 'used';
    c.usedLeaveId = leaveId;
    c.usedAt = new Date().toISOString();
    need -= (c.days || 0);
  }
  return need <= 0;
}

// List comp-offs — own by default; admin/payroll can request all
app.get('/api/comp-offs', auth, (req, res) => {
  const db = readDB();
  const all = req.query.all === '1';
  const canSeeAll = req.user.role === 'admin' || isPayrollUser(db, req.user.id, req.user.role);
  let list = db.compOffs || [];
  if (!(all && canSeeAll)) list = list.filter(c => c.userId === req.user.id);
  list = list.slice().sort((a, b) => String(b.earnedDate).localeCompare(String(a.earnedDate)));
  const userId = (all && canSeeAll) ? null : req.user.id;
  res.json({ compOffs: list, balance: userId ? getCompOffBalance(db, userId) : null });
});

// Admin grants a comp-off manually
app.post('/api/comp-offs', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.compOffs) db.compOffs = [];
  const { userId, earnedDate, days, reason } = req.body || {};
  const u = (db.users || []).find(x => x.id === userId);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (!earnedDate || !/^\d{4}-\d{2}-\d{2}$/.test(earnedDate)) return res.status(400).json({ error: 'A valid date is required.' });
  const d = parseFloat(days) || 1;
  const c = {
    id: newId(), userId: u.id, userName: u.name,
    earnedDate, days: d, reason: (reason || 'Granted by admin').trim(),
    status: 'available', grantedBy: req.user.name,
    createdAt: new Date().toISOString()
  };
  db.compOffs.push(c);
  logAudit(db, req, 'created', 'comp-off', u.id, u.name, `${d} day granted for ${earnedDate} — ${c.reason}`);
  writeDB(db);
  res.json(c);
});

// Admin revokes / deletes a comp-off
app.delete('/api/comp-offs/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = (db.compOffs || []).length;
  const _c = (db.compOffs || []).find(c => c.id === req.params.id);
  db.compOffs = (db.compOffs || []).filter(c => c.id !== req.params.id);
  if (_c) logAudit(db, req, 'deleted', 'comp-off', _c.userId, _c.userName, `${_c.days} day earned ${_c.earnedDate} (${_c.reason || '—'}) revoked`);
  writeDB(db);
  res.json({ ok: true, deleted: before - db.compOffs.length });
});

// Attendance summary (admin)
// ── Monthly attendance report (full day-by-day grid) ──────────────────────────
function buildMonthlyAttendance(db, y, m) {
  const yi = parseInt(y), mi = parseInt(m);
  const prefix = `${yi}-${String(mi).padStart(2,'0')}`;
  const daysInMonth = new Date(yi, mi, 0).getDate();
  const members = db.users.filter(u => isAttendanceMember(u));
  const att = (db.attendance || []).filter(a => a.date.startsWith(prefix));
  // Map of userId|date -> company/site name (from logged site visits)
  const svMap = {};
  (db.siteVisits || []).forEach(v => {
    if (!v.date || !v.date.startsWith(prefix)) return;
    const k = v.userId + '|' + v.date;
    if (!svMap[k]) svMap[k] = v.clientName || v.siteName || '';
  });
  // day meta: working day or weekly-off
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${prefix}-${String(d).padStart(2,'0')}`;
    const dt = new Date(ds + 'T00:00:00');
    days.push({ day: d, date: ds, dow: ['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()], working: isWorkingDay(ds, db), holiday: nonWorkingReason(ds, db) });
  }
  // short code per status
  const code = (s, isLate) => {
    if (!s) return '';
    if (s === 'Present') return isLate ? 'L' : 'P';
    if (s === 'Work from Home') return 'WFH';
    if (s === 'Site Visit') return 'SV';
    if (s === 'Half Day') return 'HD';
    if (s === 'Casual Leave') return 'CL';
    if (s === 'Sick Leave') return 'SL';
    if (s === 'Earned Leave') return 'EL';
    if (s === 'Leave Without Pay') return 'LWP';
    if (s === 'Paid Leave') return 'PL';   // legacy
    if (s === 'Leave') return 'LV';        // legacy
    if (s === 'Absent') return 'A';
    return s.slice(0,2).toUpperCase();
  };
  const rows = members.map(u => {
    const mine = att.filter(a => a.userId === u.id);
    const byDate = {}; mine.forEach(a => { byDate[a.date] = a; });
    let present=0, absent=0, half=0, wfh=0, sv=0, paidLeave=0, leave=0, late=0, workingDays=0;
    const cells = days.map(dy => {
      if (dy.working) workingDays++;
      const a = byDate[dy.date];
      const svName = svMap[u.id + '|' + dy.date];
      if (!a) {
        // No attendance record — but a site visit may have been logged for this date
        if (svName) { sv++; return { day: dy.day, working: dy.working, code: 'SV', status: 'Site Visit', site: svName, punchIn: '', punchOut: '', isLate: false }; }
        return { day: dy.day, working: dy.working, code: dy.working ? '' : '–', status: '' };
      }
      // offSite flag OR a logged site visit is the source of truth for site visits
      const eff = ((a.offSite || svName) && a.status !== 'Site Visit') ? 'Site Visit' : a.status;
      const c = code(eff, a.isLate);
      if (eff === 'Present') { present++; if (a.isLate) late++; }
      else if (eff === 'Half Day') half++;
      else if (eff === 'Work from Home') wfh++;
      else if (eff === 'Site Visit') sv++;
      else if (eff === 'Casual Leave' || eff === 'Sick Leave' || eff === 'Earned Leave' || eff === 'Paid Leave') paidLeave++;
      else if (eff === 'Leave Without Pay' || eff === 'Leave') leave++;
      else if (eff === 'Absent') absent++;
      const site = (eff === 'Site Visit') ? (svName || a.siteName || '') : '';
      return { day: dy.day, working: dy.working, code: c, status: eff, site, remark: a.remark || '', punchIn: a.punchIn || '', punchOut: a.punchOut || '', isLate: !!a.isLate };
    });
    const presentEquiv = present + wfh + sv + paidLeave + half * 0.5;  // LWP (leave) is unpaid, not counted
    return {
      userId: u.id, userName: u.name, designation: u.designation || '', branch: u.branch || '',
      cells, workingDays, present, absent, halfDay: half, wfh, siteVisit: sv,
      paidLeave, leave, late, presentDays: parseFloat(presentEquiv.toFixed(1))
    };
  });
  return { year: yi, month: mi, daysInMonth, days, rows };
}

app.get('/api/attendance/report', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const now = new Date();
  const m = req.query.month || (now.getMonth() + 1);
  const y = req.query.year || now.getFullYear();
  res.json(buildMonthlyAttendance(db, y, m));
});

app.get('/api/attendance/report.xlsx', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const now = new Date();
  const m = req.query.month || (now.getMonth() + 1);
  const y = req.query.year || now.getFullYear();
  const rep = buildMonthlyAttendance(db, y, m);
  const MNAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const XLSX = require('xlsx');
  // Sheet 1: Day-by-day grid
  const header1 = ['Employee','Designation', ...rep.days.map(d => `${d.day} ${d.dow}`), 'Present','Absent','Half','WFH','Leave','Late','Working Days'];
  const grid = [header1];
  rep.rows.forEach(r => {
    grid.push([
      r.userName, r.designation,
      ...r.cells.map(c => c.code),
      r.present, r.absent, r.halfDay, r.wfh, (r.paidLeave + r.leave), r.late, r.workingDays
    ]);
  });
  // Legend rows
  grid.push([]);
  grid.push(['Legend:','P = Present, L = Late, A = Absent, HD = Half Day, WFH = Work from Home, SV = Site Visit, PL = Paid Leave, LV = Leave, – = Weekly Off']);
  const ws1 = XLSX.utils.aoa_to_sheet(grid);
  // column widths
  ws1['!cols'] = [{wch:22},{wch:16}, ...rep.days.map(()=>({wch:5})), {wch:8},{wch:8},{wch:7},{wch:7},{wch:7},{wch:7},{wch:12}];
  // Sheet 2: Summary
  const header2 = ['Employee','Designation','Branch','Working Days','Present','Absent','Half Day','WFH','Site Visit','Paid Leave','Leave','Late Marks','Present (Equiv.)'];
  const summ = [header2];
  rep.rows.forEach(r => summ.push([r.userName,r.designation,r.branch,r.workingDays,r.present,r.absent,r.halfDay,r.wfh,r.siteVisit,r.paidLeave,r.leave,r.late,r.presentDays]));
  const ws2 = XLSX.utils.aoa_to_sheet(summ);
  ws2['!cols'] = [{wch:22},{wch:16},{wch:16},{wch:12},{wch:9},{wch:8},{wch:9},{wch:7},{wch:10},{wch:11},{wch:8},{wch:11},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Daily Attendance');
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = `Attendance_${MNAMES[rep.month]}_${rep.year}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.get('/api/attendance/summary', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const { month, year } = req.query;
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = year || now.getFullYear();
  const prefix = `${y}-${String(m).padStart(2,'0')}`;
  const data = (db.attendance || []).filter(a => a.date.startsWith(prefix));
  const members = db.users.filter(u => isAttendanceMember(u));
  const summary = members.map(u => {
    const myAtt = data.filter(a => a.userId === u.id);
    const bal = getLeaveBalance(db, u.id, parseInt(y));
    return {
      userId: u.id, userName: u.name, designation: u.designation,
      present: myAtt.filter(a => a.status === 'Present' && !a.offSite).length,
      absent: myAtt.filter(a => a.status === 'Absent').length,
      halfDay: myAtt.filter(a => a.status === 'Half Day').length,
      wfh: myAtt.filter(a => a.status === 'Work from Home').length,
      siteVisit: myAtt.filter(a => a.status === 'Site Visit' || a.offSite).length,
      paidLeave: myAtt.filter(a => a.status === 'Paid Leave').length,
      late: myAtt.filter(a => a.isLate).length,
      leaveBalance: bal
    };
  });
  res.json(summary);
});

// ── Member Full Attendance History ────────────────────────────────────────────
app.get('/api/attendance/member/:userId', auth, (req, res) => {
  const db = readDB();
  const userId = req.params.userId;
  if (req.user.role !== 'admin' && req.user.id !== userId)
    return res.status(403).json({ error: 'Forbidden.' });
  const att = (db.attendance || []).filter(a => a.userId === userId).sort((a,b) => b.date.localeCompare(a.date));
  const leaves = (db.leaves || []).filter(l => l.userId === userId).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const visits = (db.siteVisits || []).filter(v => v.userId === userId).sort((a,b) => b.date.localeCompare(a.date));
  const user = db.users.find(u => u.id === userId);
  // Monthly summary
  const months = {};
  att.forEach(a => {
    const key = a.date.slice(0,7);
    if (!months[key]) months[key] = { present:0, absent:0, halfDay:0, wfh:0, paidLeave:0, leave:0, late:0, totalHours:0 };
    months[key][a.status==='Present'?'present':a.status==='Absent'?'absent':a.status==='Half Day'?'halfDay':a.status==='Work from Home'?'wfh':a.status==='Paid Leave'?'paidLeave':'leave']++;
    if (a.isLate) months[key].late++;
    months[key].totalHours = parseFloat((months[key].totalHours + (a.workHours||0)).toFixed(2));
  });
  res.json({ user: user ? { ...user, passwordHash: undefined } : null, attendance: att, leaves, siteVisits: visits, monthlySummary: months });
});

// ── Site Visits ────────────────────────────────────────────────────────────────
app.post('/api/site-visits', auth, (req, res) => {
  const db = readDB();
  if (!db.siteVisits) db.siteVisits = [];
  const { date, siteName, clientId, purpose, checkIn, checkOut, notes } = req.body;
  if (!siteName) return res.status(400).json({ error: 'Site name required.' });
  const client = clientId ? db.clients.find(c => c.id === clientId) : null;
  const visit = {
    id: newId(), userId: req.user.id, userName: req.user.name,
    date: date || todayStr(), siteName, clientName: client?.name || siteName,
    clientId: clientId || null, purpose: purpose || '', checkIn: checkIn || timeStr(),
    checkOut: checkOut || null, notes: notes || '', createdAt: new Date().toISOString()
  };
  db.siteVisits.push(visit);
  // Also reflect in attendance: update existing record OR create one if none exists for that date
  if (!db.attendance) db.attendance = [];
  const attIdx = db.attendance.findIndex(a => a.userId === req.user.id && a.date === visit.date);
  if (attIdx > -1) {
    db.attendance[attIdx].status = 'Site Visit';
    db.attendance[attIdx].offSite = true;
    db.attendance[attIdx].siteName = siteName;
  } else {
    db.attendance.push({
      id: newId(), userId: req.user.id, userName: req.user.name, date: visit.date,
      punchIn: visit.checkIn || null, punchOut: visit.checkOut || null, workHours: 0,
      status: 'Site Visit', offSite: true, siteName, isLate: false,
      createdAt: new Date().toISOString()
    });
  }
  writeDB(db);
  res.json(visit);
});

app.get('/api/site-visits', auth, (req, res) => {
  const db = readDB();
  const visits = (db.siteVisits || []);
  if (req.user.role === 'admin') return res.json(visits.sort((a,b) => b.date.localeCompare(a.date)));
  res.json(visits.filter(v => v.userId === req.user.id).sort((a,b) => b.date.localeCompare(a.date)));
});

// ── Salary Config ──────────────────────────────────────────────────────────────
app.get('/api/salary-config', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const users = db.users.filter(u => isAttendanceMember(u)).map(u => ({
    id: u.id, name: u.name, designation: u.designation, branch: u.branch,
    basicSalary: u.basicSalary || 0, hra: u.hra || 0,
    conveyance: u.conveyance || 0, otherAllowance: u.otherAllowance || 0,
    joiningDate: u.joiningDate
  }));
  res.json(users);
});

// Shared salary computation (used by GET and email endpoints)
function computeSalary(db, userId, year, month) {
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;
  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const att = (db.attendance || []).filter(a => a.userId === userId && a.date.startsWith(prefix));
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  let workingDays = 0, actualPresent = 0, lateCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${prefix}-${String(d).padStart(2,'0')}`;
    if (isWorkingDay(dateStr, db)) workingDays++;
  }
  att.forEach(a => {
    if (['Present','Work from Home','Site Visit'].includes(a.status) || a.offSite) actualPresent++;
    else if (a.status === 'Half Day') actualPresent += 0.5;
    // Paid leaves (CL/SL/EL + legacy Paid Leave) count as present for salary; LWP / unpaid 'Leave' do NOT
    else if (['Casual Leave','Sick Leave','Earned Leave','Paid Leave'].includes(a.status)) actualPresent++;
    if (a.isLate) lateCount++;
  });
  const absentDays = workingDays - actualPresent;
  const basic = user.basicSalary || 0;
  const hra = user.hra || 0;
  const conveyance = user.conveyance || 0;
  const other = user.otherAllowance || 0;
  const gross = basic + hra + conveyance + other;
  const perDay = workingDays > 0 ? gross / workingDays : 0;
  const deduction = parseFloat((absentDays * perDay).toFixed(2));
  const paidLeaves = att.filter(a => a.status === 'Paid Leave').length;
  const pf = basic > 15000 ? parseFloat((basic * 0.12).toFixed(2)) : 0;
  const esi = gross <= 21000 ? parseFloat((gross * 0.0075).toFixed(2)) : 0;
  const totalDeduction = parseFloat((deduction + pf + esi).toFixed(2));
  const netPay = parseFloat((gross - totalDeduction).toFixed(2));
  const leaveBal = getLeaveBalance(db, userId, parseInt(year));
  return {
    userId, userName: user.name, designation: user.designation, branch: user.branch,
    email: user.email || '', joiningDate: user.joiningDate, month: parseInt(month), year: parseInt(year),
    workingDays, presentDays: actualPresent, absentDays: parseFloat(absentDays.toFixed(1)),
    lateCount, paidLeaves,
    basic, hra, conveyance, otherAllowance: other, grossSalary: gross,
    perDaySalary: parseFloat(perDay.toFixed(2)),
    absenceDeduction: deduction, pf, esi,
    totalDeduction, netPay, leaveBalance: leaveBal,
    attendance: att
  };
}

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
function salarySlipHtml(s) {
  const inr = n => '₹' + Number(n||0).toLocaleString('en-IN');
  const row = (l,v,b) => `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb">${l}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;${b?'font-weight:700':''}">${v}</td></tr>`;
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#16315c;color:#fff;padding:16px 20px">
      <div style="font-size:18px;font-weight:800">GARP &amp; Associates</div>
      <div style="font-size:12px;opacity:.85">Salary Slip — ${MONTH_NAMES[s.month]} ${s.year}</div>
    </div>
    <div style="padding:16px 20px">
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:12px">
        ${row('Employee', s.userName, true)}
        ${row('Designation', s.designation||'—')}
        ${row('Branch', s.branch||'—')}
        ${row('Working Days', s.workingDays)}
        ${row('Present / Paid', s.presentDays)}
        ${row('Absent', s.absentDays)}
      </table>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><th colspan="2" style="text-align:left;padding:6px 10px;background:#f8fafc;border:1px solid #e5e7eb">Earnings</th></tr>
        ${row('Basic', inr(s.basic))}
        ${row('HRA', inr(s.hra))}
        ${row('Conveyance', inr(s.conveyance))}
        ${row('Other Allowance', inr(s.otherAllowance))}
        ${row('Gross Salary', inr(s.grossSalary), true)}
        <tr><th colspan="2" style="text-align:left;padding:6px 10px;background:#f8fafc;border:1px solid #e5e7eb">Deductions</th></tr>
        ${row('Absence Deduction', inr(s.absenceDeduction))}
        ${row('PF', inr(s.pf))}
        ${row('ESI', inr(s.esi))}
        ${row('Total Deductions', inr(s.totalDeduction), true)}
      </table>
      <div style="margin-top:14px;padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:800;color:#065f46">NET PAY</span>
        <span style="font-weight:800;font-size:18px;color:#065f46">${inr(s.netPay)}</span>
      </div>
      <div style="margin-top:14px;font-size:11px;color:#6b7280">This is a system-generated salary slip from GARP &amp; Associates. For any discrepancy, contact the payroll team.</div>
    </div></div>`;
}
function salarySlipText(s) {
  const inr = n => 'Rs.' + Number(n||0).toLocaleString('en-IN');
  return `Salary Slip — ${MONTH_NAMES[s.month]} ${s.year}\n`+
    `Employee: ${s.userName} (${s.designation||'-'})\n`+
    `Working Days: ${s.workingDays} | Present/Paid: ${s.presentDays} | Absent: ${s.absentDays}\n\n`+
    `Basic ${inr(s.basic)} | HRA ${inr(s.hra)} | Conveyance ${inr(s.conveyance)} | Other ${inr(s.otherAllowance)}\n`+
    `Gross: ${inr(s.grossSalary)}\n`+
    `Deductions — Absence ${inr(s.absenceDeduction)}, PF ${inr(s.pf)}, ESI ${inr(s.esi)} = ${inr(s.totalDeduction)}\n`+
    `NET PAY: ${inr(s.netPay)}\n\n— GARP & Associates`;
}

app.get('/api/salary/:userId/:year/:month', auth, (req, res) => {
  const db = readDB();
  const { userId, year, month } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId && !isPayrollUser(db, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Forbidden.' });
  const s = computeSalary(db, userId, year, month);
  if (!s) return res.status(404).json({ error: 'User not found.' });
  res.json(s);
});

// Email a salary slip to one employee (admin or payroll user)
// Email configuration diagnostic — tells the UI whether SMTP is set up & verified
app.get('/api/email-status', auth, payrollAccess, (req, res) => {
  res.json({
    configured: _mailInfo.configured,
    ready: _mailReady,
    verified: _mailInfo.verified,
    user: _mailInfo.user ? _mailInfo.user.replace(/(.{2}).*(@.*)/, '$1***$2') : '',
    error: _mailInfo.error || ''
  });
});

app.post('/api/salary/:userId/:year/:month/email', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const { userId, year, month } = req.params;
  const s = computeSalary(db, userId, year, month);
  if (!s) return res.status(404).json({ error: 'User not found.' });
  const to = (req.body && req.body.email) || s.email;
  if (!to) return res.status(400).json({ error: 'No email address on file for this employee.' });
  const subject = `Salary Slip — ${MONTH_NAMES[s.month]} ${s.year} — GARP & Associates`;
  sendEmail(to, subject, salarySlipText(s), salarySlipHtml(s)).then(r => {
    if (r.skipped) return res.status(503).json({ error: 'Email is not configured on the server (set SMTP_USER / SMTP_PASS).' });
    if (!r.ok) return res.status(502).json({ error: r.error || 'Failed to send email.' });
    res.json({ ok: true, sentTo: to });
  });
});

// Email salary slips to ALL members for a month (bulk)
app.post('/api/salary/:year/:month/email-all', auth, payrollAccess, async (req, res) => {
  const db = readDB();
  const { year, month } = req.params;
  const members = db.users.filter(u => isAttendanceMember(u));
  let sent = 0; const failed = [];
  for (const u of members) {
    const s = computeSalary(db, u.id, year, month);
    const to = u.email;
    if (!s || !to) { failed.push({ name: u.name, reason: to ? 'no data' : 'no email' }); continue; }
    const r = await sendEmail(to, `Salary Slip — ${MONTH_NAMES[s.month]} ${s.year} — GARP & Associates`, salarySlipText(s), salarySlipHtml(s));
    if (r.ok) sent++; else failed.push({ name: u.name, reason: r.error || (r.skipped ? 'email not configured' : 'send failed') });
  }
  res.json({ ok: true, sent, failed });
});

// ── Birthday & Anniversary Notifications ──────────────────────────────────────
app.post('/api/notify-celebrations', auth, adminOnly, async (req, res) => {
  const db = readDB();
  const today = todayStr();
  const todayMMDD = today.slice(5); // MM-DD
  const celebrated = [];

  for (const user of db.users.filter(u => u.role === 'member')) {
    // Birthday
    if (user.dob && user.dob.slice(5) === todayMMDD) {
      const payload = {
        title: `🎂 Happy Birthday ${user.name}!`,
        body: `Today is ${user.name}'s birthday! Wishing them a wonderful day! 🎉`,
        tag: 'birthday-' + user.id, url: '/'
      };
      // Notify all users
      for (const u of db.users) {
        await sendPushToUser(db, u.id, payload).catch(() => {});
      }
      celebrated.push({ type: 'birthday', name: user.name });
    }
    // Anniversary
    if (user.anniversary && user.anniversary.slice(5) === todayMMDD) {
      const payload = {
        title: `💍 Happy Anniversary ${user.name}!`,
        body: `Today is ${user.name}'s marriage anniversary! Congratulations! 🎊`,
        tag: 'anniversary-' + user.id, url: '/'
      };
      for (const u of db.users) {
        await sendPushToUser(db, u.id, payload).catch(() => {});
      }
      celebrated.push({ type: 'anniversary', name: user.name });
    }
  }
  writeDB(db);
  res.json({ ok: true, celebrated });
});

// Auto-check celebrations daily (sends each event at most ONCE per day)
setInterval(async () => {
  try {
    const db = readDB();
    const today = todayStr();
    const todayMMDD = today.slice(5);
    if (!db.sentCelebrations) db.sentCelebrations = [];
    // Drop old records so the log doesn't grow forever
    db.sentCelebrations = db.sentCelebrations.filter(k => k.endsWith(today));
    let changed = false;
    for (const user of (db.users || []).filter(u => u.role === 'member')) {
      if (user.dob && user.dob.slice(5) === todayMMDD) {
        const key = 'birthday-' + user.id + '-' + today;
        if (!db.sentCelebrations.includes(key)) {
          const payload = { title: `🎂 Happy Birthday ${user.name}!`, body: `Today is ${user.name}'s birthday! Wishing them a wonderful day! 🎉`, tag: 'birthday-'+user.id, url: '/' };
          for (const u of db.users) await sendPushToUser(db, u.id, payload).catch(() => {});
          db.sentCelebrations.push(key); changed = true;
        }
      }
      if (user.anniversary && user.anniversary.slice(5) === todayMMDD) {
        const key = 'anniv-' + user.id + '-' + today;
        if (!db.sentCelebrations.includes(key)) {
          const payload = { title: `💍 Happy Anniversary ${user.name}!`, body: `Today is ${user.name}'s marriage anniversary! Congratulations! 🎊`, tag: 'anniv-'+user.id, url: '/' };
          for (const u of db.users) await sendPushToUser(db, u.id, payload).catch(() => {});
          db.sentCelebrations.push(key); changed = true;
        }
      }
    }
    if (changed) writeDB(db);
  } catch(e) { console.error('Celebration check error:', e); }
}, 3600000); // check every hour, but each event sends only once/day

// Stale-remark reminders: check hourly, notify once/day per task after 2 idle days
setInterval(() => { try { runStaleRemarkCheck(); } catch(e){ console.error('Stale remark check error:', e); } }, 3600000);
setTimeout(() => { try { runStaleRemarkCheck(); } catch(e){} }, 15000); // also run shortly after startup

// ── Unmarked-attendance reminder: after 10:00 AM, ping anyone who hasn't marked ──
const ATTENDANCE_CUTOFF = process.env.ATTENDANCE_CUTOFF || '10:00'; // HH:MM local
function runAttendanceReminder() {
  try {
    const db = readDB();
    const today = todayStr();
    if (!isWorkingDay(today, db)) return;          // skip weekly-offs/holidays
    const now = timeStr();                          // 'HH:MM'
    if (now < ATTENDANCE_CUTOFF) return;            // only after the cutoff
    if (!db.sentAttnReminders) db.sentAttnReminders = [];
    // keep only today's keys
    db.sentAttnReminders = db.sentAttnReminders.filter(k => k.endsWith(today));
    const members = (db.users || []).filter(u => isAttendanceMember(u));
    let changed = false;
    const unmarked = [];
    for (const u of members) {
      const rec = (db.attendance || []).find(a => a.userId === u.id && a.date === today);
      const marked = rec && (rec.punchIn || ['Site Visit','Work from Home','Casual Leave','Sick Leave','Earned Leave','Leave Without Pay','Paid Leave','Leave','Half Day','Absent'].includes(rec.status));
      if (marked) continue;
      unmarked.push(u);
      const key = 'attn-' + u.id + '-' + today;
      if (db.sentAttnReminders.includes(key)) continue;
      // notify the employee (push + in-app)
      sendPushToUser(db, u.id, { title: '⏰ Mark your attendance', body: `It's past ${ATTENDANCE_CUTOFF} and your attendance for today isn't marked. Please punch in.`, tag: 'attn-'+u.id, url: '/' }).catch(()=>{});
      notifyUser(db, u.id, { title: 'Attendance not marked', message: `It's past ${ATTENDANCE_CUTOFF} and you haven't marked attendance today. Please punch in or apply leave.`, type: 'attendance' });
      db.sentAttnReminders.push(key); changed = true;
    }
    // notify admins + payroll users with a roll-up (once/day)
    if (unmarked.length) {
      const rollupKey = 'attn-admin-' + today;
      if (!db.sentAttnReminders.includes(rollupKey)) {
        const names = unmarked.map(u => u.name).join(', ');
        const admins = (db.users || []).filter(u => u.role === 'admin' || u.payrollAccess || (u.name||'').trim().toLowerCase() === 'meenu jha');
        for (const ad of admins) {
          sendPushToUser(db, ad.id, { title: `⏰ ${unmarked.length} unmarked attendance`, body: `Not marked by ${ATTENDANCE_CUTOFF}: ${names}`, tag: 'attn-admin', url: '/' }).catch(()=>{});
          notifyUser(db, ad.id, { title: `${unmarked.length} employee(s) haven't marked attendance`, message: `Not marked by ${ATTENDANCE_CUTOFF}: ${names}`, type: 'attendance' });
        }
        db.sentAttnReminders.push(rollupKey); changed = true;
      }
    }
    if (changed) writeDB(db);
  } catch(e) { console.error('Attendance reminder error:', e); }
}
setInterval(runAttendanceReminder, 5 * 60 * 1000); // check every 5 minutes
setTimeout(runAttendanceReminder, 20000);          // and shortly after startup

// One-time backfill: ensure every logged site visit has a matching attendance record
function backfillSiteVisitAttendance() {
  try {
    const db = readDB();
    if (!db.siteVisits || !db.siteVisits.length) return;
    if (!db.attendance) db.attendance = [];
    let added = 0, updated = 0;
    for (const v of db.siteVisits) {
      if (!v.userId || !v.date) continue;
      const idx = db.attendance.findIndex(a => a.userId === v.userId && a.date === v.date);
      if (idx > -1) {
        const a = db.attendance[idx];
        if (!a.offSite || a.status !== 'Site Visit') {
          a.offSite = true; a.status = 'Site Visit';
          if (!a.siteName) a.siteName = v.clientName || v.siteName || '';
          updated++;
        }
      } else {
        db.attendance.push({
          id: newId(), userId: v.userId, userName: v.userName || '', date: v.date,
          punchIn: v.checkIn || null, punchOut: v.checkOut || null, workHours: 0,
          status: 'Site Visit', offSite: true, siteName: v.clientName || v.siteName || '',
          isLate: false, backfilled: true, createdAt: new Date().toISOString()
        });
        added++;
      }
    }
    if (added || updated) { writeDB(db); console.log(`🗺  Site-visit backfill: ${added} attendance records added, ${updated} updated.`); }
  } catch (e) { console.error('Site-visit backfill error:', e); }
}
setTimeout(backfillSiteVisitAttendance, 8000); // run once shortly after startup

// One-time migration: move old leave records (db.leaves) into the unified db.leaveRequests
function migrateOldLeaves() {
  try {
    const db = readDB();
    const old = db.leaves || [];
    if (!old.length) return;
    if (!db.leaveRequests) db.leaveRequests = [];
    const mapType = t => {
      if (t === 'Paid' || t === 'Casual') return 'Casual Leave';
      if (t === 'Sick') return 'Sick Leave';
      if (t === 'Earned') return 'Earned Leave';
      if (t === 'Unpaid') return 'Leave Without Pay';
      if (t === 'WFH') return 'Work from Home';
      if (t === 'HalfDay') return 'Half Day';
      return t || 'Casual Leave';
    };
    let moved = 0;
    for (const l of old) {
      const memberId = l.memberId || l.userId;
      const exists = db.leaveRequests.some(r =>
        (r.id === l.id) ||
        (r.memberId === memberId && r.fromDate === l.fromDate && r.toDate === l.toDate && r.createdAt === l.createdAt)
      );
      if (exists) continue;
      db.leaveRequests.push({
        id: l.id || newId(),
        memberId, memberName: l.memberName || l.userName || '',
        fromDate: l.fromDate, toDate: l.toDate,
        days: l.days || Math.max(1, Math.round((new Date(l.toDate) - new Date(l.fromDate)) / 86400000) + 1),
        type: mapType(l.type),
        reason: l.reason || '',
        status: l.status || 'pending',
        adminNote: l.adminNote || '',
        createdAt: l.createdAt || new Date().toISOString(),
        resolvedAt: l.resolvedAt || (l.status && l.status !== 'pending' ? (l.createdAt || new Date().toISOString()) : null),
        migratedFromLeaves: true
      });
      moved++;
    }
    if (moved) { writeDB(db); console.log(`🌴 Leave migration: moved ${moved} old leave record(s) into the approval history.`); }
  } catch (e) { console.error('Leave migration error:', e); }
}
setTimeout(migrateOldLeaves, 9000); // run once shortly after startup


// ── Settings ─────────────────────────────────────────────────────────────────
app.get('/api/settings', auth, (req, res) => {
  const db = readDB(); res.json(db.settings || {});
});
// Returns the IP the server sees for the caller (to configure WiFi Lock correctly)
app.get('/api/my-ip', auth, (req, res) => {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json({
    detectedIp: xff[0] || req.socket.remoteAddress || '',
    forwardedChain: xff,
    remoteAddress: req.socket.remoteAddress || ''
  });
});
app.put('/api/settings', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = readDB();
  const _sBefore = { ...(db.settings || {}) };
  db.settings = { ...(db.settings||{}), ...req.body };
  const _sChanged = diffFields(_sBefore, db.settings, Object.keys(req.body || {}));
  if (_sChanged) logAudit(db, req, 'updated', 'settings', 'office', 'Office settings', _sChanged);
  writeDB(db); res.json(db.settings);
});

// ── Today attendance (all members) ───────────────────────────────────────────
app.get('/api/attendance/today-all', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const day = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : todayStr();
  // site-visit company lookup for that day
  const svMap = {};
  (db.siteVisits || []).forEach(v => { if (v.date === day && !svMap[v.userId]) svMap[v.userId] = v.clientName || v.siteName || ''; });
  res.json(db.users.filter(u => isAttendanceMember(u)).map(u => {
    const r = (db.attendance||[]).find(a => a.userId===u.id && a.date===day);
    const hasSV = !!svMap[u.id];
    let st = r ? ((r.offSite && r.status !== 'Site Visit') ? 'Site Visit' : r.status) : 'Absent';
    if (hasSV && st !== 'Site Visit') st = 'Site Visit';   // logged site visit wins even without a punch record
    return { userId:u.id, userName:u.name, designation:u.designation||'', branch:u.branch||'',
      date: day, punchIn: r?r.punchIn:null, punchOut: r?r.punchOut:null,
      workHours: r?r.workHours:0, status: st, isLate: r?r.isLate:false, offSite: (r?!!r.offSite:false)||hasSV,
      remark: r?(r.remark||''):'',
      site: (st==='Site Visit') ? (svMap[u.id] || (r&&r.siteName) || '') : '' };
  }));
});

// ── Update user (profile edit) ────────────────────────────────────────────────
app.put('/api/users/:id', auth, async (req, res) => {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (req.user.role !== 'admin' && req.user.id !== req.params.id)
    return res.status(403).json({ error: 'Forbidden' });
  const allowed = ['name','email','mobile','designation','qualification','branch','dob',
    'bloodGroup','anniversary','joiningDate','address','pan','aadhar','gender',
    'emergencyName','emergencyPhone','emergencyRelation'];
  if (req.user.role === 'admin')
    ['basicSalary','hra','conveyance','otherAllowance','openingLeave','username'].forEach(f => allowed.push(f));
  const upd = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) upd[f] = req.body[f]; });
  db.users[idx] = { ...db.users[idx], ...upd };
  if (req.user.role === 'admin' && req.body.password) {
    db.users[idx].passwordHash = await require('bcrypt').hash(req.body.password, 10);
    delete db.users[idx].password;
  }
  writeDB(db); res.json({ ok: true, user: db.users[idx] });
});

// ── Birthdays today ───────────────────────────────────────────────────────────
app.get('/api/birthdays/today', auth, (req, res) => {
  const db = readDB(); const now = new Date();
  const mmdd = String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  res.json(db.users.filter(u => u.dob && u.dob.slice(5) === mmdd)
    .map(u => ({ id:u.id, name:u.name, designation:u.designation })));
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/reports/workload', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(db.users.filter(u => u.role==='member').map(m => {
    const all    = db.assignments.filter(a => a.memberId===m.id);
    const active = all.filter(a => a.status !== 'Completed');
    const done   = all.length - active.length;
    const overdue = active.filter(a => a.dueDate && new Date(a.dueDate) < new Date()).length;
    return { id:m.id, name:m.name, designation:m.designation, branch:m.branch,
      total:all.length, active:active.length, done, overdue,
      completionRate: all.length ? Math.round(done/all.length*100) : 0,
      byPriority: { High: active.filter(a=>a.priority==='High').length, Normal: active.filter(a=>!a.priority||a.priority==='Normal').length }
    };
  }));
});

app.get('/api/reports/overdue', auth, adminOnly, (req, res) => {
  const db = readDB(); const today = new Date(); today.setHours(0,0,0,0);
  const list = db.assignments
    .filter(a => a.dueDate && new Date(a.dueDate) < today && a.status !== 'Completed')
    .map(a => {
      const cl = db.clients.find(c => c.id === a.clientId);
      const mb = db.users.find(u => u.id === a.memberId);
      return { ...a, clientName: cl?.name||'—', memberName: mb?.name||'—',
        designation: mb?.designation||'', daysOverdue: Math.floor((today - new Date(a.dueDate))/86400000) };
    }).sort((a,b) => b.daysOverdue - a.daysOverdue);
  res.json(list);
});

app.get('/api/reports/clients', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(db.clients.map(cl => {
    const myA  = db.assignments.filter(a => a.clientId === cl.id);
    const done = myA.filter(a => a.status==='Completed').length;
    const od   = myA.filter(a => a.dueDate && new Date(a.dueDate)<new Date() && a.status!=='Completed').length;
    const wt   = myA.reduce((acc,a) => { acc[a.workType]=(acc[a.workType]||0)+1; return acc; }, {});
    return { id:cl.id, name:cl.name, type:cl.type, branch:cl.branch,
      total:myA.length, completed:done, pending:myA.length-done, overdue:od,
      completionRate: myA.length ? Math.round(done/myA.length*100) : 0, workTypes:wt };
  }).sort((a,b) => b.total - a.total));
});

app.get('/health', (req, res) => res.json({ status:'ok', time:new Date().toISOString() }));

// Admin: download a full backup of the database
app.get('/api/backup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="garp-backup-${stamp}.json"`);
  res.send(JSON.stringify(db, null, 2));
});

// Admin: restore the database from an uploaded backup (full replace)
app.post('/api/restore', auth, adminOnly, (req, res) => {
  const incoming = req.body && req.body.db;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.users)) {
    return res.status(400).json({ error: 'Invalid backup file: missing users array.' });
  }
  let carriedAudit = [];
  try {
    const cur = readDB();
    carriedAudit = (cur.auditLog || []).slice(); // keep this system's trail across the restore
    const bdir = path.join(DATA_DIR, 'pre-restore-backups');
    if (!fs.existsSync(bdir)) fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, `before-restore-${Date.now()}.json`), JSON.stringify(cur));
  } catch (e) { /* best-effort */ }
  const counts = { users: (incoming.users || []).length, clients: (incoming.clients || []).length, assignments: (incoming.assignments || []).length, invoices: (incoming.invoices || []).length };
  // The audit trail must survive a restore, otherwise it could be wiped by restoring an old backup
  incoming.auditLog = carriedAudit;
  logAudit(incoming, req, 'restored', 'data', '', 'Full data restore',
    `replaced all data — restored ${counts.users} users, ${counts.clients} clients, ${counts.assignments} assignments, ${counts.invoices} invoices`);
  writeDB(incoming);
  res.json({ ok: true, restored: counts });
});

// Init
async function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    const db = readDB();
    let changed = false;
    if (!db.notifications) { db.notifications = []; changed = true; }
    if (!db.dueDateRequests) { db.dueDateRequests = []; changed = true; }
    if (!db.recurringTemplates) { db.recurringTemplates = []; changed = true; }
    if (!db.reopenRequests) { db.reopenRequests = []; changed = true; }
    if (!db.pushSubscriptions) { db.pushSubscriptions = []; changed = true; }
    db.users.forEach(u => { if (!u.designation) { u.designation = ''; changed = true; } if (!u.passwordHash && u.password) { u.passwordHash = u.password; delete u.password; changed = true; } });
    if (changed) writeDB(db);
    console.log(`✅ DB loaded — Users:${db.users.length} Clients:${db.clients.length} Assignments:${db.assignments.length} Recurring:${(db.recurringTemplates||[]).length}`);
    runMonthlyGeneration();
    return;
  }
  const adminHash = await bcrypt.hash('Admin@123', 10);
  writeDB({ users: [{ id: 'u00', name: 'Admin', username: 'admin', role: 'admin', designation: 'CA', passwordHash: adminHash, createdAt: new Date().toISOString() }], clients: [], assignments: [], notifications: [], dueDateRequests: [], recurringTemplates: [] });
  console.log('\n✅ Fresh DB created! Admin: admin / Admin@123\n');
}

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 GARP & Associates — Port ${PORT}\n`);
  });
  const MAX_DELAY = 2147483647; // Node's max setTimeout (~24.8 days)
  function scheduleMonthlyRun() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0);
    const delay = next - now;
    if (delay > MAX_DELAY) {
      // Too far for a single timer — wait the max, then re-evaluate.
      setTimeout(scheduleMonthlyRun, MAX_DELAY);
    } else {
      setTimeout(() => { runMonthlyGeneration(); scheduleMonthlyRun(); }, delay);
      console.log(`⏰ Next monthly run: ${next.toLocaleDateString('en-IN')}`);
    }
  }
  scheduleMonthlyRun();
}).catch(err => { console.error(err); process.exit(1); });
