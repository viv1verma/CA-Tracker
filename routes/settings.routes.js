// ═══════════════════════════════════════════════════════════
// routes/settings.routes.js — Settings, Rules, Performance, Monthly Report
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB, getRules, invalidateRules, DEFAULT_RULES } = require('../db');
const { num, diffFields } = require('../utils/helpers');
const { logAudit } = require('../services/audit.service');
const { auth, adminOnly } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════

// ── GET /api/settings ───────────────────────────────────────────────────────
router.get('/settings', auth, (req, res) => {
  const db = readDB();
  res.json(db.settings || {});
});

// ── PUT /api/settings ───────────────────────────────────────────────────────
router.put('/settings', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = readDB();
  const _sBefore = { ...(db.settings || {}) };
  db.settings = { ...(db.settings || {}), ...req.body };
  const _sChanged = diffFields(_sBefore, db.settings, Object.keys(req.body || {}));
  if (_sChanged) logAudit(db, req, 'updated', 'settings', 'office', 'Office settings', _sChanged);
  writeDB(db);
  res.json(db.settings);
});

// ═══════════════════════════════════════════════════════════
// Rules
// ═══════════════════════════════════════════════════════════

// ── GET /api/rules ──────────────────────────────────────────────────────────
router.get('/rules', auth, (req, res) => {
  const R = getRules(readDB());
  res.json({ ...R, canEdit: req.user.role === 'admin' });
});

// ── PUT /api/rules ──────────────────────────────────────────────────────────
router.put('/rules', auth, adminOnly, (req, res) => {
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
// My IP (for WiFi Lock config)
// ═══════════════════════════════════════════════════════════
router.get('/my-ip', auth, (req, res) => {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  res.json({
    detectedIp: xff[0] || req.socket.remoteAddress || '',
    forwardedChain: xff,
    remoteAddress: req.socket.remoteAddress || ''
  });
});

// ═══════════════════════════════════════════════════════════
// Performance
// ═══════════════════════════════════════════════════════════
router.get('/performance', auth, adminOnly, (req, res) => {
  const db = readDB();
  const performance = db.users.filter(u => u.role === 'member').map(m => {
    const myA = db.assignments.filter(a => a.memberId === m.id);
    const completed = myA.filter(a => a.status === 'Completed');
    const onTime = completed.filter(a => a.completedOnTime === true);
    const overdue = myA.filter(a => a.dueDate && new Date(a.dueDate + 'T23:59:59') < new Date() && a.status !== 'Completed');
    return {
      memberId: m.id, memberName: m.name, designation: m.designation || '—',
      total: myA.length, completed: completed.length, completedOnTime: onTime.length,
      completedLate: completed.length - onTime.length,
      pending: myA.filter(a => a.status === 'Pending').length,
      inProgress: myA.filter(a => ['In Progress', 'Under Review'].includes(a.status)).length,
      overdue: overdue.length,
      performancePct: myA.length ? Math.round((onTime.length / myA.length) * 100) : 0,
      assignments: myA.map(a => {
        const cl = db.clients.find(c => c.id === a.clientId);
        return {
          clientName: cl ? cl.name : '—', workType: a.workType,
          assignmentType: a.assignmentType || 'onetime', status: a.status,
          priority: a.priority, dueDate: a.dueDate,
          originalDueDate: a.originalDueDate || a.dueDate,
          completedAt: a.completedAt, completedOnTime: a.completedOnTime,
          remark: a.remark || ''
        };
      })
    };
  });
  res.json(performance);
});

// ═══════════════════════════════════════════════════════════
// Monthly Activity Report
// ═══════════════════════════════════════════════════════════
router.get('/monthly-report', auth, adminOnly, (req, res) => {
  const db = readDB();
  const { month, year } = req.query;
  const now = new Date();
  const rYear = parseInt(year) || now.getFullYear();
  const rMonth = parseInt(month) || (now.getMonth() + 1);
  const monthKey = `${rYear}-${String(rMonth).padStart(2, '0')}`;
  const monthStart = new Date(rYear, rMonth - 1, 1);
  const monthEnd = new Date(rYear, rMonth, 0, 23, 59, 59);

  const report = db.users.filter(u => u.role === 'member').map(m => {
    const myA = db.assignments.filter(a => a.memberId === m.id);
    const daysInMonth = new Date(rYear, rMonth, 0).getDate();
    const assignments = myA.map(a => {
      const cl = db.clients.find(c => c.id === a.clientId);
      const log = (a.activityLog || []).filter(l => {
        const d = new Date(l.date);
        return d >= monthStart && d <= monthEnd;
      }).sort((x, y) => new Date(x.date) - new Date(y.date));
      const assignedDate = new Date(a.createdAt);
      const daysSinceAssigned = Math.floor((now - assignedDate) / (1000 * 60 * 60 * 24));
      const backwardUpdates = log.filter(l => l.isBackward);
      return {
        assignmentId: a.id, clientName: cl ? cl.name : '—', workType: a.workType,
        assignmentType: a.assignmentType || 'onetime', status: a.status,
        currentPct: a.completionPct || 0, dueDate: a.dueDate, createdAt: a.createdAt,
        daysSinceAssigned, activityLog: log,
        backwardUpdates: backwardUpdates.length, totalUpdates: log.length
      };
    });
    const dayWise = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(rYear, rMonth - 1, d, 0, 0, 0);
      const dayEnd = new Date(rYear, rMonth - 1, d, 23, 59, 59);
      const dayUpdates = [];
      myA.forEach(a => {
        const cl = db.clients.find(c => c.id === a.clientId);
        const logs = (a.activityLog || []).filter(l => { const ld = new Date(l.date); return ld >= dayStart && ld <= dayEnd; });
        logs.forEach(l => dayUpdates.push({
          clientName: cl ? cl.name : '—', workType: a.workType,
          status: l.status, completionPct: l.completionPct,
          prevPct: l.prevPct, remark: l.remark, isBackward: l.isBackward, time: l.date
        }));
      });
      if (dayUpdates.length > 0) dayWise.push({ day: d, date: `${rYear}-${String(rMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`, updates: dayUpdates });
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

module.exports = router;
