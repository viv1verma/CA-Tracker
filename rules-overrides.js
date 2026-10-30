// ═══════════════════════════════════════════════════════════════════════════
// PER-EMPLOYEE RULE OVERRIDES
// ---------------------------------------------------------------------------
// db.rules holds the firm-wide handbook. This module layers a per-person
// exception on top, so one senior can be on 8 hours while the office is on 9,
// or one employee can carry 24 paid leaves instead of 18, WITHOUT forking the
// policy or editing the global rule.
//
// RESOLUTION ORDER (narrowest wins):
//     DEFAULT_RULES  <  db.rules (firm)  <  db.ruleOverrides[userId] (person)
//
// WHY A SEPARATE MAP, NOT FIELDS ON THE USER:
//   - An override is an HR exception with a who/when/why. Keeping it out of the
//     user object means it can be listed, audited and revoked as one thing, and
//     a user edit can never silently clobber a leave entitlement.
//   - Absence of a key means "follow the firm rule" — distinct from a stored 0.
//     A field set on the user record can't express that difference cleanly.
//
// ALLOWLIST, DELIBERATELY:
//   Only the keys below can be overridden. Never spread arbitrary request body
//   into the rules object — that is how someone sets `policySections` or
//   `updatedBy` through the override endpoint.
//
// NOT OVERRIDABLE ON PURPOSE:
//   sundayOff / weekOffSaturdays — the working calendar is shared. Per-person
//   week-offs would need every attendance report, payroll run and holiday
//   calculation to become person-aware. That is a real feature, not a rule
//   tweak; do it deliberately or not at all.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// kind: 'num' | 'time' | 'bool'.  min/max are inclusive guards.
const OVERRIDABLE = {
  // ── Hours ──
  fullDayHours:        { kind: 'num',  label: 'Full-day hours',            min: 1,  max: 16, unit: 'h' },
  halfDayHours:        { kind: 'num',  label: 'Half-day hours',            min: 0,  max: 12, unit: 'h' },
  // ── Timing ──
  officeIn:            { kind: 'time', label: 'Office in-time' },
  officeOut:           { kind: 'time', label: 'Office out-time' },
  lateGrace:           { kind: 'time', label: 'Late grace (punch after = late)' },
  lateMarksPerHalfDay: { kind: 'num',  label: 'Late marks per half-day cut', min: 0, max: 31 },
  // ── Leave ──
  paidLeavesPerYear:   { kind: 'num',  label: 'Paid leaves per year',      min: 0,  max: 60, unit: 'days' },
  carryForwardMax:     { kind: 'num',  label: 'Carry-forward cap',         min: 0,  max: 60, unit: 'days' },
  leaveNoticeDays:     { kind: 'num',  label: 'Leave notice required',     min: 0,  max: 90, unit: 'days' },
  maxConsecutiveLeave: { kind: 'num',  label: 'Max consecutive leave (0 = no cap)', min: 0, max: 90, unit: 'days' },
  joiningCutoffDay:    { kind: 'num',  label: 'Accrual cut-off day of month', min: 1, max: 28 },
  // ── Work from home ──
  wfhPerMonth:         { kind: 'num',  label: 'Work From Home days / month (0 = not allowed, blank = unlimited)', min: 0, max: 31, unit: 'days' },
  wfhNeedsApproval:    { kind: 'bool', label: 'WFH needs admin approval' },
  // ── Comp off ──
  compOffEnabled:      { kind: 'bool', label: 'Compensatory off allowed' },
  compOffExpiryDays:   { kind: 'num',  label: 'Comp-off expiry',           min: 0,  max: 730, unit: 'days' },
  // ── Notice period ──
  probationMonths:        { kind: 'num', label: 'Probation',               min: 0, max: 36, unit: 'months' },
  noticeDuringProbation:  { kind: 'num', label: 'Notice during probation', min: 0, max: 180, unit: 'days' },
  noticeAfterConfirmation:{ kind: 'num', label: 'Notice after confirmation', min: 0, max: 365, unit: 'days' }
};

