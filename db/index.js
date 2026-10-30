// ═══════════════════════════════════════════════════════════
// db/index.js — Database read/write operations
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { DATA_DIR, DB_FILE } = require('../config');

// ── Rules cache ──
// The rules cache lives here because writeDB must invalidate it on every write.
// getRules and invalidateRules are exported so middleware/routes can use them.
const { num } = require('../utils/helpers');

const DEFAULT_RULES = {
  // ── Office timing (enforced) ──
  officeIn: '09:30',
  officeOut: '18:30',
  lateGrace: '10:00',
  lunchStart: '13:30',
  lunchEnd: '14:15',
  // ── Attendance (enforced) ──
  fullDayHours: 9,
  fullDayHoursCA: 8,
  halfDayHours: 4.5,
  lateMarksPerHalfDay: 3,
  // ── Weekly off (enforced) ──
  sundayOff: true,
  weekOffSaturdays: [2, 4],
  // ── Leave (enforced) ──
  paidLeavesPerYear: 18,
  joiningCutoffDay: 15,
  carryForwardMax: 0,
  leaveNoticeDays: 3,
  maxConsecutiveLeave: 0,
  sandwichRule: false,
  // ── Compensatory off (enforced) ──
  compOffEnabled: true,
  compOffExpiryDays: 90,
  // ── Notice period (documented) ──
  probationMonths: 6,
  noticeDuringProbation: 15,
  noticeAfterConfirmation: 60,
  // ── Free-text policy ──
  policySections: [],
  updatedAt: '', updatedBy: ''
};

let _rulesCache = null;

function getRules(db) {
  if (db && db.rules) return { ...DEFAULT_RULES, ...db.rules };
  if (!_rulesCache) {
    try { _rulesCache = { ...DEFAULT_RULES, ...((readDB().rules) || {}) }; }
    catch (e) { _rulesCache = { ...DEFAULT_RULES }; }
  }
  return _rulesCache;
}

function invalidateRules() { _rulesCache = null; }

/**
 * Read the entire database from disk. Returns default structure on error.
 */
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch {
    return {
      users: [], clients: [], assignments: [], notifications: [],
      dueDateRequests: [], recurringTemplates: [], reopenRequests: [],
      pushSubscriptions: [], attendance: [], leaves: [],
      salaryConfig: [], siteVisits: []
    };
  }
}

/**
 * Write the entire database to disk.
 * Ensures all expected collections exist. Invalidates the rules cache.
 */
function writeDB(db) {
  invalidateRules(); // any write may change the rules (incl. a full restore) -- never serve a stale copy
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

module.exports = {
  readDB,
  writeDB,
  getRules,
  invalidateRules,
  DEFAULT_RULES
};
