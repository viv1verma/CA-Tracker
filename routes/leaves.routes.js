// ═══════════════════════════════════════════════════════════
// routes/leaves.routes.js — Leave endpoints (old + new leave-request system)
//
// Covers multiple prefixes: /api/leaves/*, /api/leave-requests/*,
// /api/leave-report*, /api/leave-diagnostic, /api/leave-migrate.
// Mount at /api so all sub-paths resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/leaves.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { newId, num } = require('../utils/helpers');
const { readDB, writeDB, getRules } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ── Constants ───────────────────────────────────────────────────────────────

const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Leave Without Pay', 'Work from Home', 'Half Day', 'Comp Off', 'Casual', 'Sick', 'Earned', 'Unpaid', 'Other'];

// Which leave types are PAID (count toward salary) vs UNPAID
function isPaidLeaveType(t) {
  return ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Casual', 'Sick', 'Earned', 'Paid', 'Comp Off'].includes(t);
}

// ── Leave balance calculation ───────────────────────────────────────────────

function getLeaveBalance(db, userId, year) {
  const R = getRules(db);
  const now = new Date();
  const curYear = year || now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const user = (db.users || []).find(u => u.id === userId);
  const cutoff = num(R.joiningCutoffDay) || 15;

  // Calculate months eligible based on joining date
  let eligibleMonths = curMonth;
  if (user && user.joiningDate) {
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
  const openingLeave = parseFloat(user && user.openingLeave) || 0;

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

// ── Comp-off balance (needed for leave balance endpoint) ────────────────────

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

// ── Leave report builder ────────────────────────────────────────────────────

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

// ── Migration helper ────────────────────────────────────────────────────────

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
    if (moved) { writeDB(db); console.log(`\u{1F334} Leave migration: moved ${moved} old leave record(s) into the approval history.`); }
  } catch (e) { console.error('Leave migration error:', e); }
}

// ════════════════════════════════════════════════════════════════
// LEAVE REQUESTS (new unified system)
// ════════════════════════════════════════════════════════════════

router.get('/leave-requests', auth, (req, res) => {
  const db = readDB();
  const reqs = db.leaveRequests || [];
  if (req.user.role === 'admin') {
    // Admin may filter to a specific member's history (used by the profile view)
    if (req.query.userId) return res.json(reqs.filter(r => r.memberId === req.query.userId));
    return res.json(reqs);
  }
  res.json(reqs.filter(r => r.memberId === req.user.id));
});

router.post('/leave-requests', auth, (req, res) => {
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
  const admins = (db.users || []).filter(u => u.role === 'admin');
  if (admins.length) {
    dispatchNotification(db, 'leave-applied',
      admins.map(ad => ({ userId: ad.id, email: ad.email, mobile: ad.mobile, name: ad.name })),
      {
        memberName: req.user.name,
        leaveType: request.type,
        days,
        fromDate,
        toDate,
        reason: reason || '\u2014'
      }
    ).catch(() => {});
  }
  writeDB(db);
  res.json(request);
});

router.put('/leave-requests/:id', auth, adminOnly, (req, res) => {
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
    `${lr.type} ${lr.fromDate} \u2192 ${lr.toDate} (${lr.days} day${lr.days > 1 ? 's' : ''})${adminNote ? '; note: ' + adminNote : ''}`);
  // Notify the member of the decision
  try {
    const member = (db.users || []).find(u => u.id === lr.memberId);
    dispatchNotification(db, 'leave-decided',
      { userId: lr.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
      {
        memberName: lr.memberName || (member ? member.name : ''),
        leaveType: lr.type,
        fromDate: lr.fromDate,
        toDate: lr.toDate,
        days: lr.days,
        status,
        adminNote: adminNote ? ' Note: ' + adminNote : ''
      }
    ).catch(() => {});
  } catch (e) {}
  writeDB(db);
  res.json(db.leaveRequests[i]);
});

// ── Leave diagnostic & migration ────────────────────────────────────────────

