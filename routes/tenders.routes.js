// ═══════════════════════════════════════════════════════════
// routes/tenders.routes.js — Government Tender tracking
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const crypto = require('crypto');

const { ICAI_TMD_URL, SYNC_PDF_PER_RUN } = require('../config');
const { readDB, writeDB } = require('../db');
const { newId, num, todayStr } = require('../utils/helpers');
const { logAudit } = require('../services/audit.service');
const { auth, partnerOrAdmin } = require('../middleware/auth');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════
const TENDER_STATUSES = ['Identified', 'Bid Submitted', 'Technical Evaluation', 'Financial Bid Opened', 'Under Evaluation', 'Awarded', 'Lost', 'Cancelled / Retendered'];
const TENDER_CATEGORIES = ['psu_company', 'psu_bank'];
const MONTHS_ABBR = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

// ═══════════════════════════════════════════════════════════
// TMD Parsing helpers
// ═══════════════════════════════════════════════════════════
function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
}

function parseTmdDate(s) {
  const m = String(s || '').match(/([A-Za-z]{3})[a-z]*\s*,?\s*(\d{1,2})\s*,?\s*(\d{4})/);
  if (!m) return '';
  const mo = MONTHS_ABBR[m[1].toLowerCase()];
  if (!mo) return '';
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
}

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

function inferCategory(name) {
  return /\bbank\b|sahakari|cooperative bank|co-operative bank/i.test(String(name || ''))
    ? 'psu_bank' : 'psu_company';
}

function parseTmdOpportunities(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<a[^>]*href=["'][^"']*count1\.php\?pdf_id=([^"'&]+)[^"']*["'][^>]*>/gi, '\n@@PDF:$1@@\n');
  s = s.replace(/href=["'][^"']*Post\.php\?postid=([^"'&=]+={0,2})["']/gi, '\n@@POST:$1@@\n');
  s = s.replace(/<(br|\/p|\/div|\/h\d|\/li|\/td|\/tr|\/span|\/a)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{2,}/g, '\n');

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
  const seen = new Set();
  return out.filter(o => { if (seen.has(o.ref)) return false; seen.add(o.ref); return true; });
}

// ═══════════════════════════════════════════════════════════
// Tender identity & deduplication helpers
// ═══════════════════════════════════════════════════════════
function tenderImportKey(o) {
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const basis = norm(o.psuName) + '|' + String(o.dueDate || '') + '|' + norm(o.description).slice(0, 120);
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 20);
}

function tenderDescriptionOf(t) {
  if (t && t.description) return t.description;
  const ev = ((t && t.events) || [])[0];
  if (ev && ev.note) return String(ev.note).split(/\s+·\s+(?:Address:|Email:|Tender PDF:)/)[0].trim();
  return '';
}

function storedTenderKey(t) {
  return tenderImportKey({ psuName: t.psuName, dueDate: t.dueDate, description: tenderDescriptionOf(t) });
}

function tenderKeySet(tenders) {
  const s = new Set();
  (tenders || []).forEach(t => {
    if (t.importKey) s.add(t.importKey);
    s.add(storedTenderKey(t));
    if (t.sourceRef) s.add(t.sourceRef);
  });
  return s;
}

function tenderHumanEvents(t) {
  return ((t && t.events) || []).filter(e => e && e.byId && e.byId !== 'system' && e.type !== 'created').length;
}

// ═══════════════════════════════════════════════════════════
// Fetch the ICAI TMD listing page
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// PDF reading + eligibility (tender analysis)
// ═══════════════════════════════════════════════════════════
function toAmount(numStr, unit) {
  let v = parseFloat(String(numStr || '').replace(/,/g, ''));
  if (!isFinite(v)) return 0;
  const u = String(unit || '').toLowerCase();
  if (/^(lakh|lac|lakhs|lacs)$/.test(u)) v *= 1e5;
  else if (/^(crore|crores|cr)$/.test(u)) v *= 1e7;
  return Math.round(v);
}

const AMT = '(?:(?:Rs\\.?|INR|₹)\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*(lakhs?|lacs?|crores?|crs?|cr)?' +
            '|([\\d][\\d,]*(?:\\.\\d+)?)\\s*(lakhs?|lacs?|crores?|crs?|cr)\\b)';

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

// ── Eligibility section finding ──
const ELIG_HEADINGS = [
  'eligibility\\s*(?:criteria|conditions|requirements?)?',
  '(?:pre[\\s-]*)?qualification\\s*(?:criteria|requirements?)?',
  'qualifying\\s*(?:criteria|requirements?)',
  'minimum\\s*(?:eligibility|qualification|criteria|requirements?)',
  'essential\\s*(?:qualification|criteria|requirements?)',
  'technical\\s*(?:eligibility|criteria|qualification|requirements?)',
  'eligibility\\s*of\\s*(?:the\\s*)?(?:bidder|firm|applicant)',
  "bidder[''`]?s?\\s*(?:eligibility|qualification)",
  'who\\s*(?:can|may)\\s*apply',
  'conditions?\\s*of\\s*eligibility',
  'criteria\\s*for\\s*(?:empanelment|selection|eligibility)',
  'eligibility\\s*(?:and|&)\\s*qualification',
  'requirements?\\s*of\\s*(?:the\\s*)?(?:bidder|firm|applicant)',
  '(?:compliance\\s*(?:to|of)\\s*(?:the\\s*)?)?technical\\s*(?:bid|evaluation)\\s*criteria',
  'technical\\s*evaluation\\s*(?:criteria|parameters?|matrix)',
  'evaluation\\s*(?:criteria|parameters?|matrix)\\s*(?:for\\s*technical)?',
  'marks?\\s*(?:based\\s*)?(?:evaluation|criteria)',
  'scoring\\s*(?:criteria|matrix|parameters?)'
];
const HEADING_TAIL = '(?:[ \\t]+(?:criteria|conditions?|requirements?|norms?|parameters?|of\\s*(?:the\\s*)?(?:bidder|firm|applicant)s?))*';
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
const SECTION_END_ANNEX = /\n[ \t]*\n[ \t]*(?:annexure|appendix)\s*[-–]?\s*[A-Z0-9]/i;

function findEligibilitySection(rawText) {
  const text = String(rawText || '')
    .replace(/^[ \t]*page\s*\d{1,3}\s*(?:of|\/)\s*\d{1,3}[ \t]*$/gim, '')
    .replace(/[ \t ]+/g, ' ');
  const cands = [];
  for (const h of ELIG_HEADINGS) {
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
      const end = endM ? endM.index : Math.min(rest.length, 6000);
      const body = rest.slice(0, end).trim();
      if (body.replace(/\s/g, '').length < 20) continue;
      if (/^documents?\b|^supporting\b/i.test(body)) continue;
      cands.push({ title: m[1].trim(), body, points: splitClauses(body).length, len: body.length });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (b.points - a.points) || (b.len - a.len));
  return { title: cands[0].title, body: cands[0].body };
}

