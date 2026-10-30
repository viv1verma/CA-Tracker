// ═══════════════════════════════════════════════════════════
// routes/recurring.routes.js — Recurring templates, statutory
//   calendar, generation, and cleanup
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId } = require('../utils/helpers');
const { auth, adminOnly, staffOnly } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ═══════════════════════════════════════════════════════════
// STATUTORY DUE-DATE CALENDAR
// Standard Indian compliance deadlines. `months` are 1-12 (the month the work is
// DUE, not the period it covers). Admin applies these to a client and the normal
// recurring engine then auto-generates the tasks each period.
// ═══════════════════════════════════════════════════════════
const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const STATUTORY_CATALOG = [
  // ── GST ──
  { code:'gstr1_m',    name:'GSTR-1 (Monthly)',            category:'GST',     months:ALL_MONTHS,   dueDay:11, freq:'Monthly',   note:'Outward supplies \u2014 11th of the following month' },
  { code:'gstr1_q',    name:'GSTR-1 (QRMP Quarterly)',     category:'GST',     months:[1,4,7,10],   dueDay:13, freq:'Quarterly', note:'QRMP filers \u2014 13th of the month after the quarter' },
  { code:'gstr3b_m',   name:'GSTR-3B (Monthly)',           category:'GST',     months:ALL_MONTHS,   dueDay:20, freq:'Monthly',   note:'Summary return \u2014 20th of the following month' },
  { code:'gstr3b_q',   name:'GSTR-3B (QRMP Quarterly)',    category:'GST',     months:[1,4,7,10],   dueDay:22, freq:'Quarterly', note:'QRMP \u2014 22nd/24th by state category; defaults to 22nd' },
  { code:'pmt06',      name:'PMT-06 Challan (QRMP)',       category:'GST',     months:ALL_MONTHS,   dueDay:25, freq:'Monthly',   note:'Monthly tax payment for QRMP filers \u2014 25th' },
  { code:'cmp08',      name:'CMP-08 (Composition)',        category:'GST',     months:[1,4,7,10],   dueDay:18, freq:'Quarterly', note:'Composition dealers \u2014 18th after the quarter' },
  { code:'gstr7',      name:'GSTR-7 (GST TDS)',            category:'GST',     months:ALL_MONTHS,   dueDay:10, freq:'Monthly',   note:'GST TDS deductors \u2014 10th' },
  { code:'gstr6',      name:'GSTR-6 (ISD)',                category:'GST',     months:ALL_MONTHS,   dueDay:13, freq:'Monthly',   note:'Input Service Distributor \u2014 13th' },
  { code:'gstr4',      name:'GSTR-4 (Composition Annual)', category:'GST',     months:[4],          dueDay:30, freq:'Annually',  note:'Composition annual return \u2014 30 April' },
  { code:'gstr9',      name:'GSTR-9 / 9C (Annual)',        category:'GST',     months:[12],         dueDay:31, freq:'Annually',  note:'GST annual return \u2014 31 December' },
  // ── TDS / TCS ──
  { code:'tds_pay',    name:'TDS / TCS Payment',           category:'TDS',     months:ALL_MONTHS,   dueDay:7,  freq:'Monthly',   note:'Monthly deposit \u2014 7th (March deposit is due 30 April)' },
  { code:'tds_return', name:'TDS Return (24Q/26Q/27Q)',    category:'TDS',     months:[5,7,10,1],   dueDay:31, freq:'Quarterly', note:'Quarterly returns \u2014 31 May / 31 Jul / 31 Oct / 31 Jan' },
  { code:'tcs_return', name:'TCS Return (27EQ)',           category:'TDS',     months:[5,7,10,1],   dueDay:15, freq:'Quarterly', note:'Quarterly TCS returns \u2014 15th' },
  { code:'form16',     name:'Form 16 Issuance',            category:'TDS',     months:[6],          dueDay:15, freq:'Annually',  note:'Salary TDS certificates \u2014 15 June' },
  { code:'form16a',    name:'Form 16A Issuance',           category:'TDS',     months:[8,11,2,6],   dueDay:15, freq:'Quarterly', note:'Non-salary TDS certificates \u2014 15th after each quarter' },
  // ── Income Tax ──
  { code:'adv_tax',    name:'Advance Tax Instalment',      category:'Income Tax', months:[6,9,12,3], dueDay:15, freq:'Quarterly', note:'15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%)' },
  { code:'itr_nonaud', name:'ITR Filing (Non-Audit)',      category:'Income Tax', months:[7],        dueDay:31, freq:'Annually',  note:'Individuals/HUF without audit \u2014 31 July' },
  { code:'itr_audit',  name:'ITR Filing (Audit Case)',     category:'Income Tax', months:[10],       dueDay:31, freq:'Annually',  note:'Audit cases \u2014 31 October' },
  { code:'tax_audit',  name:'Tax Audit Report (3CA/3CD)',  category:'Income Tax', months:[9],        dueDay:30, freq:'Annually',  note:'Tax audit report \u2014 30 September' },
  // ── ROC / MCA ──
  { code:'aoc4',       name:'AOC-4 (Financials)',          category:'ROC',     months:[10],         dueDay:30, freq:'Annually',  note:'Within 30 days of AGM \u2014 typically 30 October' },
  { code:'mgt7',       name:'MGT-7 (Annual Return)',       category:'ROC',     months:[11],         dueDay:29, freq:'Annually',  note:'Within 60 days of AGM \u2014 typically 29 November' },
  { code:'dir3kyc',    name:'DIR-3 KYC',                   category:'ROC',     months:[9],          dueDay:30, freq:'Annually',  note:'Director KYC \u2014 30 September' },
  { code:'dpt3',       name:'DPT-3 (Deposits Return)',     category:'ROC',     months:[6],          dueDay:30, freq:'Annually',  note:'30 June' },
  { code:'llp11',      name:'LLP Form 11 (Annual Return)', category:'ROC',     months:[5],          dueDay:30, freq:'Annually',  note:'LLP annual return \u2014 30 May' },
  { code:'llp8',       name:'LLP Form 8 (Statement)',      category:'ROC',     months:[10],         dueDay:30, freq:'Annually',  note:'LLP statement of account \u2014 30 October' },
  // ── Payroll ──
  { code:'pf_esi',     name:'PF & ESI Payment',            category:'PF/ESI',  months:ALL_MONTHS,   dueDay:15, freq:'Monthly',   note:'Provident Fund & ESI \u2014 15th' },
  { code:'ptax',       name:'Professional Tax (Salaries)', category:'PF/ESI',  months:ALL_MONTHS,   dueDay:10, freq:'Monthly',   note:'Varies by state \u2014 defaults to 10th' }
];

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Returns true if a recurringMonthKey is a valid period for the given frequency */
function periodMatchesFrequency(key, freq) {
  if (!key) return false;
  freq = freq || 'Monthly';
  if (freq === 'Monthly')     return /^\d{4}-\d{2}$/.test(key);
  if (freq === 'Quarterly')   return /^\d{4}-Q[1-4]$/.test(key);
  if (freq === 'Half-Yearly') return /^\d{4}-H[12]$/.test(key);
  if (freq === 'Annually')    return /^\d{4}-ANN$/.test(key);
  return true;
}

