// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY HOURS ENGINE
// ---------------------------------------------------------------------------
// The firm has moved from a per-DAY hours requirement to a per-WEEK one. Nobody
// is judged on a single day any more; they owe the week a total, and whatever
// they fall short by is charged to leave.
//
// THE RULES, as specified:
//   target       = working days in that week  x  that employee's daily hours
//   actual       = sum of hours actually worked in the week
//   shortfall    = max(0, target - actual)
//   leave        = shortfall / daily hours, ROUNDED TO THE NEAREST HALF DAY
//
// "Working days that week" is deliberate: it uses the same calendar the rest of
// the app uses, so a week containing a holiday or a 2nd/4th Saturday asks for
// less. Nobody is penalised for a week the office was shut.
//
// "Daily hours" is per-employee: it honours the CA/Partner vs staff split AND
// any per-person override in Rules. A senior on 8 hours owes 8 x working days,
// not 9.
//
// WHY THIS IS A SEPARATE MODULE
//   It runs ALONGSIDE the existing daily engine, and computes nothing that is
//   written back. Payroll, the monthly report and the xlsx export are untouched
//   until the numbers have been checked against a real month. A weekly rule that
//   is half a day out is a payroll error, not a display bug.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// Monday-start weeks. ISO convention, and it matches how a firm talks about
// "this week" far better than a Sunday start.
function weekStart(dateStr) {
  let d = new Date(String(dateStr || '') + 'T00:00:00');
  // A bad ?to= parameter reached this and threw "Invalid time value", which
  // would 500 the endpoint. Fall back to today rather than failing the request.
  if (isNaN(d.getTime())) d = new Date();
  const dow = (d.getDay() + 6) % 7;           // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  let d = new Date(String(dateStr || '') + 'T00:00:00');
  if (isNaN(d.getTime())) d = new Date();     // same guard as weekStart
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekLabel(startStr) {
  const s = new Date(startStr + 'T00:00:00'), e = new Date(addDays(startStr, 6) + 'T00:00:00');
  const f = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return f(s) + ' \u2013 ' + f(e);
}

// Nearest half day. 0.24 -> 0, 0.25 -> 0.5, 0.74 -> 0.5, 0.75 -> 1.
function toHalfDays(x) { return Math.round(Number(x || 0) * 2) / 2; }

// ── the calculation for one employee, one week ──────────────────────────────
// deps: { isWorkingDay(dateStr), dailyHoursFor(userId), attendanceFor(userId, dateStr) }
function weekFor(userId, mondayStr, deps) {
  const daily = Number(deps.dailyHoursFor(userId)) || 9;
  const days = [];
  let workingDays = 0, actual = 0, leaveDays = 0, holidayDays = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(mondayStr, i);
    const working = !!deps.isWorkingDay(date);
    const rec = deps.attendanceFor(userId, date) || null;
    const hrs = rec ? (Number(rec.workHours) || 0) : 0;

    // An APPROVED leave day is not a shortfall — the day was already accounted
    // for. It reduces the target rather than counting as hours not worked.
    const onLeave = !!(rec && /leave/i.test(String(rec.status || '')));
    if (working && !onLeave) workingDays++;
    if (working && onLeave) leaveDays++;
    if (!working) holidayDays++;

    actual += hrs;
    days.push({ date, working, onLeave, hours: Math.round(hrs * 100) / 100,
      status: rec ? rec.status || '' : (working ? 'No punch' : 'Week off') });
  }

  const target = Math.round(workingDays * daily * 100) / 100;
  const shortfallHours = Math.max(0, Math.round((target - actual) * 100) / 100);
  const leaveCharged = toHalfDays(shortfallHours / daily);

  return {
    userId, weekStart: mondayStr, weekEnd: addDays(mondayStr, 6), label: weekLabel(mondayStr),
    dailyHours: daily, workingDays, holidayDays, approvedLeaveDays: leaveDays,
    targetHours: target,
    actualHours: Math.round(actual * 100) / 100,
    shortfallHours,
    excessHours: Math.max(0, Math.round((actual - target) * 100) / 100),
    leaveCharged,
    met: shortfallHours <= 0,
    days
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// mountWeekly(app, { auth, adminOrHr, readDB, getRules, fullDayHoursFor,
//                    nonWorkingReason, isAttendanceMember })
// ═══════════════════════════════════════════════════════════════════════════
function mountWeekly(app, deps) {
  const { auth, readDB, fullDayHoursFor, nonWorkingReason } = deps;
  const gate = deps.adminOrHr || function (req, res, next) { next(); };

  function makeDeps(db) {
    const byUser = {};
    (db.attendance || []).forEach(a => {
      if (!byUser[a.userId]) byUser[a.userId] = {};
      byUser[a.userId][a.date] = a;
    });
    return {
      isWorkingDay: d => !nonWorkingReason(d, db),
      dailyHoursFor: u => fullDayHoursFor(db, u),
      attendanceFor: (u, d) => (byUser[u] || {})[d] || null
    };
  }

  // One employee, a span of weeks.
  app.get('/api/attendance/weekly', auth, (req, res) => {
    const db = readDB();
    const userId = String(req.query.userId || req.user.id);
    // Anyone may see their own; only admin/HR may see others'.
    if (userId !== req.user.id && !(req.user.role === 'admin' || (deps.isHr && deps.isHr(req.user)))) {
      return res.status(403).json({ error: 'You can only view your own weekly summary.' });
    }
    const weeks = Math.min(Number(req.query.weeks) || 8, 26);
    const end = String(req.query.to || new Date().toISOString().slice(0, 10));
    const d = makeDeps(db);
    const out = [];
    let cursor = weekStart(end);
    for (let i = 0; i < weeks; i++) {
      out.push(weekFor(userId, cursor, d));
      cursor = addDays(cursor, -7);
    }
    const tot = out.reduce((a, w) => ({
      target: a.target + w.targetHours, actual: a.actual + w.actualHours,
      shortfall: a.shortfall + w.shortfallHours, leave: a.leave + w.leaveCharged
    }), { target: 0, actual: 0, shortfall: 0, leave: 0 });
    res.json({ ok: true, userId, weeks: out, totals: {
      targetHours: Math.round(tot.target * 100) / 100,
      actualHours: Math.round(tot.actual * 100) / 100,
      shortfallHours: Math.round(tot.shortfall * 100) / 100,
      leaveCharged: tot.leave
    } });
  });

  // Every employee, one week \u2014 the view a partner actually wants on a Monday.
  app.get('/api/attendance/weekly-all', auth, gate, (req, res) => {
    const db = readDB();
    const monday = weekStart(String(req.query.week || new Date().toISOString().slice(0, 10)));
    const d = makeDeps(db);
    const members = (db.users || []).filter(u =>
      u.active !== false && (deps.isAttendanceMember ? deps.isAttendanceMember(u) : true));
    const rows = members.map(u => {
      const w = weekFor(u.id, monday, d);
      return Object.assign({ name: u.name, designation: u.designation || '', branch: u.branch || '' }, w);
    }).sort((a, b) => (b.shortfallHours - a.shortfallHours) || a.name.localeCompare(b.name));
    res.json({ ok: true, weekStart: monday, weekEnd: addDays(monday, 6), label: weekLabel(monday),
      count: rows.length, rows,
      summary: {
        met: rows.filter(r => r.met).length,
        short: rows.filter(r => !r.met).length,
        leaveCharged: Math.round(rows.reduce((s, r) => s + r.leaveCharged, 0) * 2) / 2
      } });
  });
}

module.exports = { mountWeekly, weekFor, weekStart, addDays, weekLabel, toHalfDays };