// ── Clause splitting ──
const CL_LINE = new RegExp(
  '^[ \\t]*(?:' +
    '\\((\\d{1,2})\\)[ \\t]+' +
    '|(\\d{1,2}(?:\\.\\d{1,2})+)[.)]?[ \\t]+' +
    '|(\\d{1,2})[.)][ \\t]+' +
    '|\\(([a-z]{1,4})\\)[ \\t]*' +
    '|([a-z])[.)][ \\t]+' +
    '|([•▪●○*])[ \\t]*' +
    '|([-–—])[ \\t]+' +
  ')', 'gim');
const CL_INLINE = /(?:^|[\s;])\((\d{1,2}|[a-z]{1,4})\)[ \t]+/gim;
const ABBREV = /(?:\b(?:Rs|No|Sr|Nos|Mr|Ms|M\/s|Dr|Ltd|Pvt|Co|viz|etc|approx|Vol|Sec|Cl|Annex|Ref|w\.e\.f|i\.e|e\.g|F\.Y|A\.Y|A\/c|P\.F|E\.S\.I)\.|\b[A-Z]\.)$/i;
const DOC_COL = /\b(?:self[\s-]*certified|self[\s-]*attested|photocopy|copy\s*of\s*(?:audited|firm|the)|work\s*order\s*\/|to\s*be\s*(?:attached|furnished|enclosed|submitted)|shall\s*be\s*attached|shall\s*be\s*enclosed|documentary\s*(?:proof|evidence)|annexure\s*[-–]?\s*[A-Z]\b)/i;