/**
 * Generate a single assignment for the given template in the given month.
 * Returns the created assignment object, or null if one already exists / not due.
 */
function generateMonthlyAssignment(db, template, date) {
  const year = date.getFullYear(), month = date.getMonth();
  const freq = template.frequency || 'Monthly';
  let run = false, key = '';
  // `months` (1-12) lets a template run in exact months — used by the statutory
  // calendar. Falls back to the plain frequency behaviour when absent.
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
  const assignment = {
    id: newId(), clientId: template.clientId, memberId: template.memberId,
    memberName: template.memberName, reportingPersonId: template.reportingPersonId,
    reportingPersonName: template.reportingPersonName, workType: template.workType,
    assignmentType: 'recurring', recurringTemplateId: template.id,
    recurringMonthKey: monthKey, frequency: template.frequency || 'Monthly',
    status: 'Pending', priority: template.priority || 'Normal',
    dueDate, originalDueDate: dueDate,
    notes: template.notes ? `${template.notes} \u2014 ${monthName}` : `Auto-generated for ${monthName}`,
    remark: '', completedAt: null, completedOnTime: null, createdAt: new Date().toISOString()
  };
  db.assignments.push(assignment);
  console.log(`\u2705 Recurring: ${template.workType} \u2192 ${template.memberName} \u2014 ${monthKey}`);
  return assignment;
}

/** Run monthly generation for all active templates */
function runMonthlyGeneration() {
  const db = readDB();
  const now = new Date();
  const templates = (db.recurringTemplates || []).filter(t => t.active);
  let count = 0;
  templates.forEach(t => { if (generateMonthlyAssignment(db, t, now)) count++; });
  if (count > 0) { writeDB(db); console.log(`\uD83D\uDD04 Auto-generated ${count} recurring assignments`); }
}

