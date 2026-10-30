// ═══════════════════════════════════════════════════════════
// jobs/scheduler.js — All scheduled/background tasks
// ═══════════════════════════════════════════════════════════
// Extracted from server.js — runs recurring generation, birthday/anniversary
// celebrations, stale-remark checks, attendance reminders, tender auto-sync,
// site-visit backfill, and old-leave migration.
//
// Usage: require('./jobs/scheduler').startJobs()  after the server is listening.
// ═══════════════════════════════════════════════════════════

const { ATTENDANCE_CUTOFF } = require('../config');
const { readDB, writeDB } = require('../db');
const { newId, todayStr, timeStr } = require('../utils/helpers');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// Import canonical helpers from route modules (avoid duplication)
const { isWorkingDay, isAttendanceMember } = require('../routes/attendance.routes');
const { generateMonthlyAssignment, runMonthlyGeneration } = require('../routes/recurring.routes');
const { migrateOldLeaves } = require('../routes/leaves.routes');

// ═══════════════════════════════════════════════════════════
// 2. Birthday & anniversary celebration check
// ═══════════════════════════════════════════════════════════
async function runCelebrationCheck() {
  try {
    const db = readDB();
    const today = todayStr();
    const todayMMDD = today.slice(5);
    if (!db.sentCelebrations) db.sentCelebrations = [];
    db.sentCelebrations = db.sentCelebrations.filter(k => k.endsWith(today));
    let changed = false;
    const allUsers = (db.users || []).map(u => ({ userId: u.id, email: u.email, mobile: u.mobile, name: u.name }));
    for (const user of (db.users || []).filter(u => u.role === 'member')) {
      if (user.dob && user.dob.slice(5) === todayMMDD) {
        const key = 'birthday-' + user.id + '-' + today;
        if (!db.sentCelebrations.includes(key)) {
          await dispatchNotification(db, 'birthday', allUsers, { name: user.name }).catch(() => {});
          db.sentCelebrations.push(key); changed = true;
        }
      }
      if (user.anniversary && user.anniversary.slice(5) === todayMMDD) {
        const key = 'anniv-' + user.id + '-' + today;
        if (!db.sentCelebrations.includes(key)) {
          await dispatchNotification(db, 'anniversary', allUsers, { name: user.name }).catch(() => {});
          db.sentCelebrations.push(key); changed = true;
        }
      }
    }
    if (changed) writeDB(db);
  } catch (e) { console.error('Celebration check error:', e); }
}

// ═══════════════════════════════════════════════════════════
// 3. Stale-remark check
// ═══════════════════════════════════════════════════════════
function runStaleRemarkCheck() {
  const db = readDB();
  const now = new Date();
  const today = todayStr();
  if (!db.staleRemarkLog) db.staleRemarkLog = [];
  db.staleRemarkLog = db.staleRemarkLog.filter(k => k.endsWith(today));
  let changed = false;
  (db.assignments || []).forEach(a => {
    if (!a.memberId) return;
    if (a.status === 'Completed' || a.status === 'Hold') return;
    const log = a.activityLog || [];
    const lastDateStr = log.length ? log[log.length - 1].date : a.createdAt;
    if (!lastDateStr) return;
    const last = new Date(lastDateStr);
    const days = Math.floor((now - last) / 864e5);
    if (days >= 2) {
      const key = 'stale-' + a.id + '-' + today;
      if (!db.staleRemarkLog.includes(key)) {
        const cl = (db.clients || []).find(c => c.id === a.clientId);
        const member = (db.users || []).find(u => u.id === a.memberId);
        dispatchNotification(db, 'stale-remark',
          { userId: a.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
          {
            days,
            clientName: cl ? cl.name : '\u2014',
            workType: a.workType,
            memberName: member ? member.name : ''
          },
          { assignmentId: a.id, clientName: cl ? cl.name : '\u2014', workType: a.workType }
        ).catch(() => {});
        db.staleRemarkLog.push(key);
        changed = true;
      }
    }
  });
  if (changed) writeDB(db);
}

// ═══════════════════════════════════════════════════════════
// 4. Attendance reminder
// ═══════════════════════════════════════════════════════════
function runAttendanceReminder() {
  try {
    const db = readDB();
    const today = todayStr();
    if (!isWorkingDay(today, db)) return;
    const now = timeStr();
    if (now < ATTENDANCE_CUTOFF) return;
    if (!db.sentAttnReminders) db.sentAttnReminders = [];
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
      dispatchNotification(db, 'attendance-individual',
        { userId: u.id, email: u.email, mobile: u.mobile, name: u.name },
        { cutoffTime: ATTENDANCE_CUTOFF, date: today, memberName: u.name }
      ).catch(() => {});
      db.sentAttnReminders.push(key); changed = true;
    }
    if (unmarked.length) {
      const rollupKey = 'attn-admin-' + today;
      if (!db.sentAttnReminders.includes(rollupKey)) {
        const names = unmarked.map(u => u.name).join(', ');
        const admins = (db.users || []).filter(u => u.role === 'admin' || u.payrollAccess || (u.name || '').trim().toLowerCase() === 'meenu jha');
        dispatchNotification(db, 'attendance-admin',
          admins.map(ad => ({ userId: ad.id, email: ad.email, mobile: ad.mobile, name: ad.name })),
          { count: unmarked.length, cutoffTime: ATTENDANCE_CUTOFF, names, date: today }
        ).catch(() => {});
        db.sentAttnReminders.push(rollupKey); changed = true;
      }
    }
    if (changed) writeDB(db);
  } catch (e) { console.error('Attendance reminder error:', e); }
}