function parseCriteriaTable(body) {
  const s = String(body || '').replace(/\r/g, '');
  const isDocTable   = /minimum\s*requirement|eligibility\s*(?:norms?|parameters?)/i.test(s)
                    && /documents?\s*(?:to\s*be\s*furnished|required|supporting)|supporting\s*documents?/i.test(s);
  const isMarksTable = /\bmarks?\b/i.test(s)
                    && /weightage|maximum\s*marks|bidder.?s?\s*response/i.test(s)
                    && /\bcriteria\b/i.test(s);
  if (!isDocTable && !isMarksTable) return null;
  const lines = s.split('\n');
  const rowAt = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(\d{1,2})[.)]?\s*$/.exec(lines[i]);
    if (m) rowAt.push({ i, n: parseInt(m[1], 10) });
  }
  const best = [];
  let want = 1;
  for (let k = 0; k < rowAt.length; k++) {
    if (rowAt[k].n === want) { best.push(rowAt[k]); want++; }
  }
  if (best.length < 2) return null;
  const out = [];
  for (let k = 0; k < best.length; k++) {
    const from = best[k].i + 1;
    const to = k + 1 < best.length ? best[k + 1].i : lines.length;
    const rowLines = lines.slice(from, to);
    if (isMarksTable) {
      let splitIdx = rowLines.findIndex(l => /^\s*\d{1,2}\s*$/.test(l));
      if (splitIdx < 1) splitIdx = rowLines.length;
      const crit  = rowLines.slice(0, splitIdx).join(' ').replace(/\s+/g, ' ').trim();
      const bands = rowLines.slice(splitIdx + 1).join(' ').replace(/\s+/g, ' ').trim();
      if (crit.length >= 12) out.push({ n: String(best[k].n), text: crit.slice(0, 600), bands: bands.slice(0, 900), scored: true });
      continue;
    }
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
      const isAmount = /^\s*(?:crores?|crs?\b|cr\b|lakhs?|lacs?|thousand|million|billion|%|percent|per\s*cent)/i.test(rest);
      const zeroPadded = /^\d{1,2}\.0\d*$/.test(String(label));
      if (!isAmount && !zeroPadded) hits.push({ at, end: re.lastIndex, label: String(label) });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return hits.length >= minHits ? dominant(hits) : null;
  }
  function dominant(hits) {
    const parents = {};
    let dotted = 0;
    hits.forEach(h => { const m = /^(\d{1,2})\.\d/.exec(h.label); if (m) { parents[m[1]] = (parents[m[1]] || 0) + 1; dotted++; } });
    if (dotted < 3) return hits;
    const top = Object.keys(parents).sort((a, b) => parents[b] - parents[a])[0];
    if (parents[top] / dotted < 0.6) return hits;
    return hits.filter(h => { const m = /^(\d{1,2})\.\d/.exec(h.label); return !m || m[1] === top; });
  }
  const hits = collect(CL_LINE, 2) || collect(CL_INLINE, 2);
  const out = [];
  if (!hits) {
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

function extractTenderCriteria(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = { raw: {} };
  const sec = findEligibilitySection(text);
  if (sec) {
    out.sectionTitle = sec.title;
    out.sectionText = sec.body.slice(0, 4000);
    out.clauses = splitClauses(sec.body);
  } else {
    out.clauses = [];
  }
  const emd = moneyNear(t, ['(?:EMD|Earnest\\s*Money(?:\\s*Deposit)?)'], 90);
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

// ═══════════════════════════════════════════════════════════
// Firm profile + eligibility helpers (imported for judging)
// ═══════════════════════════════════════════════════════════
const DEFAULT_FIRM_PROFILE = {
  firmName: 'G A R P & Associates', frn: '', constitutionDate: '',
  partnersTotal: 0, fcaPartners: 0, caEmployees: 0, totalStaff: 0,
  turnoverY1: 0, turnoverY2: 0, turnoverY3: 0,
  peerReview: false, peerReviewValidTill: '',
  cagEmpanelled: false, cagCategory: '', rbiEmpanelled: false, gemRegistered: false,
  experienceYears: 0, psuAuditExp: false, bankAuditExp: false,
  states: [], pan: '', gstin: '', msme: '',
  defaultTenderPartnerId: '', defaultTenderPartnerName: '',
  autoSync: true, members: [], cardImports: [], experience: [], configured: false
};
function getFirmProfile(db) { return { ...DEFAULT_FIRM_PROFILE, ...(db.firmProfile || {}) }; }

// Experience matching helpers
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
  if (tags.has('psu')) tags.add('government');
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
function expYearSet(r, into) {
  const f = new Date(r.fromDate);
  const t = (r.ongoing || !r.toDate) ? new Date() : new Date(r.toDate);
  if (isNaN(f) || isNaN(t)) return;
  for (let y = f.getFullYear(); y <= t.getFullYear(); y++) into.add(y);
}
function matchExperience(profile, want) {
  const recs = Array.isArray(profile.experience) ? profile.experience : [];
  const matches = recs.filter(r =>
    (want.types.size ? want.types.has(assignTag(r.assignmentType)) : true) &&
    (want.kinds.size ? [...clientTags(r.clientType)].some(x => want.kinds.has(x)) : true));
  const yset = new Set();
  matches.forEach(r => expYearSet(r, yset));
  return { total: recs.length, matches, count: matches.length, years: yset.size };
}

// judgeClause and evaluateEligibility are very large — included inline for exact behavior preservation
// (The full implementations from server.js lines 4633–5033 are included here)
function judgeClause(profile, c) {
  // This is the exact copy from server.js — extremely long function preserved as-is
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
  if (/blacklist|debar|black\s*list/.test(t)) return { ...out, kind: 'declaration', status: 'info', note: 'Declaration — confirm the firm is not blacklisted/debarred.' };
  if (/convict(?:ed|ion)|court\s*of\s*law|criminal\s*case|prosecut/.test(t)) return { ...out, kind: 'declaration', status: 'info', note: 'Declaration — confirm no conviction, and sign the annexure named in the clause.' };
  if (/^(?:copy|photocopy|self[\s-]*attested|scanned)\b|shall\s*attach|to\s*be\s*enclosed|duly\s*signed\s*annexure|authority\s*letter/.test(t) && !/turnover|partner|experience|empanel/.test(t)) return { ...out, kind: 'document', status: 'info', note: 'Document to attach with the bid — no eligibility test.' };
  // Similar work experience
  if (/similar\s*(?:kind|nature|type|line)?\s*(?:of\s*)?(?:work|assignment|audit|nature|services?|experience)|(?:experience|carried\s*out|executed|completed|handled|performed|conducted)[\s\S]{0,90}?(?:audit|assignment)[\s\S]{0,140}?(?:psu|public\s*sector|government|govt|nigam|\bboard\b|authorit|corporation|undertaking|listed|municipal|\bbanks?\b|scheduled\s*commercial|concurrent)|(?:internal|concurrent|statutory|tax|gst|stock|revenue)\s*audit[\s\S]{0,80}?(?:psu|public\s*sector|government|govt|nigam|\bboard\b|authorit|corporation|undertaking|listed|\bbanks?\b)/.test(t)) {
    out.kind = 'similar_work';
    const src = (text + ' ' + (c.bands || '')).toLowerCase();
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
    const label = (types.size ? [...types].map(x => x[0].toUpperCase() + x.slice(1)).join('/') + ' audit' : 'similar work') + (kinds.size ? ' for ' + [...kinds].join('/') : '');
    const needStr = 'Needs ' + label + (minYears ? ', min ' + minYears + ' yrs' : '') + (minCount ? ', min ' + minCount + ' client(s)' : '');
    const full = matchExperience(profile, { types, kinds, minYears, minCount });
    const kindOnly = matchExperience(profile, { types: new Set(), kinds, minYears, minCount });
    const ev = m => m.matches.slice(0, 4).map(r => { const yr = r.fromDate ? (r.fromDate.slice(0, 4) + (r.ongoing ? '–present' : (r.toDate ? '–' + r.toDate.slice(0, 4) : ''))) : ''; return r.client + (r.clientType || r.assignmentType ? ' (' + [r.clientType, r.assignmentType].filter(Boolean).join(', ') + (yr ? ', ' + yr : '') + ')' : (yr ? ' (' + yr + ')' : '')); }).join('; ');
    if (!full.total) return { ...out, status: 'unknown', note: needStr + '. No audit-experience records on file yet — add them in Firm Profile → Audit Experience so this can be checked.' };
    const okCount = full.count >= (minCount || 1);
    const okYears = minYears ? full.years >= minYears : true;
    if (okCount && okYears) return { ...out, status: 'met', required: minCount || 1, note: needStr + ' · we have ' + full.count + ' matching engagement(s)' + (full.years ? ' across ' + full.years + ' year(s)' : '') + (ev(full) ? ' — e.g. ' + ev(full) : '') };
    if (full.count > 0) { const gap = []; if (!okCount) gap.push('need ' + (minCount || 1) + ', have ' + full.count); if (!okYears) gap.push('need ' + minYears + ' yrs, have ' + full.years); return { ...out, status: 'not-met', required: minCount || 1, note: needStr + ' (' + gap.join('; ') + ') — ' + ev(full) }; }
    if (types.size && kindOnly.count > 0) return { ...out, status: 'unknown', note: needStr + ' — we have ' + kindOnly.count + ' engagement(s) for these clients but of a different audit type; confirm they count. E.g. ' + ev(kindOnly) };
    return { ...out, status: 'not-met', required: minCount || 1, note: needStr + ' — no matching records in Audit Experience.' };
  }
  if (/\bcategor(?:y|ies)\b/.test(t) && /(?:as\s*per|icai|mef|ranking|multipurpose\s*empanel|empanel)/.test(t)) { out.kind = 'category'; const want = (text.match(/categor(?:y|ies)\s*[-–:]?\s*(I{1,3}V?|IV|[1-4])\b/i) || [])[1]; const have = profile.mefCategory || profile.firmCategory || ''; if (want && have) { const norm = x => String(x).toUpperCase().replace(/[^IV1-4]/g, ''); return { ...out, status: norm(have) === norm(want) ? 'met' : 'not-met', note: 'Requires Category ' + want + ' · Firm Profile says Category ' + have + '.' }; } return { ...out, status: 'unknown', note: 'Requires ' + (want ? 'Category ' + want : 'a specific ICAI/MEF category') + ' — firm category is not recorded in the Firm Profile. Confirm from the latest MEF / Firm Card.' }; }
  if (/turnover|gross\s*receipt|annual\s*receipt|professional\s*receipt|fee\s*income|gross\s*(?:professional\s*)?fee|revenue/.test(t)) { out.kind = 'turnover'; const thirdParty = /(?:institute|university|college|school|autonomous\s*body|organisation|organization|department|undertaking|client|company|entity)[^.]{0,80}?(?:having|with|of)\s*(?:a\s*)?(?:minimum\s*)?(?:annual\s*)?turnover/.test(t); const aboutUs = /(?:bidder|firm|applicant|agency|tenderer|company)[''s]*\s*(?:annual\s*|average\s*|gross\s*)*(?:turnover|receipts?)|turnover\s*of\s*the\s*(?:bidder|firm|applicant|agency|tenderer)/.test(t); if (thirdParty && !aboutUs) return { ...out, kind: 'experience', status: 'info', note: 'The turnover figure here belongs to the client/institute, not to us — this clause is about where our experience was gained. Read it manually.' }; const wantsAvg = /\baverage|\bavg\b|\bmean\b/.test(t); const wantsEach = /each\s*year|every\s*year|each\s*of\s*the|in\s*each|all\s*(?:the\s*)?three\s*(?:financial\s*)?years?|consecutive/.test(t); const ourTurnover = wantsAvg ? turnoverAvg : (wantsEach ? turnoverMin : turnoverBest); const basis = wantsAvg ? 'average of ' + tYears.length + ' yr' : wantsEach ? 'lowest of ' + tYears.length + ' yr' : 'best year'; const m = moneyNear(text, ['(?:turnover|receipts?|fee\\s*income|fees?|revenue)'], 130) || moneyNear(text, ['(?:minimum|at\\s*least|not\\s*less\\s*than|of)'], 60); let need = m && m.value >= 10000 ? m.value : 0; let scoredFloor = false; if (!need && c.bands) { const amts = []; const re = /(?:₹|Rs\.?|INR)\s*([\d][\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|crs?|cr)\b/gi; let mm; while ((mm = re.exec(c.bands))) { const v = toAmount(mm[1], mm[2]); if (v >= 10000) amts.push(v); } if (amts.length) { need = Math.min.apply(null, amts); scoredFloor = true; } } if (!need) return { ...out, status: 'unknown', note: 'Turnover/receipts required but the amount could not be read — open the PDF.' }; out.required = need; if (!ourTurnover) return { ...out, status: 'unknown', note: 'Requires ' + money(need) + ' — our turnover is blank in the Firm Profile.' }; out.status = ourTurnover >= need ? 'met' : 'not-met'; out.note = (scoredFloor ? 'Scored — minimum to score marks: ' : 'Requires ') + money(need) + (wantsAvg ? ' (average)' : '') + ' · we have ' + money(ourTurnover) + ' (' + basis + ')'; return out; }
  if (/peer\s*review/.test(t)) { out.kind = 'peer_review'; if (!profile.peerReview) return { ...out, status: 'not-met', note: 'Peer Review certificate required — Firm Profile says we do not hold one.' }; if (profile.peerReviewValidTill && profile.peerReviewValidTill < todayStr()) return { ...out, status: 'not-met', note: 'Our Peer Review certificate expired on ' + profile.peerReviewValidTill + '.' }; return { ...out, status: 'met', note: 'We hold a valid Peer Review certificate' + (profile.peerReviewValidTill ? ' (till ' + profile.peerReviewValidTill + ')' : '') + '.' }; }
  if (/c\s*&?\s*ag|comptroller\s*(?:and|&)\s*auditor/.test(t)) { out.kind = 'cag'; return profile.cagEmpanelled ? { ...out, status: 'met', note: 'We are CAG empanelled' + (profile.cagCategory ? ' (Category ' + profile.cagCategory + ')' : '') + '.' } : { ...out, status: 'not-met', note: 'CAG empanelment required — Firm Profile says we are not empanelled.' }; }
  if (/\brbi\b|reserve\s*bank/.test(t)) { out.kind = 'rbi'; return profile.rbiEmpanelled ? { ...out, status: 'met', note: 'We are RBI empanelled.' } : { ...out, status: 'not-met', note: 'RBI empanelment required — Firm Profile says we are not empanelled.' }; }
  const partnerCount = /\bfca\b|fellow\s*member/.test(t) || /(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*|or\s*more\s*)?(?:fca\s*|fellow\s*|chartered\s*accountants?\s*|cas?\s*)?(?:as\s*)?partners?\b/i.test(t) || /partners?\b[\s\S]{0,20}?(?:minimum|at\s*least|not\s*less\s*than|shall\s*be|should\s*be)\s*\d/i.test(t) || /number\s*of\s*(?:ca\s*)?(?:as\s*)?partners?/i.test(t) || /\bproprietor\b/.test(t);
  if (partnerCount) { out.kind = 'partners'; if (/to\s*be\s*deployed|deployed|posted|assigned\s*to\s*(?:the\s*)?(?:work|assignment)|team\s*leader|engagement\s*partner/.test(t)) { const haveFca = num(profile.fcaPartners); return { ...out, kind: 'staffing', status: 'info', note: 'About the person we deploy, not a firm-level count. We have ' + (haveFca || 'no') + ' FCA partner(s) on record — confirm one meets the experience asked here.' }; } const comp = t.match(/(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*)?partners?\b[\s\S]{0,60}?(?:out\s*of\s*(?:which|whom)|of\s*(?:which|whom)|including|whereof)[\s\S]{0,30}?(\d{1,2})[\s\S]{0,25}?(?:fca|fellow)/i) || t.match(/(\d{1,2})\s*(?:cas?|chartered\s*accountants?)?[\s\S]{0,20}?(?:or\s*more\s*)?(?:as\s*)?partners?\b[\s\S]{0,50}?\band\b[\s\S]{0,40}?(\d{1,2})\s*(?:cas?|chartered\s*accountants?)?[\s\S]{0,25}?(?:should\s*be\s*|must\s*be\s*|to\s*be\s*)?(?:fca|fellow)/i); if (comp) { out.kind = 'partners_fca'; const needTot = num(comp[1]), needFca = num(comp[2]); out.required = needTot; const haveTot = num(profile.partnersTotal), haveFca = num(profile.fcaPartners); if (!haveTot || !haveFca) return { ...out, status: 'unknown', note: 'Requires ' + needTot + ' partner(s) incl. ' + needFca + ' FCA — partner counts are blank in the Firm Profile.' }; const okTot = haveTot >= needTot, okFca = haveFca >= needFca; out.status = (okTot && okFca) ? 'met' : 'not-met'; out.note = 'Requires ' + needTot + ' partner(s) (we have ' + haveTot + (okTot ? ' ✓' : ' ✗') + ') incl. ' + needFca + ' FCA (we have ' + haveFca + (okFca ? ' ✓' : ' ✗') + ')'; return out; } const wantsFca = /\bfca\b|fellow/.test(t); out.kind = wantsFca ? 'fca_partners' : 'partners'; const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than|atleast)\s*(?:of\s*)?(\d{1,2})/i) || numIn(/(\d{1,2})\s*(?:\([a-z]+\)\s*)?(?:full[\s-]*time\s*)?(?:fca\s*|fellow\s*)?partners?/i) || numIn(/partners?[^.]{0,25}?(\d{1,2})/i); if (!need) return { ...out, status: 'info', note: 'Mentions partners but no minimum number could be read — check the PDF.' }; out.required = need; const have = wantsFca ? num(profile.fcaPartners) : num(profile.partnersTotal); if (!have) return { ...out, status: 'unknown', note: 'Requires ' + need + (wantsFca ? ' FCA partner(s)' : ' partner(s)') + ' — count is blank in the Firm Profile.' }; out.status = have >= need ? 'met' : 'not-met'; out.note = 'Requires ' + need + (wantsFca ? ' FCA partner(s)' : ' partner(s)') + ' · we have ' + have; return out; }
  if (/year/.test(t) && /(experience|standing|existence|practice|established|constitut|operat|in\s*business|incorporat)/.test(t)) { out.kind = 'experience'; const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than|min\.?|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:\+)?\s*years/i) || numIn(/(\d{1,2})\s*(?:\+)?\s*years?\s*(?:in\s*(?:operation|business|existence)|of\s*(?:experience|standing|existence|operation))/i) || numIn(/(\d{1,2})\s*(?:\+)?\s*years?/i); if (!need) return { ...out, status: 'info', note: 'Mentions experience but no number of years could be read.' }; out.required = need; if (!firmYears) return { ...out, status: 'unknown', note: 'Requires ' + need + ' years — firm age is blank in the Firm Profile.' }; out.status = firmYears >= need ? 'met' : 'not-met'; out.note = 'Requires ' + need + ' years · we have ' + firmYears + (c.scored ? ' (scored — see bands)' : ''); return out; }
  if (/qualified\s*(?:assistant|staff|chartered)|chartered\s*accountants?\s*(?:on\s*(?:its\s*)?rolls?|employed)|audit\s*staff|semi[\s-]*qualified/.test(t)) { out.kind = 'ca_staff'; const need = numIn(/(?:minimum|at\s*least|not\s*less\s*than)\s*(\d{1,2})/i) || numIn(/(\d{1,2})\s*(?:qualified|chartered|ca\b)/i); const have = num(profile.caEmployees); if (!need) return { ...out, status: 'info', note: 'Mentions qualified staff but no number could be read.' }; out.required = need; if (!have) return { ...out, status: 'unknown', note: 'Requires ' + need + ' qualified staff — count is blank in the Firm Profile.' }; out.status = have >= need ? 'met' : 'not-met'; out.note = 'Requires ' + need + ' · we have ' + have; return out; }
  if (/\bgstin?\b|\bgst\b|\bpan\b|\bmsme\b|udyam|registration\s*(?:no|number|certificate)/.test(t)) { out.kind = 'registration'; const need = []; if (/\bgstin?\b|\bgst\b/.test(t) && !profile.gstin) need.push('GSTIN'); if (/\bpan\b/.test(t) && !profile.pan) need.push('PAN'); if (/(\bmsme\b|udyam)/.test(t) && !profile.msme) need.push('MSME/Udyam'); if (need.length) return { ...out, status: 'unknown', note: 'Asks for ' + need.join(', ') + ' — not filled in the Firm Profile.' }; return { ...out, status: 'met', note: 'Registration numbers are on file in the Firm Profile.' }; }
  if (/office|branch|located|situated|local\s*presence|head\s*quarter/.test(t)) { out.kind = 'location'; const states = (profile.states || []).map(s => s.toLowerCase()).filter(Boolean); const ours = (profile.states || []).join(', ') || 'not set'; const hit = states.find(s => t.includes(s)); if (hit) return { ...out, status: 'met', note: 'We have a presence in ' + hit.replace(/\b\w/g, ch => ch.toUpperCase()) + '.' }; const pm = c.text.match(/(?:office|branch|presence)[^.]{0,40}?\b(?:in|at)\s+([A-Z][A-Za-z]+(?:\s*\([^)]{1,12}\))?)/); const place = pm ? pm[1].trim() : ''; const sent = pm ? (c.text.slice(0, pm.index + pm[0].length).split(/(?<=\.)\s+/).pop() || c.text) : c.text; const st = sent.toLowerCase(); const mand = /should|shall|must|required/.test(st) && !/preference|preferab|desirab/.test(st); return { ...out, status: place ? 'unknown' : 'info', note: place ? 'Wants an office in ' + place + (mand ? ' (mandatory)' : ' (preference only)') + ' — our states: ' + ours + '. Confirm whether we have a registered office there.' : 'Mentions office/location — check whether a local office is mandatory. Our states: ' + ours + '.' }; }
  if (/emd|earnest\s*money|bid\s*security|tender\s*fee|cost\s*of\s*(?:tender|bid|document|rfp)/.test(t)) { const m = moneyNear(text, ['(?:emd|earnest\\s*money|bid\\s*security|fee|cost)'], 90); return { ...out, kind: 'cost', status: 'info', note: m ? 'Payable: ' + money(m.value) : 'A fee/EMD is payable — see the PDF.' }; }
  return out;
}

