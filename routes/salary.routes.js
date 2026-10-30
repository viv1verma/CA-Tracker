// ═══════════════════════════════════════════════════════════
// routes/salary.routes.js — Salary/payroll endpoints
//
// Covers: /api/salary-config, /api/salary/:userId/:year/:month,
// /api/salary/:userId/:year/:month/email, /api/salary/:year/:month/email-all.
// Mount at /api so all sub-paths resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/salary.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { num } = require('../utils/helpers');
const { readDB, writeDB, getRules } = require('../db');
const { auth, payrollAccess, isPayrollUser } = require('../middleware/auth');
const { getMailInfo, isMailReady } = require('../services/email.service');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ── Imported helpers from sibling routes ─────────────────────────────────────
// These are lazy-loaded to avoid circular dependency issues at startup
let _attendanceHelpers = null;
function attendanceHelpers() {
  if (!_attendanceHelpers) _attendanceHelpers = require('./attendance.routes');
  return _attendanceHelpers;
}
let _leaveHelpers = null;
function leaveHelpers() {
  if (!_leaveHelpers) _leaveHelpers = require('./leaves.routes');
  return _leaveHelpers;
}

// ── Helper functions ────────────────────────────────────────────────────────

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Shared salary computation (used by GET and email endpoints)
function computeSalary(db, userId, year, month) {
  const { isWorkingDay, isAttendanceMember } = attendanceHelpers();
  const { getLeaveBalance } = leaveHelpers();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const att = (db.attendance || []).filter(a => a.userId === userId && a.date.startsWith(prefix));
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  let workingDays = 0, actualPresent = 0, lateCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${prefix}-${String(d).padStart(2, '0')}`;
    if (isWorkingDay(dateStr, db)) workingDays++;
  }
  att.forEach(a => {
    if (['Present', 'Work from Home', 'Site Visit'].includes(a.status) || a.offSite) actualPresent++;
    else if (a.status === 'Half Day') actualPresent += 0.5;
    // Paid leaves (CL/SL/EL + legacy Paid Leave) count as present for salary; LWP / unpaid 'Leave' do NOT
    else if (['Casual Leave', 'Sick Leave', 'Earned Leave', 'Paid Leave'].includes(a.status)) actualPresent++;
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

function salarySlipHtml(s) {
  const inr = n => '\u20B9' + Number(n || 0).toLocaleString('en-IN');
  const row = (l, v, b) => `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb">${l}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;${b ? 'font-weight:700' : ''}">${v}</td></tr>`;
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#16315c;color:#fff;padding:16px 20px">
      <div style="font-size:18px;font-weight:800">GARP &amp; Associates</div>
      <div style="font-size:12px;opacity:.85">Salary Slip \u2014 ${MONTH_NAMES[s.month]} ${s.year}</div>
    </div>
    <div style="padding:16px 20px">
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:12px">
        ${row('Employee', s.userName, true)}
        ${row('Designation', s.designation || '\u2014')}
        ${row('Branch', s.branch || '\u2014')}
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
  const inr = n => 'Rs.' + Number(n || 0).toLocaleString('en-IN');
  return `Salary Slip \u2014 ${MONTH_NAMES[s.month]} ${s.year}\n` +
    `Employee: ${s.userName} (${s.designation || '-'})\n` +
    `Working Days: ${s.workingDays} | Present/Paid: ${s.presentDays} | Absent: ${s.absentDays}\n\n` +
    `Basic ${inr(s.basic)} | HRA ${inr(s.hra)} | Conveyance ${inr(s.conveyance)} | Other ${inr(s.otherAllowance)}\n` +
    `Gross: ${inr(s.grossSalary)}\n` +
    `Deductions \u2014 Absence ${inr(s.absenceDeduction)}, PF ${inr(s.pf)}, ESI ${inr(s.esi)} = ${inr(s.totalDeduction)}\n` +
    `NET PAY: ${inr(s.netPay)}\n\n\u2014 GARP & Associates`;
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Email configuration diagnostic -- tells the UI whether SMTP is set up & verified
router.get('/email-status', auth, payrollAccess, (req, res) => {
  const mailInfo = getMailInfo();
  res.json({
    configured: mailInfo.configured,
    ready: isMailReady(),
    verified: mailInfo.verified,
    user: mailInfo.user ? mailInfo.user.replace(/(.{2}).*(@.*)/, '$1***$2') : '',
    error: mailInfo.error || ''
  });
});

// Salary config — list team members with their salary structure
router.get('/salary-config', auth, payrollAccess, (req, res) => {
  const { isAttendanceMember } = attendanceHelpers();
  const db = readDB();
  const users = db.users.filter(u => isAttendanceMember(u)).map(u => ({
    id: u.id, name: u.name, designation: u.designation, branch: u.branch,
    basicSalary: u.basicSalary || 0, hra: u.hra || 0,
    conveyance: u.conveyance || 0, otherAllowance: u.otherAllowance || 0,
    joiningDate: u.joiningDate
  }));
  res.json(users);
});

// Get salary for a specific user/year/month
router.get('/salary/:userId/:year/:month', auth, (req, res) => {
  const db = readDB();
  const { userId, year, month } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== userId && !isPayrollUser(db, req.user.id, req.user.role))
    return res.status(403).json({ error: 'Forbidden.' });
  const s = computeSalary(db, userId, year, month);
  if (!s) return res.status(404).json({ error: 'User not found.' });
  res.json(s);
});

// Email a salary slip to one employee (admin or payroll user)
router.post('/salary/:userId/:year/:month/email', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const { userId, year, month } = req.params;
  const s = computeSalary(db, userId, year, month);
  if (!s) return res.status(404).json({ error: 'User not found.' });
  const to = (req.body && req.body.email) || s.email;
  if (!to) return res.status(400).json({ error: 'No email address on file for this employee.' });
  dispatchNotification(db, 'salary-slip',
    { email: to },
    { memberName: s.userName, month: MONTH_NAMES[s.month], year: String(s.year) },
    { emailHtmlOverride: salarySlipHtml(s), emailTextOverride: salarySlipText(s), channelOverrides: { email: true } }
  ).then(r => {
    const emailResult = (r.results.email || [])[0];
    if (emailResult && emailResult.skipped) return res.status(503).json({ error: 'Email is not configured on the server (set SMTP_USER / SMTP_PASS).' });
    if (emailResult && !emailResult.ok) return res.status(502).json({ error: emailResult.error || 'Failed to send email.' });
    res.json({ ok: true, sentTo: to });
  }).catch(e => res.status(502).json({ error: e.message || 'Failed to send email.' }));
});

// Email salary slips to ALL members for a month (bulk)
router.post('/salary/:year/:month/email-all', auth, payrollAccess, async (req, res) => {
  const { isAttendanceMember } = attendanceHelpers();
  const db = readDB();
  const { year, month } = req.params;
  const members = db.users.filter(u => isAttendanceMember(u));
  let sent = 0; const failed = [];
  for (const u of members) {
    const s = computeSalary(db, u.id, year, month);
    const to = u.email;
    if (!s || !to) { failed.push({ name: u.name, reason: to ? 'no data' : 'no email' }); continue; }
    const dr = await dispatchNotification(db, 'salary-slip',
      { email: to },
      { memberName: s.userName, month: MONTH_NAMES[s.month], year: String(s.year) },
      { emailHtmlOverride: salarySlipHtml(s), emailTextOverride: salarySlipText(s), channelOverrides: { email: true } }
    );
    const emailResult = (dr.results.email || [])[0];
    if (emailResult && emailResult.ok) sent++; else failed.push({ name: u.name, reason: (emailResult && emailResult.error) || (emailResult && emailResult.skipped ? 'email not configured' : 'send failed') });
  }
  res.json({ ok: true, sent, failed });
});

module.exports = router;