// ═══════════════════════════════════════════════════════════
// 5. Site-visit attendance backfill (one-time on startup)
// ═══════════════════════════════════════════════════════════
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
        if (!a.offSite || a.status !== 'Site Visit') { a.offSite = true; a.status = 'Site Visit'; if (!a.siteName) a.siteName = v.clientName || v.siteName || ''; updated++; }
      } else {
        db.attendance.push({ id: newId(), userId: v.userId, userName: v.userName || '', date: v.date, punchIn: v.checkIn || null, punchOut: v.checkOut || null, workHours: 0, status: 'Site Visit', offSite: true, siteName: v.clientName || v.siteName || '', isLate: false, backfilled: true, createdAt: new Date().toISOString() });
        added++;
      }
    }
    if (added || updated) { writeDB(db); console.log(`🗺  Site-visit backfill: ${added} attendance records added, ${updated} updated.`); }
  } catch (e) { console.error('Site-visit backfill error:', e); }
}

// migrateOldLeaves imported from routes/leaves.routes.js

// ═══════════════════════════════════════════════════════════
// 7. Tender auto-sync (hourly)
// ═══════════════════════════════════════════════════════════
let _tenderSyncRef = null;

function startTenderSync() {
  // The sync function lives in tenders.routes.js to keep all tender logic together
  let runTenderSync;
  try {
    runTenderSync = require('../routes/tenders.routes').runTenderSync;
  } catch (e) {
    console.log('Tender sync not available (route not loaded)');
    return;
  }
  // Every hour
  _tenderSyncRef = setInterval(() => { runTenderSync('hourly'); }, 60 * 60 * 1000);
  // And shortly after boot
  setTimeout(() => { runTenderSync('startup'); }, 90 * 1000);
}

// ═══════════════════════════════════════════════════════════
// 8. Monthly generation scheduler (precise — fires on the 1st)
// ═══════════════════════════════════════════════════════════
function scheduleMonthlyRun() {
  const MAX_DELAY = 2147483647; // Node's max setTimeout (~24.8 days)
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0);
  const delay = next - now;
  if (delay > MAX_DELAY) {
    setTimeout(scheduleMonthlyRun, MAX_DELAY);
  } else {
    setTimeout(() => { runMonthlyGeneration(); scheduleMonthlyRun(); }, delay);
    console.log(`⏰ Next monthly run: ${next.toLocaleDateString('en-IN')}`);
  }
}

// ═══════════════════════════════════════════════════════════
// startJobs() — call after the server is listening
// ═══════════════════════════════════════════════════════════
function startJobs() {
  // Run monthly generation immediately on boot
  runMonthlyGeneration();

  // Schedule monthly run on the 1st of each month
  scheduleMonthlyRun();

  // Celebration check: every hour, but each event sends only once/day
  setInterval(async () => { await runCelebrationCheck(); }, 3600000);

  // Stale-remark reminders: hourly, once/day per task after 2 idle days
  setInterval(() => { try { runStaleRemarkCheck(); } catch (e) { console.error('Stale remark check error:', e); } }, 3600000);
  setTimeout(() => { try { runStaleRemarkCheck(); } catch (e) {} }, 15000);

  // Attendance reminders: every 5 minutes
  setInterval(runAttendanceReminder, 5 * 60 * 1000);
  setTimeout(runAttendanceReminder, 20000);

  // Tender auto-sync: hourly + 90s after boot
  startTenderSync();

  // One-time startup tasks
  setTimeout(backfillSiteVisitAttendance, 8000);
  setTimeout(migrateOldLeaves, 9000);
}

module.exports = { startJobs };