function evaluateEligibility(profile, crit, tender) {
  const reasons = [], fails = [];
  let checks = 0, unknowns = 0;
  const money = v => '₹' + Number(v || 0).toLocaleString('en-IN');
  if (profile && profile.configured && (crit.clauses || []).length) {
    const points = crit.clauses.map(c => judgeClause(profile, c));
    const notMet = points.filter(p => p.status === 'not-met');
    const unk = points.filter(p => p.status === 'unknown');
    const met = points.filter(p => p.status === 'met');
    let verdict;
    if (notMet.length) verdict = 'Not Eligible';
    else if (unk.length || !met.length) verdict = 'Needs Review';
    else verdict = 'Eligible';
    const summary = met.length + ' of ' + points.filter(p => p.status !== 'info').length + ' checkable criteria met' + (notMet.length ? ' · ' + notMet.length + ' not met' : '') + (unk.length ? ' · ' + unk.length + ' need info' : '');
    return { verdict, points, summary, sectionTitle: crit.sectionTitle || '', checks: points.filter(p => p.status !== 'info').length, unknowns: unk.length, failCount: notMet.length, reasons: [summary].concat(notMet.map(p => '✗ ' + p.note), unk.map(p => '⚠ ' + p.note), met.map(p => '✓ ' + p.note)) };
  }
  if (!profile || !profile.configured) {
    const wants = [];
    if (crit.minTurnover) wants.push('turnover ' + money(crit.minTurnover));
    if (crit.minYears) wants.push(crit.minYears + ' years standing');
    if (crit.minPartners) wants.push(crit.minPartners + ' partners');
    if (crit.minFcaPartners) wants.push(crit.minFcaPartners + ' FCA partners');
    if (crit.peerReviewRequired) wants.push('peer review certificate');
    if (crit.cagRequired) wants.push('CAG empanelment');
    if (crit.rbiRequired) wants.push('RBI empanelment');
    return { verdict: 'Needs Review', reasons: ['⚠ Firm profile not set up — fill it in under Settings → Firm Profile to enable automatic eligibility checks.'].concat(wants.length ? ['This tender appears to require: ' + wants.join(', ')] : []), checks: 0, unknowns: wants.length, failCount: 0 };
  }
  const ourTurnover = Math.max(num(profile.turnoverY1), num(profile.turnoverY2), num(profile.turnoverY3));
  if (crit.minTurnover) { checks++; if (!ourTurnover) { unknowns++; reasons.push('⚠ Turnover required ' + money(crit.minTurnover) + ' — our turnover not filled in the firm profile'); } else if (ourTurnover >= crit.minTurnover) reasons.push('✓ Turnover ' + money(ourTurnover) + ' meets ' + money(crit.minTurnover)); else { fails.push('Turnover ' + money(ourTurnover) + ' is below the required ' + money(crit.minTurnover)); } }
  if (crit.minYears) { checks++; let ourYears = num(profile.experienceYears); if (!ourYears && profile.constitutionDate) { const d = new Date(profile.constitutionDate); if (!isNaN(d)) ourYears = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5)); } if (!ourYears) { unknowns++; reasons.push('⚠ ' + crit.minYears + ' years standing required — our firm age not filled in'); } else if (ourYears >= crit.minYears) reasons.push('✓ ' + ourYears + ' years standing meets ' + crit.minYears); else fails.push('Firm standing ' + ourYears + ' years is below the required ' + crit.minYears); }
  if (crit.minPartners) { checks++; const p = num(profile.partnersTotal); if (!p) { unknowns++; reasons.push('⚠ ' + crit.minPartners + ' partners required — partner count not filled in'); } else if (p >= crit.minPartners) reasons.push('✓ ' + p + ' partners meets ' + crit.minPartners); else fails.push('Only ' + p + ' partners against the required ' + crit.minPartners); }
  if (crit.minFcaPartners) { checks++; const f = num(profile.fcaPartners); if (!f) { unknowns++; reasons.push('⚠ ' + crit.minFcaPartners + ' FCA partners required — FCA count not filled in'); } else if (f >= crit.minFcaPartners) reasons.push('✓ ' + f + ' FCA partners meets ' + crit.minFcaPartners); else fails.push('Only ' + f + ' FCA partners against the required ' + crit.minFcaPartners); }
  if (crit.peerReviewRequired) { checks++; if (!profile.peerReview) fails.push('Peer review certificate required — firm profile says we do not hold one'); else if (profile.peerReviewValidTill && profile.peerReviewValidTill < todayStr()) fails.push('Peer review certificate expired on ' + profile.peerReviewValidTill); else reasons.push('✓ Peer review certificate held' + (profile.peerReviewValidTill ? ' (valid till ' + profile.peerReviewValidTill + ')' : '')); }
  if (crit.cagRequired) { checks++; if (profile.cagEmpanelled) reasons.push('✓ CAG empanelled' + (profile.cagCategory ? ' (Cat ' + profile.cagCategory + ')' : '')); else fails.push('CAG empanelment required — firm profile says we are not CAG empanelled'); }
  if (crit.rbiRequired) { checks++; if (profile.rbiEmpanelled) reasons.push('✓ RBI empanelled'); else fails.push('RBI empanelment required — firm profile says we are not RBI empanelled'); }
  const states = (profile.states || []).map(s => s.toLowerCase());
  const loc = String((tender && (tender.location || tender.psuName)) || '').toLowerCase();
  if (states.length && loc) { const near = states.some(s => s && loc.includes(s)); reasons.push(near ? '✓ Location matches one of our states' : 'ℹ Outside our listed states — check if local presence is mandatory'); }
  let verdict;
  if (fails.length) verdict = 'Not Eligible';
  else if (checks === 0 || unknowns > 0) verdict = 'Needs Review';
  else verdict = 'Eligible';
  return { verdict, reasons: fails.map(f => '✗ ' + f).concat(reasons), checks, unknowns, failCount: fails.length };
}