/**
 * Find recurring assignments whose period no longer matches their template's frequency.
 * Only PENDING/incomplete tasks are eligible for removal (completed history is preserved).
 */
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
    let key = a.recurringMonthKey;
    if (!key && a.dueDate) {
      const m = parseInt(a.dueDate.slice(5, 7), 10) - 1; // 0-based month
      const y = a.dueDate.slice(0, 4);
      const freq = t.frequency || 'Monthly';
      if (freq === 'Quarterly')        key = `${y}-Q${Math.floor(m/3)+1}`;
      else if (freq === 'Half-Yearly') key = `${y}-H${m<6?1:2}`;
      else if (freq === 'Annually')    key = `${y}-ANN`;
      else                             key = `${y}-${a.dueDate.slice(5,7)}`;
      if (freq === 'Quarterly' && ![0,3,6,9].includes(m)) return true;
      if (freq === 'Half-Yearly' && ![0,6].includes(m))   return true;
      if (freq === 'Annually' && m !== 3)                 return true;
      return false;
    }
    return !periodMatchesFrequency(key, t.frequency);
  });
}

// ── GET /api/recurring-templates — List templates (role-filtered) ────────────
router.get('/recurring-templates', auth, (req, res) => {
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

// ── POST /api/recurring-templates — Create template ─────────────────────────
router.post('/recurring-templates', auth, (req, res) => {
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

// ── PUT /api/recurring-templates/:id — Update template ──────────────────────
router.put('/recurring-templates/:id', auth, (req, res) => {
  const db = readDB();
  const i = (db.recurringTemplates || []).findIndex(t => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Template not found.' });
  const t = db.recurringTemplates[i];
  if (req.user.role !== 'admin' && t.createdBy !== req.user.id && t.memberId !== req.user.id)
    return res.status(403).json({ error: 'You can only edit templates you created.' });
  const before = { ...t };
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
  // Reconcile every OPEN task against the template's CURRENT values
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
      const member = db.users.find(u => u.id === nt.memberId);
      dispatchNotification(db, 'recurring-reassigned',
        { userId: nt.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
        {
          count: memberMoved,
          workType: nt.workType,
          clientName: cl ? cl.name : '',
          managerName: req.user.name,
          memberName: member ? member.name : ''
        }
      ).catch(() => {});
    } catch (e) { /* non-fatal */ }
  }
  writeDB(db);
  res.json({ ...nt, reassignedCount: moved });
});

// ── DELETE /api/recurring-templates/:id — Delete template ────────────────────
router.delete('/recurring-templates/:id', auth, (req, res) => {
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

// ── POST /api/recurring-templates/:id/generate — Generate for specific month ─
router.post('/recurring-templates/:id/generate', auth, (req, res) => {
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

// ── GET /api/recurring-cleanup — Preview frequency mismatches (admin) ───────
router.get('/recurring-cleanup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const tmap = {}; (db.recurringTemplates || []).forEach(t => { tmap[t.id] = t; });
  const tByAttr = {}; (db.recurringTemplates || []).forEach(t => { tByAttr[t.clientId + '|' + t.workType + '|' + t.memberId] = t; });
  const list = findFrequencyMismatches(db).map(a => {
    const cl = db.clients.find(c => c.id === a.clientId);
    let t = a.recurringTemplateId ? tmap[a.recurringTemplateId] : null;
    if (!t) t = tByAttr[a.clientId + '|' + a.workType + '|' + a.memberId];
    let period = a.recurringMonthKey;
    if (!period && a.dueDate) period = a.dueDate.slice(0, 7);
    return { id: a.id, clientName: cl ? cl.name : '\u2014', workType: a.workType, memberName: a.memberName,
      period: period || '(none)', dueDate: a.dueDate, status: a.status, frequency: t ? t.frequency : '\u2014' };
  });
  res.json(list);
});

// ── POST /api/recurring-cleanup — Delete all pending mismatched tasks (admin) ─
router.post('/recurring-cleanup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const ids = new Set(findFrequencyMismatches(db).map(a => a.id));
  const before = db.assignments.length;
  db.assignments = db.assignments.filter(a => !ids.has(a.id));
  writeDB(db);
  res.json({ ok: true, removed: before - db.assignments.length });
});

// ── GET /api/statutory/catalog — Statutory obligations catalog ───────────────
router.get('/statutory/catalog', auth, staffOnly, (req, res) => {
  res.json({
    catalog: STATUTORY_CATALOG,
    categories: [...new Set(STATUTORY_CATALOG.map(c => c.category))]
  });
});

// ── POST /api/statutory/apply — Apply statutory obligations to clients ───────
router.post('/statutory/apply', auth, staffOnly, (req, res) => {
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
      generateMonthlyAssignment(db, template, now);
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

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = router;
module.exports.generateMonthlyAssignment = generateMonthlyAssignment;
module.exports.runMonthlyGeneration = runMonthlyGeneration;
