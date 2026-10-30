// ═══════════════════════════════════════════════════════════
// routes/firmProfile.routes.js — Firm Profile & ICAI Card Import
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId, num } = require('../utils/helpers');
const { logAudit, diffFields } = require('../services/audit.service');
const { auth, adminOnly, partnerOrAdmin } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// Default profile & helpers
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

// ═══════════════════════════════════════════════════════════
// ICAI Card Parsing helpers
// ═══════════════════════════════════════════════════════════
const MONTHS_ABBR = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const INDIA_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh','Andaman and Nicobar Islands','Dadra and Nagar Haveli','Daman and Diu','Lakshadweep'];

function pdfDateToISO(s) {
  const t = String(s || '').trim();
  let m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m = t.match(/(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{4})/);
  if (m) { const mo = MONTHS_ABBR[m[2].slice(0,3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(parseInt(m[1],10)).padStart(2,'0')}`; }
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

function cardNameFromTokens(txt) {
  const DROP = /^(full|part|time|active|inactive|yes|no|na|ho|br|nil|and|partner|proprietor|paid|assistant|member|sr|s)$/i;
  return String(txt || '').replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ').replace(/\b\d{6}\b/g, ' ').replace(/#/g, ' ').replace(/\b(FCA|ACA)\b/gi, ' ').split(/\s+/).filter(w => /^[A-Za-z][A-Za-z.]{1,}$/.test(w) && !DROP.test(w)).slice(-4).join(' ').trim();
}

function parseCardMemberBlock(block, isPartner, acc, seen) {
  if (!block) return;
  const s = block.replace(/\d{4}\/[A-Za-z]{3}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+Page\s+\d+\s+of\s+\d+/gi, ' ').replace(/PROPRIETOR\s*\/\s*PARTNERS\s*:|PAID\s*ASSISTANTS\s*:/gi, ' ').replace(/MRN\s+NAME\s+COP_STATUS[^\n]*/gi, ' ').replace(/Individual\s*Practice\s*\/?\s*Association[\s\S]{0,80}?Occupation/gi, ' ').replace(/YR\s*OF\s*DISA\s*QUALF|YR\s*OF\s*DISA|QUALF/gi, ' ').replace(/\s+/g, ' ').trim();
  const re = /\b(\d{6})\b\s*#?\s*/g;
  const starts = [];
  let m;
  while ((m = re.exec(s))) starts.push({ no: m[1], at: m.index, end: re.lastIndex });
  const STOP = /^(full|part|time|active|inactive|yes|no|na|ho|br|nil|and)$/i;
  starts.forEach((st, i) => {
    const chunk = s.slice(st.end, i + 1 < starts.length ? starts[i + 1].at : s.length);
    const pre = s.slice(i > 0 ? starts[i - 1].end : 0, st.at);
    const stM = chunk.match(/\b(FCA|ACA)\b/);
    const status = stM ? stM[1].toUpperCase() : '';
    const parts = status ? chunk.split(new RegExp('\\b' + status + '\\b')) : [chunk];
    let name = (parts[0] || '').replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
    if (name) {
      const extra = parts.slice(1).join(' ').replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ').split(/\s+/).filter(w => /^[A-Za-z][A-Za-z.]{1,}$/.test(w) && !STOP.test(w)).slice(0, 4);
      if (extra.length) name = (name + ' ' + extra.join(' ')).trim();
    } else { name = cardNameFromTokens(pre); }
    name = name.replace(/^\d{1,3}[.)\s]+/, '').replace(/[,]+$/, '').trim();
    const dates = (chunk.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map(pdfDateToISO).filter(Boolean);
    if (seen.has(st.no)) return;
    seen.add(st.no);
    acc.push({ membershipNo: st.no, name, status, joinedFirmDate: dates[0] || '', leftDate: dates[1] || '', isPartner: !!isPartner, source: 'Firm Card' });
  });
}

function extractFirmCard(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const out = { members: [], warnings: [], states: [] };
  const marks = [/Details\s*of\s*Merger/i, /Details\s*of\s*De\s*[- ]?Merger/i, /Head\s*Office\s*and\s*Branch\s*Details/i, /PROPRIETOR\s*\/\s*PARTNERS/i].map(r => text.search(r)).filter(i => i > -1);
  const head = text.slice(0, marks.length ? Math.min(...marks) : text.length);
  const frnM = head.match(/Firm\s*Reg(?:n|istration)?\.?\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d{6}\s*[A-Za-z])/i);
  out.frn = frnM ? frnM[1].replace(/\s+/g, '').toUpperCase() : '';
  const nameM = head.match(/Name\s*of\s*the\s*Firm\s*[:\-]?\s*([^\n]+)/i);
  out.firmName = nameM ? nameM[1].trim().replace(/^M\/?s\.?\s*/i, '').trim() : '';
  const dcM = head.match(/Date\s*(?:Constituted|of\s*Constitution)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]+\d{4})/i);
  out.constitutionDate = dcM ? pdfDateToISO(dcM[1]) : '';
  const gstM = head.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/);
  if (gstM) out.gstin = gstM[1];
  const pStart = text.search(/PROPRIETOR\s*\/\s*PARTNERS\s*:/i);
  const aStart = text.search(/PAID\s*ASSISTANTS\s*:/i);
  const memStart = pStart > -1 ? pStart : (aStart > -1 ? aStart : 0);
  const stopRe = /\(Name\s*in\s*Block\s*Letters|THIS\s*DOES\s*NOT\s*CONSTITUTE|Disclaimer\s*:|PINCODE\s*:|\bM\/S\.\s|Note\s*:/i;
  const rel = text.slice(memStart).search(stopRe);
  const tailStart = rel > -1 ? memStart + rel : text.length;
  const seen = new Set();
  if (pStart > -1) parseCardMemberBlock(text.slice(pStart, aStart > pStart ? aStart : tailStart), true, out.members, seen);
  if (aStart > -1) parseCardMemberBlock(text.slice(aStart, tailStart), false, out.members, seen);
  const bStart = text.search(/Head\s*Office\s*and\s*Branch\s*Details/i);
  if (bStart > -1) { const bEnd = pStart > bStart ? pStart : text.length; const bBlock = text.slice(bStart, bEnd).replace(/\s+/g, ' ').toUpperCase(); INDIA_STATES.forEach(st => { if (bBlock.includes(st.toUpperCase())) out.states.push(st); }); out.states = [...new Set(out.states)]; }
  const partners = out.members.filter(m => m.isPartner && !m.leftDate);
  out.derived = { partnersTotal: partners.length, fcaPartners: partners.filter(m => m.status === 'FCA').length, caEmployees: out.members.filter(m => !m.isPartner && !m.leftDate).length };
  if (!out.members.length) out.warnings.push('No members found — this may not be an ICAI Firm Card, or it may be a scanned copy.');
  if (!out.frn) out.warnings.push('Firm Registration Number not found — please type it in.');
  if (!out.constitutionDate) out.warnings.push('Date of constitution not found — please type it in.');
  return out;
}

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

// ═══════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════

// ── GET/PUT /api/firm-profile ──
router.get('/', auth, partnerOrAdmin, (req, res) => {
  res.json(getFirmProfile(readDB()));
});

router.put('/', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = getFirmProfile(db);
  const b = req.body || {};
  const p = { ...before };
  ['firmName','frn','constitutionDate','cagCategory','peerReviewValidTill','pan','gstin','msme','defaultTenderPartnerId','defaultTenderPartnerName']
    .forEach(f => { if (b[f] !== undefined) p[f] = String(b[f] || '').trim().toUpperCase() === '' ? '' : String(b[f]).trim(); });
  ['pan','gstin','msme','frn'].forEach(f => { if (p[f]) p[f] = String(p[f]).toUpperCase(); });
  ['partnersTotal','fcaPartners','caEmployees','totalStaff','turnoverY1','turnoverY2','turnoverY3','experienceYears']
    .forEach(f => { if (b[f] !== undefined) p[f] = num(b[f]); });
  ['peerReview','cagEmpanelled','rbiEmpanelled','gemRegistered','psuAuditExp','bankAuditExp','autoSync']
    .forEach(f => { if (b[f] !== undefined) p[f] = !!b[f]; });
  if (b.states !== undefined) {
    p.states = Array.isArray(b.states) ? b.states.map(s => String(s).trim()).filter(Boolean)
      : String(b.states || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  }
  p.configured = true;
  db.firmProfile = p;
  const changed = diffFields(before, p, Object.keys(DEFAULT_FIRM_PROFILE).filter(k => k !== 'states' && k !== 'experience'));
  logAudit(db, req, 'updated', 'settings', 'firm-profile', 'Firm eligibility profile', changed || 'states/other updated');
  writeDB(db);
  res.json(p);
});

// ── Experience ──
router.get('/experience/meta', auth, partnerOrAdmin, (req, res) => {
  res.json({ clientTypes: EXP_CLIENT_TYPES, assignmentTypes: EXP_ASSIGN_TYPES });
});

router.post('/experience', auth, partnerOrAdmin, (req, res) => {
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

router.put('/experience/:id', auth, partnerOrAdmin, (req, res) => {
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

router.delete('/experience/:id', auth, partnerOrAdmin, (req, res) => {
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

// ── Parse card (preview) ──
router.post('/parse-card', auth, adminOnly, async (req, res) => {
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
  if (text.replace(/\s/g, '').length < 40) return res.status(400).json({ error: 'This PDF has no readable text — it looks like a scanned image. Please download the card again from the ICAI portal (the original is text-based).' });
  const extracted = kind === 'firm' ? extractFirmCard(text) : extractMemberCard(text);
  const profile = getFirmProfile(readDB());
  res.json({ ok: true, kind, extracted, current: profile, pages: data.numpages });
});

// ── Apply card import ──
router.post('/apply-card', auth, adminOnly, (req, res) => {
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
      data.members.forEach(m => { if (!m || !m.membershipNo) return; byNo.set(m.membershipNo, { ...(byNo.get(m.membershipNo) || {}), ...m }); });
      p.members = [...byNo.values()];
      applied.push(data.members.length + ' member(s)');
    }
    if (Array.isArray(data.states) && data.states.length) { p.states = [...new Set((p.states || []).concat(data.states))]; applied.push(data.states.length + ' state(s)'); }
  } else {
    if (!data.membershipNo) return res.status(400).json({ error: 'A membership number is required.' });
    const byNo = new Map((p.members || []).map(m => [m.membershipNo, m]));
    const prev = byNo.get(data.membershipNo) || {};
    byNo.set(data.membershipNo, { ...prev, membershipNo: data.membershipNo, name: data.name || prev.name || '', status: data.status || prev.status || '', enrolmentDate: data.enrolmentDate || prev.enrolmentDate || '', fellowDate: data.fellowDate || prev.fellowDate || '', cop: data.cop !== undefined ? !!data.cop : !!prev.cop, copDate: data.copDate || prev.copDate || '', isPartner: data.isPartner !== undefined ? !!data.isPartner : (prev.isPartner !== undefined ? !!prev.isPartner : true), linkedUserId: data.linkedUserId || prev.linkedUserId || '', source: 'Member Card' });
    p.members = [...byNo.values()];
    applied.push('member ' + data.membershipNo);
  }
  const partners = (p.members || []).filter(m => m.isPartner && !m.leftDate);
  p.partnersTotal = partners.length || p.partnersTotal;
  p.fcaPartners = partners.filter(m => String(m.status).toUpperCase() === 'FCA').length || p.fcaPartners;
  p.caEmployees = (p.members || []).filter(m => !m.isPartner && !m.leftDate).length || p.caEmployees;
  if (!p.experienceYears && p.constitutionDate) { const d = new Date(p.constitutionDate); if (!isNaN(d)) p.experienceYears = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5)); }
  p.configured = true;
  if (!p.cardImports) p.cardImports = [];
  p.cardImports.unshift({ kind, at: new Date().toISOString(), byName: req.user.name, fields: applied.join(', ') });
  p.cardImports = p.cardImports.slice(0, 20);
  db.firmProfile = p;
  logAudit(db, req, 'updated', 'settings', 'firm-profile', 'Firm profile', (kind === 'firm' ? 'Firm Card' : 'Member Card') + ' imported: ' + applied.join(', '));
  writeDB(db);
  res.json({ ok: true, profile: p, applied });
});

// ── Remove member ──
router.delete('/members/:membershipNo', auth, adminOnly, (req, res) => {
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

module.exports = router;