// ── Read tender PDF ──
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
    const data = await pdfParse(buf, { max: 40 });
    const text = String(data.text || '');
    const pages = data.numpages || 1;
    const body = text.replace(/page\s*\d+\s*(?:of|\/)\s*\d+/gi, ' ').replace(/\s+/g, ' ').trim();
    const letters = (body.match(/[A-Za-z]/g) || []).length;
    const perPage = letters / pages;
    if (letters < 400 || perPage < 80) return { ok: false, scanned: true, pages, letters, error: `This tender is a scanned document — ${pages} page(s) but only ${letters} characters of selectable text. It can't be read automatically; open the PDF and check the criteria by hand.` };
    return { ok: true, text, pages, letters };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'PDF download timed out' : (e.message || 'Could not read PDF') };
  } finally { clearTimeout(to); }
}

// ── Analyse one tender ──
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
  if (crit.emdAmount && !num(tender.emdAmount)) tender.emdAmount = crit.emdAmount;
  if (crit.tenderFee && !num(tender.tenderFee)) tender.tenderFee = crit.tenderFee;
  if (crit.minTurnover && !num(tender.tenderValue)) tender.tenderValue = 0;
  tender.extracted = { ...crit, pages: read.pages, at: new Date().toISOString() };
  tender.eligibility = { verdict: ev.verdict, reasons: ev.reasons, checks: ev.checks, points: ev.points || [], summary: ev.summary || '', sectionTitle: ev.sectionTitle || crit.sectionTitle || '', at: new Date().toISOString() };
  tender.updatedAt = new Date().toISOString();
  if (!tender.events) tender.events = [];
  tender.events.push({ id: newId(), type: 'note', status: tender.status, note: 'Auto-check from tender PDF — ' + ev.verdict + (ev.reasons.length ? ': ' + ev.reasons.join(' | ') : ''), byId: 'system', byName: actor || 'Auto-import', date: new Date().toISOString() });
  return { ok: true, verdict: ev.verdict, reasons: ev.reasons, extracted: tender.extracted };
}