router.get('/leave-diagnostic', auth, adminOnly, (req, res) => {
  const db = readDB();
  const oldLeaves = db.leaves || [];
  const newReqs = db.leaveRequests || [];
  res.json({
    oldStore: { count: oldLeaves.length, sample: oldLeaves.slice(0, 5).map(l => ({ id: l.id, who: l.memberName || l.userName, from: l.fromDate, to: l.toDate, type: l.type, status: l.status })) },
    newStore: { count: newReqs.length, migrated: newReqs.filter(r => r.migratedFromLeaves).length, sample: newReqs.slice(0, 5).map(r => ({ id: r.id, who: r.memberName, from: r.fromDate, to: r.toDate, type: r.type, status: r.status, migrated: !!r.migratedFromLeaves })) }
  });
});

router.post('/leave-migrate', auth, adminOnly, (req, res) => {
  const before = (readDB().leaveRequests || []).length;
  migrateOldLeaves();
  const db = readDB();
  const after = (db.leaveRequests || []).length;
  res.json({ ok: true, movedNow: after - before, totalInNewStore: after, oldStoreCount: (db.leaves || []).length });
});

// ── Leave report ────────────────────────────────────────────────────────────

router.get('/leave-report', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(buildLeaveReport(db, { year: req.query.year }));
});

router.get('/leave-report.xlsx', auth, adminOnly, (req, res) => {
  const db = readDB();
  const rep = buildLeaveReport(db, { year: req.query.year });
  const XLSX = require('xlsx');
  // Summary sheet
  const sHdr = ['Employee', 'Applications', 'Approved', 'Rejected', 'Pending', 'Approved Days', 'Paid Days', 'Unpaid Days'];
  const sAoa = [sHdr];
  rep.summary.forEach(u => sAoa.push([u.name, u.applied, u.approved, u.rejected, u.pending, u.approvedDays, u.paidDays, u.unpaidDays]));
  sAoa.push(['TOTAL', rep.totals.applied, rep.totals.approved, rep.totals.rejected, rep.totals.pending, rep.totals.approvedDays, rep.totals.paidDays, rep.totals.unpaidDays]);
  const ws1 = XLSX.utils.aoa_to_sheet(sAoa);
  ws1['!cols'] = [{ wch: 24 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 11 }, { wch: 12 }];
  // Detail sheet
  const dHdr = ['Employee', 'Type', 'Paid/Unpaid', 'From', 'To', 'Days', 'Status', 'Reason', 'Applied On', 'Admin Note'];
  const dAoa = [dHdr];
  rep.detail.forEach(r => dAoa.push([
    r.memberName, r.type, isPaidLeaveType(r.type) ? 'Paid' : 'Unpaid', r.fromDate, r.toDate, r.days,
    r.status, r.reason || '', r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '', r.adminNote || ''
  ]));
  const ws2 = XLSX.utils.aoa_to_sheet(dAoa);
  ws2['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 11 }, { wch: 40 }, { wch: 13 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
  XLSX.utils.book_append_sheet(wb, ws2, 'All Applications');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="Leave_Report_${req.query.year || 'all'}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ════════════════════════════════════════════════════════════════
// OLD LEAVES SYSTEM (db.leaves — kept for backward compat)
// ════════════════════════════════════════════════════════════════

// Apply for leave (old system)
router.post('/leaves', auth, (req, res) => {
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

// Get leaves (old system)
router.get('/leaves', auth, (req, res) => {
  const db = readDB();
  if (!db.leaves) return res.json([]);
  if (req.user.role === 'admin') return res.json([...db.leaves].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  res.json(db.leaves.filter(l => l.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Approve/reject leave (old system, admin only)
router.put('/leaves/:id', auth, adminOnly, (req, res) => {
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
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
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
router.post('/leaves/adjust', auth, adminOnly, (req, res) => {
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
router.get('/leaves/balance', auth, (req, res) => {
  const db = readDB();
  const userId = req.query.userId || req.user.id;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const bal = getLeaveBalance(db, userId, year);
  bal.compOff = getCompOffBalance(db, userId);
  res.json(bal);
});

// ── Exported helpers (used by other modules) ────────────────────────────────
module.exports = router;
module.exports.getLeaveBalance = getLeaveBalance;
module.exports.getCompOffBalance = getCompOffBalance;
module.exports.migrateOldLeaves = migrateOldLeaves;
