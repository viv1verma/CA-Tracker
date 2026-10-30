// ═══════════════════════════════════════════════════════════
// routes/attendance.routes.js — Attendance endpoints
//
// Mount at /api/attendance so that /, /punch-in, /today-all etc. resolve.
// Usage in server.js:  app.use('/api/attendance', require('./routes/attendance.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { OFFICE_IN, OFFICE_OUT, LATE_GRACE, MIN_HOURS } = require('../config');
const { newId, todayStr, timeStr, num, diffFields } = require('../utils/helpers');
const { readDB, writeDB, getRules } = require('../db');
const { auth, payrollAccess, adminOrHr } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ── Helper functions ────────────────────────────────────────────────────────

function calcHours(inT, outT) {
  if (!inT || !outT) return 0;
  const [ih, im] = inT.split(':').map(Number);
  const [oh, om] = outT.split(':').map(Number);
  return Math.max(0, ((oh * 60 + om) - (ih * 60 + im)) / 60);
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

// 2nd and 4th Saturdays are FIXED HOLIDAYS; 1st, 3rd and 5th Saturdays are working days.
// Which Saturdays are weekly offs is a firm rule (default 2nd & 4th)
function isSecondOrFourthSaturday(dateStr, db) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return false;               // Not Saturday
  const nth = Math.ceil(d.getDate() / 7);           // which Saturday of the month
  const list = (getRules(db).weekOffSaturdays || [2, 4]).map(Number);
  return list.includes(nth);
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

// ── Comp-off helpers (used by punch-in/out) ─────────────────────────────────

// Credit a comp-off when someone works on a non-working day. Idempotent per user+date.
function creditCompOff(db, user, dateStr, days) {
  if (!db.compOffs) db.compOffs = [];
  const reason = nonWorkingReason(dateStr, db);
  if (!reason) return null;                                    // it was a normal working day
  const existing = db.compOffs.find(c => c.userId === user.id && c.earnedDate === dateStr);
  if (existing) { existing.days = days; return existing; }     // already credited -- just refresh the value
  const c = {
    id: newId(), userId: user.id, userName: user.name,
    earnedDate: dateStr, days: days, reason: reason,
    status: 'available', grantedBy: 'system',
    createdAt: new Date().toISOString()
  };
  db.compOffs.push(c);
  return c;
}

// ── Monthly attendance report (full day-by-day grid) ────────────────────────

function buildMonthlyAttendance(db, y, m) {
  const yi = parseInt(y), mi = parseInt(m);
  const prefix = `${yi}-${String(mi).padStart(2, '0')}`;
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
    const ds = `${prefix}-${String(d).padStart(2, '0')}`;
    const dt = new Date(ds + 'T00:00:00');
    days.push({ day: d, date: ds, dow: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dt.getDay()], working: isWorkingDay(ds, db), holiday: nonWorkingReason(ds, db) });
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
    return s.slice(0, 2).toUpperCase();
  };
  const rows = members.map(u => {
    const mine = att.filter(a => a.userId === u.id);
    const byDate = {}; mine.forEach(a => { byDate[a.date] = a; });
    let present = 0, absent = 0, half = 0, wfh = 0, sv = 0, paidLeave = 0, leave = 0, late = 0, workingDays = 0;
    const cells = days.map(dy => {
      if (dy.working) workingDays++;
      const a = byDate[dy.date];
      const svName = svMap[u.id + '|' + dy.date];
      if (!a) {
        // No attendance record -- but a site visit may have been logged for this date
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

// ── Routes ──────────────────────────────────────────────────────────────────

// Punch In
router.post('/punch-in', auth, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const _cfg = db.settings || {};
  const sv = req.body && req.body.siteVisit ? req.body.siteVisit : null;
  if (_cfg.mobileOnlyPunch) {
    const ua = req.headers['user-agent'] || '';
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua))
      return res.status(403).json({ error: 'MOBILE_REQUIRED', message: 'Please punch in from your mobile device.' });
  }
  if (_cfg.wifiCheckEnabled && (_cfg.officeIPs || []).length) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
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
router.post('/punch-out', auth, (req, res) => {
  const db = readDB();
  const _cfg = db.settings || {};
  const sv = req.body && req.body.siteVisit ? req.body.siteVisit : null;
  if (_cfg.mobileOnlyPunch) {
    const ua = req.headers['user-agent'] || '';
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua))
      return res.status(403).json({ error: 'MOBILE_REQUIRED', message: 'Please punch out from your mobile device.' });
  }
  if (_cfg.wifiCheckEnabled && (_cfg.officeIPs || []).length) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
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
router.get('/', auth, (req, res) => {
  const db = readDB();
  if (!db.attendance) return res.json([]);
  const { month, year, userId } = req.query;
  let data = db.attendance;
  if (req.user.role !== 'admin') data = data.filter(a => a.userId === req.user.id);
  else if (userId) data = data.filter(a => a.userId === userId);
  if (month && year) data = data.filter(a => a.date.startsWith(`${year}-${String(month).padStart(2, '0')}`));
  else if (year) data = data.filter(a => a.date.startsWith(year));
  res.json(data.sort((a, b) => b.date.localeCompare(a.date)));
});

// Get today's attendance for current user
router.get('/today', auth, (req, res) => {
  const db = readDB();
  const today = todayStr();
  const rec = (db.attendance || []).find(a => a.userId === req.user.id && a.date === today);
  res.json(rec || null);
});

// Admin: manually mark attendance
router.post('/mark', auth, payrollAccess, (req, res) => {
  const db = readDB();
  if (!db.attendance) db.attendance = [];
  const { userId, date, status, punchIn, punchOut, notes, remark } = req.body;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const existing = db.attendance.findIndex(a => a.userId === userId && a.date === date);
  const rec = { id: newId(), userId, userName: user.name, date, status: status || 'Present', punchIn: punchIn || null, punchOut: punchOut || null, workHours: punchIn && punchOut ? parseFloat(calcHours(punchIn, punchOut).toFixed(2)) : 0, notes: notes || '', remark: (remark !== undefined ? remark : (notes || '')), markedByAdmin: true, createdAt: new Date().toISOString() };
  if (existing > -1) db.attendance[existing] = { ...db.attendance[existing], ...rec, id: db.attendance[existing].id };
  else db.attendance.push(rec);
  logAudit(db, req, existing > -1 ? 'updated' : 'created', 'attendance', userId, user.name,
    `${date} marked ${rec.status}${rec.punchIn ? ' in ' + rec.punchIn : ''}${rec.punchOut ? ' out ' + rec.punchOut : ''}`);
  writeDB(db);
  res.json(rec);
});

// Set/update a private remark (hidden comment) on an attendance record. Admin/HR only.
router.put('/remark', auth, payrollAccess, (req, res) => {
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

// Edit punch-in/out, status, remark and recompute hours. Identified by record id OR userId+date.
router.put('/record', auth, adminOrHr, (req, res) => {
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
  const norm = t => { if (t === undefined) return undefined; if (t === null || t === '') return null; const m = String(t).match(/^(\d{1,2}):(\d{2})$/); return m ? (m[1].padStart(2, '0') + ':' + m[2]) : rec.punchIn; };
  if (punchIn !== undefined) rec.punchIn = norm(punchIn);
  if (punchOut !== undefined) rec.punchOut = norm(punchOut);
  if (status !== undefined && status) rec.status = status;
  if (remark !== undefined) rec.remark = String(remark).slice(0, 500);
  // recompute hours + late flag
  rec.workHours = (rec.punchIn && rec.punchOut) ? parseFloat(calcHours(rec.punchIn, rec.punchOut).toFixed(2)) : 0;
  if (rec.punchIn) rec.isLate = rec.punchIn > (getRules(db).lateGrace || LATE_GRACE);
  rec.editedByAdmin = req.user.name;
  rec.editedAt = new Date().toISOString();
  const _aChanged = diffFields(_aBefore, rec, ['punchIn', 'punchOut', 'status', 'remark', 'workHours']);
  logAudit(db, req, 'updated', 'attendance', rec.userId, rec.userName,
    `${rec.date} — ${_aChanged || 'no field change'}`);
  writeDB(db);
  res.json({ ok: true, record: rec });
});

// Delete an attendance record (admin only). By id, or userId+date.
router.delete('/record', auth, adminOrHr, (req, res) => {
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

// Monthly attendance report (JSON)
router.get('/report', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const now = new Date();
  const m = req.query.month || (now.getMonth() + 1);
  const y = req.query.year || now.getFullYear();
  res.json(buildMonthlyAttendance(db, y, m));
});

// Monthly attendance report (Excel)
router.get('/report.xlsx', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const now = new Date();
  const m = req.query.month || (now.getMonth() + 1);
  const y = req.query.year || now.getFullYear();
  const rep = buildMonthlyAttendance(db, y, m);
  const MNAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const XLSX = require('xlsx');
  // Sheet 1: Day-by-day grid
  const header1 = ['Employee', 'Designation', ...rep.days.map(d => `${d.day} ${d.dow}`), 'Present', 'Absent', 'Half', 'WFH', 'Leave', 'Late', 'Working Days'];
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
  grid.push(['Legend:', 'P = Present, L = Late, A = Absent, HD = Half Day, WFH = Work from Home, SV = Site Visit, PL = Paid Leave, LV = Leave, – = Weekly Off']);
  const ws1 = XLSX.utils.aoa_to_sheet(grid);
  // column widths
  ws1['!cols'] = [{ wch: 22 }, { wch: 16 }, ...rep.days.map(() => ({ wch: 5 })), { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 12 }];
  // Sheet 2: Summary
  const header2 = ['Employee', 'Designation', 'Branch', 'Working Days', 'Present', 'Absent', 'Half Day', 'WFH', 'Site Visit', 'Paid Leave', 'Leave', 'Late Marks', 'Present (Equiv.)'];
  const summ = [header2];
  rep.rows.forEach(r => summ.push([r.userName, r.designation, r.branch, r.workingDays, r.present, r.absent, r.halfDay, r.wfh, r.siteVisit, r.paidLeave, r.leave, r.late, r.presentDays]));
  const ws2 = XLSX.utils.aoa_to_sheet(summ);
  ws2['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 7 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 11 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Daily Attendance');
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = `Attendance_${MNAMES[rep.month]}_${rep.year}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Attendance summary (admin/payroll)
router.get('/summary', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const { month, year } = req.query;
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = year || now.getFullYear();
  const prefix = `${y}-${String(m).padStart(2, '0')}`;
  const data = (db.attendance || []).filter(a => a.date.startsWith(prefix));
  const members = db.users.filter(u => isAttendanceMember(u));
  const { getLeaveBalance, getCompOffBalance } = require('./leaves.routes');
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

// Member full attendance history
router.get('/member/:userId', auth, (req, res) => {
  const db = readDB();
  const userId = req.params.userId;
  if (req.user.role !== 'admin' && req.user.id !== userId)
    return res.status(403).json({ error: 'Forbidden.' });
  const att = (db.attendance || []).filter(a => a.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
  const leaves = (db.leaves || []).filter(l => l.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const visits = (db.siteVisits || []).filter(v => v.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
  const user = db.users.find(u => u.id === userId);
  // Monthly summary
  const months = {};
  att.forEach(a => {
    const key = a.date.slice(0, 7);
    if (!months[key]) months[key] = { present: 0, absent: 0, halfDay: 0, wfh: 0, paidLeave: 0, leave: 0, late: 0, totalHours: 0 };
    months[key][a.status === 'Present' ? 'present' : a.status === 'Absent' ? 'absent' : a.status === 'Half Day' ? 'halfDay' : a.status === 'Work from Home' ? 'wfh' : a.status === 'Paid Leave' ? 'paidLeave' : 'leave']++;
    if (a.isLate) months[key].late++;
    months[key].totalHours = parseFloat((months[key].totalHours + (a.workHours || 0)).toFixed(2));
  });
  res.json({ user: user ? { ...user, passwordHash: undefined } : null, attendance: att, leaves, siteVisits: visits, monthlySummary: months });
});

// Today's attendance for all members (admin/payroll)
router.get('/today-all', auth, payrollAccess, (req, res) => {
  const db = readDB();
  const day = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : todayStr();
  // site-visit company lookup for that day
  const svMap = {};
  (db.siteVisits || []).forEach(v => { if (v.date === day && !svMap[v.userId]) svMap[v.userId] = v.clientName || v.siteName || ''; });
  res.json(db.users.filter(u => isAttendanceMember(u)).map(u => {
    const r = (db.attendance || []).find(a => a.userId === u.id && a.date === day);
    const hasSV = !!svMap[u.id];
    let st = r ? ((r.offSite && r.status !== 'Site Visit') ? 'Site Visit' : r.status) : 'Absent';
    if (hasSV && st !== 'Site Visit') st = 'Site Visit';   // logged site visit wins even without a punch record
    return {
      userId: u.id, userName: u.name, designation: u.designation || '', branch: u.branch || '',
      date: day, punchIn: r ? r.punchIn : null, punchOut: r ? r.punchOut : null,
      workHours: r ? r.workHours : 0, status: st, isLate: r ? r.isLate : false, offSite: (r ? !!r.offSite : false) || hasSV,
      remark: r ? (r.remark || '') : '',
      site: (st === 'Site Visit') ? (svMap[u.id] || (r && r.siteName) || '') : ''
    };
  }));
});

// ── Exported helpers (used by other modules) ────────────────────────────────
module.exports = router;
module.exports.isSecondOrFourthSaturday = isSecondOrFourthSaturday;
module.exports.nonWorkingReason = nonWorkingReason;
module.exports.isWorkingDay = isWorkingDay;
module.exports.isAttendanceMember = isAttendanceMember;