// ═══════════════════════════════════════════════════════════
// Batch analysis state (module-level)
// ═══════════════════════════════════════════════════════════
let _batchJob = { running: false, total: 0, done: 0, eligible: 0, notEligible: 0, review: 0, failed: 0, startedAt: 0, finishedAt: 0, current: '', by: '' };
function batchSnapshot() {
  const j = _batchJob;
  const elapsed = j.startedAt ? ((j.finishedAt || Date.now()) - j.startedAt) / 1000 : 0;
  const avg = j.done ? elapsed / j.done : 0;
  const left = Math.max(0, j.total - j.done);
  return { running: j.running, total: j.total, done: j.done, percent: j.total ? Math.round((j.done / j.total) * 100) : 0, eligible: j.eligible, notEligible: j.notEligible, review: j.review, failed: j.failed, current: j.current, by: j.by, elapsedSec: Math.round(elapsed), etaSec: (j.running && avg) ? Math.round(avg * left) : 0 };
}
async function runBatchAnalyse(ids, actor) {
  _batchJob = { running: true, total: ids.length, done: 0, eligible: 0, notEligible: 0, review: 0, failed: 0, startedAt: Date.now(), finishedAt: 0, current: '', by: actor };
  for (const id of ids) {
    let db = readDB();
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

// ═══════════════════════════════════════════════════════════
// Tender sync (exported for scheduler)
// ═══════════════════════════════════════════════════════════
let _syncRunning = false;
async function runTenderSync(trigger) {
  if (_syncRunning) return { skipped: 'already running' };
  _syncRunning = true;
  try {
    let db = readDB();
    const profile = getFirmProfile(db);
    if (profile.autoSync === false && trigger !== 'manual') return { skipped: 'auto-sync off' };
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
      const t = { id: newId(), category: TENDER_CATEGORIES.includes(i.category) ? i.category : 'psu_company', psuName: String(i.psuName).slice(0, 200), tenderRef: '', sourceRef: String(i.ref).slice(0, 80), importKey: key, description: String(i.description || '').slice(0, 400), natureOfWork: i.natureOfWork || '', applicationDate: '', dueDate: i.dueDate || '', tenderValue: 0, quotationValue: 0, emdAmount: 0, emdStatus: '', source: 'ICAI TMD', tenderFee: 0, bidOpeningDate: '', l1Value: 0, sourceUrl: i.sourceUrl || '', pdfUrl: i.pdfUrl || '', location: i.location || '', contactEmail: i.email || '', partnerId: pId, partnerName: pName, status: 'Identified', importedFrom: 'ICAI TMD (auto)', importedAt: now, createdBy: 'system', createdByName: 'Auto-sync', createdAt: now, updatedAt: now, events: [{ id: newId(), type: 'created', status: 'Identified', note: noteBits.join(' · ').slice(0, 1000), byId: 'system', byName: 'Auto-sync', date: now }] };
      db.tenders.push(t); have.add(key); if (t.sourceRef) have.add(t.sourceRef); fresh.push(t);
    });
    const backlog = db.tenders.filter(t => t.importedFrom && String(t.importedFrom).startsWith('ICAI TMD') && !t.extracted && t.pdfUrl);
    const queue = [];
    fresh.forEach(t => { if (queue.length < SYNC_PDF_PER_RUN) queue.push(t); });
    backlog.forEach(t => { if (queue.length < SYNC_PDF_PER_RUN && !queue.includes(t)) queue.push(t); });
    let analysed = 0, eligible = 0;
    for (const t of queue) {
      try { const r = await analyseTender(db, t, 'Auto-sync'); analysed++; if (r.ok && r.verdict === 'Eligible') eligible++; } catch (e) {}
    }
    db.tenderSync = { at: now, found: items.length, imported: fresh.length, analysed, trigger: trigger || 'hourly' };
    writeDB(db);
    const newEligible = fresh.filter(t => t.eligibility && t.eligibility.verdict === 'Eligible');
    if (newEligible.length) {
      const recips = (db.users || []).filter(u => u.role === 'admin' || (u.designation || '').toLowerCase().includes('partner'));
      const tenderSummary = newEligible.slice(0, 5).map(t => t.psuName + ' \u2014 ' + t.natureOfWork + ' (due ' + (t.dueDate || 'n/a') + ')').join('; ') + (newEligible.length > 5 ? ' \u2026and more' : '');
      dispatchNotification(db, 'new-eligible-tender',
        recips.map(u => ({ userId: u.id, email: u.email, mobile: u.mobile, name: u.name })),
        {
          count: newEligible.length,
          firstPsu: newEligible[0].psuName,
          firstDueDate: newEligible[0].dueDate || 'n/a',
          tenderSummary
        }
      ).catch(() => {});
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

// ═══════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════

router.get('/', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const tenders = (db.tenders || []).slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ tenders, statuses: TENDER_STATUSES, categories: TENDER_CATEGORIES });
});