// New firm-level defaults this module introduces. Merged in by effectiveRulesFor
// so an un-migrated db.json behaves sanely: WFH stays approval-gated and uncapped,
// exactly as it does today.
// Fallback only — these now live in server.js DEFAULT_RULES, so this matters
// solely for an un-migrated db.json. Firm standard is NO work from home.
const RULE_ADDITIONS = {
  wfhPerMonth: 0,             // 0 => not allowed; null/'' => unlimited
  wfhNeedsApproval: true
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function coerce(key, raw) {
  const spec = OVERRIDABLE[key];
  if (!spec) return { error: 'Not an overridable rule: ' + key };
  // Empty string / null clears the override — "follow the firm rule".
  if (raw === null || raw === '' || raw === undefined) return { clear: true };
  if (spec.kind === 'bool') return { value: !!raw };
  if (spec.kind === 'time') {
    const t = String(raw).trim();
    if (!TIME_RE.test(t)) return { error: spec.label + ': use 24-hour HH:MM' };
    return { value: t };
  }
  const n = Number(raw);
  if (!isFinite(n)) return { error: spec.label + ': must be a number' };
  if (spec.min !== undefined && n < spec.min) return { error: `${spec.label}: minimum ${spec.min}` };
  if (spec.max !== undefined && n > spec.max) return { error: `${spec.label}: maximum ${spec.max}` };
  return { value: n };
}

function getOverrides(db) {
  return (db && db.ruleOverrides) || {};
}
function overrideFor(db, userId) {
  const o = getOverrides(db)[userId];
  return (o && o.values) || {};
}

// The one function everything else should call.
//   effectiveRulesFor(db, userId, getRules)  ->  merged rule object
// getRules is injected rather than imported so this module stays decoupled from
// server.js's module scope and remains unit-testable.
function effectiveRulesFor(db, userId, getRules) {
  const firm = { ...RULE_ADDITIONS, ...getRules(db) };
  if (!userId) return firm;
  return { ...firm, ...overrideFor(db, userId) };
}

// ── WFH quota ───────────────────────────────────────────────────────────────
// Counts WFH days already taken in the calendar month of `dateStr`. A rejected
// request does NOT consume quota — the employee didn't get the day.
function wfhUsedInMonth(db, userId, dateStr) {
  const ym = String(dateStr || '').slice(0, 7);
  if (!ym) return 0;
  return ((db && db.attendance) || []).filter(a =>
    a.userId === userId &&
    String(a.date || '').slice(0, 7) === ym &&
    a.wfh && a.wfhStatus !== 'Rejected'
  ).length;
}

// Returns null if the WFH day is allowed, else a { error, message } to send back.
// `dateStr` is the day being claimed; excludeDate lets a re-punch on the same
// day not count itself.
function checkWfhQuota(db, userId, dateStr, getRules) {
  const R = effectiveRulesFor(db, userId, getRules);
  const cap = R.wfhPerMonth;
  if (cap === null || cap === undefined || cap === '') return null;    // unlimited
  const n = Number(cap);
  if (!isFinite(n)) return null;
  if (n <= 0) {
    return { error: 'WFH_NOT_ALLOWED', message: 'Work From Home is not enabled for you. Please speak to admin.' };
  }
  // Don't let today's own record count against today's request
  const used = ((db && db.attendance) || []).filter(a =>
    a.userId === userId &&
    String(a.date || '').slice(0, 7) === String(dateStr).slice(0, 7) &&
    a.date !== dateStr &&
    a.wfh && a.wfhStatus !== 'Rejected'
  ).length;
  if (used >= n) {
    return {
      error: 'WFH_QUOTA_EXHAUSTED',
      message: `You have used all ${n} Work From Home day(s) allowed this month. Punch in from office or log a site visit.`
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes.  mountRuleOverrides(app, { auth, adminOnly, readDB, writeDB,
//                                    getRules, invalidateRules, logAudit,
//                                    getLeaveBalance })
// ═══════════════════════════════════════════════════════════════════════════
function mountRuleOverrides(app, deps) {
  const { auth, adminOnly, readDB, writeDB, getRules } = deps;
  const invalidateRules = deps.invalidateRules || function () {};
  const logAudit = deps.logAudit || function () {};

  function publicUser(u) {
    return {
      id: u.id, name: u.name, designation: u.designation || '',
      qualification: u.qualification || '', branch: u.branch || '',
      role: u.role, active: u.active !== false
    };
  }

  // Schema for the UI to render the form without hardcoding field lists twice.
  app.get('/api/rule-overrides/schema', auth, adminOnly, (req, res) => {
    res.json({
      fields: Object.keys(OVERRIDABLE).map(k => ({ key: k, ...OVERRIDABLE[k] })),
      notOverridable: ['sundayOff', 'weekOffSaturdays', 'sandwichRule', 'policySections'],
      note: 'Blank = follow the firm rule. The working calendar (Sundays / 2nd & 4th Saturdays) is firm-wide.'
    });
  });

  // Everyone with an override, plus the firm baseline, for the admin list view.
  app.get('/api/rule-overrides', auth, adminOnly, (req, res) => {
    const db = readDB();
    const ov = getOverrides(db);
    const firm = { ...RULE_ADDITIONS, ...getRules(db) };
    const rows = (db.users || [])
      .filter(u => u.active !== false)
      .map(u => {
        const rec = ov[u.id];
        const values = (rec && rec.values) || {};
        return {
          user: publicUser(u),
          count: Object.keys(values).length,
          values,
          effective: { ...firm, ...values },
          setBy: rec ? rec.setByName || '' : '',
          setAt: rec ? rec.setAt || '' : '',
          reason: rec ? rec.reason || '' : ''
        };
      })
      .sort((a, b) => (b.count - a.count) || a.user.name.localeCompare(b.user.name));
    res.json({ firm, overridableKeys: Object.keys(OVERRIDABLE), rows });
  });

  // One employee's resolved rules — used by the edit sheet.
  app.get('/api/rule-overrides/:userId', auth, adminOnly, (req, res) => {
    const db = readDB();
    const u = (db.users || []).find(x => x.id === req.params.userId);
    if (!u) return res.status(404).json({ error: 'Employee not found.' });
    const firm = { ...RULE_ADDITIONS, ...getRules(db) };
    const rec = getOverrides(db)[u.id] || {};
    const values = rec.values || {};
    res.json({
      user: publicUser(u), firm, values,
      effective: { ...firm, ...values },
      setBy: rec.setByName || '', setAt: rec.setAt || '', reason: rec.reason || '',
      wfhUsedThisMonth: wfhUsedInMonth(db, u.id, new Date().toISOString().slice(0, 10)),
      history: (rec.history || []).slice(-20).reverse()
    });
  });

  // Set / clear override fields. Body: { values:{key:val|null}, reason:'' }
  // A null/'' value CLEARS that key (back to the firm rule) rather than storing 0.
  app.put('/api/rule-overrides/:userId', auth, adminOnly, (req, res) => {
    const db = readDB();
    const u = (db.users || []).find(x => x.id === req.params.userId);
    if (!u) return res.status(404).json({ error: 'Employee not found.' });

    const incoming = (req.body && req.body.values) || {};
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 400);

    if (!db.ruleOverrides) db.ruleOverrides = {};
    const rec = db.ruleOverrides[u.id] || { values: {}, history: [] };
    const before = { ...rec.values };
    const errors = [];
    const changes = [];

    Object.keys(incoming).forEach(k => {
      if (!OVERRIDABLE[k]) { errors.push('Unknown rule: ' + k); return; }
      const r = coerce(k, incoming[k]);
      if (r.error) { errors.push(r.error); return; }
      const old = rec.values[k];
      if (r.clear) {
        if (old !== undefined) { delete rec.values[k]; changes.push(`${OVERRIDABLE[k].label}: ${old} → firm default`); }
      } else if (old !== r.value) {
        rec.values[k] = r.value;
        changes.push(`${OVERRIDABLE[k].label}: ${old === undefined ? 'firm default' : old} → ${r.value}`);
      }
    });

    if (errors.length) return res.status(400).json({ error: errors.join(' · ') });

    // Cross-field sanity: a half-day floor above the full-day bar is unworkable.
    const eff = { ...RULE_ADDITIONS, ...getRules(db), ...rec.values };
    if (Number(eff.halfDayHours) >= Number(eff.fullDayHours)) {
      rec.values = before;   // roll back, don't persist a broken policy
      return res.status(400).json({ error: `Half-day hours (${eff.halfDayHours}) must be below full-day hours (${eff.fullDayHours}).` });
    }

    if (!changes.length) return res.json({ ok: true, unchanged: true, values: rec.values });

    const now = new Date().toISOString();
    rec.setBy = req.user.id; rec.setByName = req.user.name; rec.setAt = now; rec.reason = reason;
    if (!Array.isArray(rec.history)) rec.history = [];
    rec.history.push({ at: now, byName: req.user.name, reason, changes });
    if (rec.history.length > 100) rec.history = rec.history.slice(-100);

    // No keys left => drop the record entirely, so the list view stays honest.
    if (!Object.keys(rec.values).length) delete db.ruleOverrides[u.id];
    else db.ruleOverrides[u.id] = rec;

    logAudit(db, req, 'updated', 'user', u.id, u.name,
      'rule override — ' + changes.join('; ') + (reason ? ' (' + reason + ')' : ''));
    writeDB(db);
    invalidateRules();
    res.json({ ok: true, values: rec.values, changes });
  });

  // Reset an employee to the firm rules entirely.
  app.delete('/api/rule-overrides/:userId', auth, adminOnly, (req, res) => {
    const db = readDB();
    const u = (db.users || []).find(x => x.id === req.params.userId);
    if (!u) return res.status(404).json({ error: 'Employee not found.' });
    const had = getOverrides(db)[u.id];
    if (!had) return res.json({ ok: true, cleared: 0 });
    delete db.ruleOverrides[u.id];
    logAudit(db, req, 'deleted', 'user', u.id, u.name, 'all rule overrides removed — back on firm rules');
    writeDB(db);
    invalidateRules();
    res.json({ ok: true, cleared: Object.keys((had.values) || {}).length });
  });

  // Any staff member can see the rules that actually apply to THEM, and how much
  // WFH they have left. Read-only — this is what the punch screen consults.
  app.get('/api/my-rules', auth, (req, res) => {
    const db = readDB();
    const eff = effectiveRulesFor(db, req.user.id, getRules);
    const firm = { ...RULE_ADDITIONS, ...getRules(db) };
    const differs = Object.keys(OVERRIDABLE).filter(k => String(eff[k]) !== String(firm[k]));
    const cap = eff.wfhPerMonth;
    const capN = (cap === null || cap === undefined || cap === '') ? null : Number(cap);
    const used = wfhUsedInMonth(db, req.user.id, new Date().toISOString().slice(0, 10));
    res.json({
      effective: eff,
      personalised: differs,           // so the UI can flag "this differs from the handbook"
      wfh: {
        allowed: capN === null ? null : capN,   // null = unlimited
        used,
        left: capN === null ? null : Math.max(0, capN - used),
        needsApproval: eff.wfhNeedsApproval !== false,
        blocked: capN !== null && capN <= 0
      }
    });
  });
}

module.exports = {
  mountRuleOverrides,
  OVERRIDABLE, RULE_ADDITIONS,
  effectiveRulesFor, overrideFor, getOverrides,
  wfhUsedInMonth, checkWfhQuota, coerce
};