router.post('/', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  if (!db.tenders) db.tenders = [];
  const { category, psuName, tenderRef, natureOfWork, applicationDate, dueDate, tenderValue, quotationValue, emdAmount, emdStatus, source, tenderFee, bidOpeningDate, l1Value, partnerId, partnerName, status, note } = req.body || {};
  if (!psuName || !String(psuName).trim()) return res.status(400).json({ error: 'Name of PSU is required.' });
  const cat = TENDER_CATEGORIES.includes(category) ? category : 'psu_company';
  const st = TENDER_STATUSES.includes(status) ? status : 'Identified';
  let pId = partnerId || req.user.id;
  let pName = (partnerName || '').trim();
  if (!pName) { const u = (db.users || []).find(x => x.id === pId); pName = u ? u.name : req.user.name; }
  const now = new Date().toISOString();
  const tender = { id: newId(), category: cat, psuName: String(psuName).trim(), tenderRef: (tenderRef || '').trim(), natureOfWork: (natureOfWork || '').trim(), applicationDate: applicationDate ? String(applicationDate).slice(0, 10) : '', dueDate: dueDate ? String(dueDate).slice(0, 10) : '', tenderValue: num(tenderValue), quotationValue: num(quotationValue), emdAmount: num(emdAmount), emdStatus: (emdStatus || '').trim(), source: (source || '').trim(), tenderFee: num(tenderFee), bidOpeningDate: bidOpeningDate ? String(bidOpeningDate).slice(0, 10) : '', l1Value: num(l1Value), partnerId: pId, partnerName: pName, status: st, createdBy: req.user.id, createdByName: req.user.name, createdAt: now, updatedAt: now, events: [{ id: newId(), type: 'created', status: st, note: (note || '').trim(), byId: req.user.id, byName: req.user.name, date: now }] };
  db.tenders.push(tender);
  writeDB(db);
  res.json(tender);
});

router.put('/:id', auth, partnerOrAdmin, (req, res) => {
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
  if (partnerId !== undefined) { t.partnerId = partnerId; const u = (db.users || []).find(x => x.id === partnerId); t.partnerName = (partnerName || (u ? u.name : t.partnerName) || '').trim(); } else if (partnerName !== undefined) { t.partnerName = String(partnerName).trim(); }
  t.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(t);
});

router.post('/:id/event', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const t = (db.tenders || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender not found.' });
  const { status, note, date } = req.body || {};
  const now = new Date().toISOString();
  const evStatus = TENDER_STATUSES.includes(status) ? status : t.status;
  const ev = { id: newId(), type: (status && status !== t.status) ? 'status' : 'note', status: evStatus, note: (note || '').trim(), byId: req.user.id, byName: req.user.name, date: (date && !isNaN(new Date(date))) ? new Date(date).toISOString() : now };
  if (!t.events) t.events = [];
  t.events.push(ev);
  if (status && TENDER_STATUSES.includes(status)) t.status = status;
  t.updatedAt = now;
  writeDB(db);
  res.json(t);
});

router.delete('/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const before = (db.tenders || []).length;
  db.tenders = (db.tenders || []).filter(x => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true, deleted: before - (db.tenders || []).length });
});

// ── Import ──
router.get('/import/preview', auth, partnerOrAdmin, async (req, res) => {
  try {
    const html = await fetchTmdHtml();
    const items = parseTmdOpportunities(html);
    const db = readDB();
    const have = tenderKeySet(db.tenders);
    const rows = items.map(i => { const key = tenderImportKey(i); return { ...i, importKey: key, alreadyImported: have.has(key) || have.has(i.ref) }; });
    res.json({ ok: true, source: ICAI_TMD_URL, count: rows.length, items: rows, debug: rows.length ? undefined : String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600) });
  } catch (e) { res.status(502).json({ error: 'Could not fetch the ICAI tender list: ' + (e.message || 'unknown error') }); }
});

router.post('/import', auth, partnerOrAdmin, (req, res) => {
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
    if (have.has(key) || have.has(i.ref)) { skipped++; return; }
    const noteBits = [i.description, i.address ? 'Address: ' + i.address : '', i.email ? 'Email: ' + i.email : '', i.pdfUrl ? 'Tender PDF: ' + i.pdfUrl : ''].filter(Boolean);
    const t = { id: newId(), category: TENDER_CATEGORIES.includes(i.category) ? i.category : 'psu_company', psuName: String(i.psuName).slice(0, 200), importKey: key, description: String(i.description || '').slice(0, 400), sourceRef: String(i.ref).slice(0, 80), tenderRef: '', natureOfWork: i.natureOfWork || '', applicationDate: '', dueDate: i.dueDate || '', tenderValue: 0, quotationValue: 0, emdAmount: 0, emdStatus: '', source: 'ICAI TMD', tenderFee: 0, bidOpeningDate: '', l1Value: 0, sourceUrl: i.sourceUrl || '', pdfUrl: i.pdfUrl || '', location: i.location || '', contactEmail: i.email || '', partnerId: pId, partnerName: pName, status: 'Identified', importedFrom: 'ICAI TMD', importedAt: now, createdBy: req.user.id, createdByName: req.user.name, createdAt: now, updatedAt: now, events: [{ id: newId(), type: 'created', status: 'Identified', note: noteBits.join(' · ').slice(0, 1000), byId: req.user.id, byName: req.user.name, date: now }] };
    db.tenders.push(t); have.add(key); if (t.sourceRef) have.add(t.sourceRef); created++;
  });
  if (created) logAudit(db, req, 'created', 'client', '', 'Government tenders', `imported ${created} tender(s) from ICAI TMD`);
  writeDB(db);
  res.json({ ok: true, created, skipped });
});

// ── Analyse ──
router.post('/analyse-all', auth, partnerOrAdmin, (req, res) => {
  if (_batchJob.running) return res.status(409).json({ error: 'A read is already running.', progress: batchSnapshot() });
  const force = String((req.body && req.body.force) || req.query.force || '') === '1';
  const db = readDB();
  const ids = (db.tenders || []).filter(t => t.pdfUrl && (force || !t.extracted)).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).map(t => t.id);
  if (!ids.length) return res.json({ ok: true, started: false, total: 0, message: 'Nothing to read.' });
  runBatchAnalyse(ids, req.user.name);
  res.json({ ok: true, started: true, total: ids.length, progress: batchSnapshot() });
});

router.get('/analyse-progress', auth, partnerOrAdmin, (req, res) => res.json(batchSnapshot()));

router.post('/:id/analyse', auth, partnerOrAdmin, async (req, res) => {
  const db = readDB();
  const t = (db.tenders || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tender not found.' });
  const r = await analyseTender(db, t, req.user.name);
  writeDB(db);
  res.json({ ok: r.ok, verdict: t.eligibility ? t.eligibility.verdict : 'Needs Review', eligibility: t.eligibility, extracted: t.extracted, error: r.error });
});

// ── Dedupe ──
router.post('/dedupe', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const all = db.tenders || [];
  const groups = new Map();
  all.forEach(t => { if (!t.importedFrom) return; const key = t.importKey || storedTenderKey(t); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
  const remove = new Set();
  let dupeGroups = 0;
  groups.forEach(list => { if (list.length < 2) return; dupeGroups++; list.sort((a, b) => (tenderHumanEvents(b) - tenderHumanEvents(a)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))); list.slice(1).forEach(t => remove.add(t.id)); });
  if (remove.size) { db.tenders = all.filter(t => !remove.has(t.id)); logAudit(db, req, 'deleted', 'client', '', 'Government tenders', `removed ${remove.size} duplicate imported tender(s)`); writeDB(db); }
  res.json({ ok: true, removed: remove.size, groups: dupeGroups, remaining: (db.tenders || []).length });
});

// ── Bulk delete ──
router.post('/bulk-delete', auth, partnerOrAdmin, (req, res) => {
  const ids = (req.body && req.body.ids) || [];
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No tenders selected.' });
  const db = readDB();
  const set = new Set(ids);
  const gone = (db.tenders || []).filter(t => set.has(t.id));
  db.tenders = (db.tenders || []).filter(t => !set.has(t.id));
  if (gone.length) { logAudit(db, req, 'deleted', 'client', '', 'Government tenders', `deleted ${gone.length} tender(s): ` + gone.slice(0, 5).map(t => t.psuName).join(', ') + (gone.length > 5 ? '…' : '')); writeDB(db); }
  res.json({ ok: true, deleted: gone.length });
});

// ── Sync status ──
router.get('/sync-status', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  res.json({ ...(db.tenderSync || {}), autoSync: getFirmProfile(db).autoSync !== false });
});

router.post('/sync-now', auth, partnerOrAdmin, async (req, res) => {
  const r = await runTenderSync('manual');
  res.json({ ok: !r.error, ...r });
});

// Export sync function for the scheduler
module.exports = router;
module.exports.runTenderSync = runTenderSync;
