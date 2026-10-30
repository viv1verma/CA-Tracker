// ═══════════════════════════════════════════════════════════
// middleware/auth.js — Authentication & authorization middleware
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const { JWT_SECRET, IDLE_LIMIT_MS } = require('../config');
const { readDB } = require('../db');

// ── Server-side idle session expiry ──
// The JWT already carries an absolute 12h expiry. This adds an IDLE expiry so a
// token stops working once the user actually stops using the app. Last-seen is
// held in memory (single process); after a restart a token is simply treated as
// freshly seen rather than rejected.
const _lastSeen = new Map();

// Drop stale entries every 10 min so the map can't grow without bound
setInterval(() => {
  const cutoff = Date.now() - IDLE_LIMIT_MS;
  for (const [k, v] of _lastSeen) if (v < cutoff) _lastSeen.delete(k);
}, 10 * 60 * 1000).unref?.();

/**
 * JWT verification + idle check + single-session enforcement
 */
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized.' });
  let payload;
  try { payload = jwt.verify(h.slice(7), JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
  // Idle check. Background polling sends X-Background:1 and must NOT keep a session alive.
  const _tok = h.slice(7);
  const _now = Date.now();
  const _seen = _lastSeen.get(_tok);
  if (_seen !== undefined && (_now - _seen) > IDLE_LIMIT_MS) {
    _lastSeen.delete(_tok);
    return res.status(401).json({ error: 'SESSION_IDLE', message: 'Session expired after 5 minutes of inactivity. Please log in again.' });
  }
  if (req.headers['x-background'] !== '1') _lastSeen.set(_tok, _now);
  else if (_seen === undefined) _lastSeen.set(_tok, _now); // first sight after a restart
  // Single-session enforcement for team/admin accounts
  if (payload.sess != null) {
    const db = readDB();
    const u = (db.users || []).find(x => x.id === payload.id);
    if (u && (u.sess || 0) !== payload.sess) {
      return res.status(401).json({ error: 'SESSION_SUPERSEDED', message: 'You have been logged out because this account was opened on another device.' });
    }
  }
  req.user = payload;
  next();
}

/**
 * Admin-only middleware
 */
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

/**
 * ITR-admin: full admin OR a team user flagged itrAdmin (e.g. Annpurna)
 */
function itrAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  const u = (db.users || []).find(x => x.id === req.user.id);
  if (u && (u.itrAdmin || (u.name || '').trim().toLowerCase() === 'annpurna')) return next();
  return res.status(403).json({ error: 'ITR admin access required.' });
}

/**
 * Check if a user is an ITR admin (helper, not middleware)
 */
function isItrAdminUser(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.itrAdmin || (u.name || '').trim().toLowerCase() === 'annpurna'));
}

/**
 * Admin or ITR-admin middleware
 */
function adminOrItr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isItrAdminUser(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Admin or ITR-admin access required.' });
}

/**
 * Any internal staff member (excludes external client / itr-client logins)
 */
function staffOnly(req, res, next) {
  if (req.user.role === 'client' || req.user.role === 'itrclient')
    return res.status(403).json({ error: 'Not allowed for client accounts.' });
  return next();
}

/**
 * Check if a user has payroll access (helper, not middleware)
 */
function isPayrollUser(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.payrollAccess || u.hrAdmin || (u.name || '').trim().toLowerCase() === 'meenu jha'));
}

/**
 * Payroll access middleware
 */
function payrollAccess(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isPayrollUser(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Payroll access required.' });
}

/**
 * Check if a user is an HR admin (helper, not middleware)
 */
function isHrAdmin(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.hrAdmin || (u.name || '').trim().toLowerCase() === 'meenu jha'));
}

/**
 * Admin or HR-admin middleware
 */
function adminOrHr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isHrAdmin(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Team / Salary / Attendance admin access required.' });
}

/**
 * User management: admin, ITR-admin, or HR-admin
 */
function adminItrOrHr(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isItrAdminUser(db, req.user.id, req.user.role) || isHrAdmin(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Not allowed.' });
}

/**
 * Check if a user is a partner (helper, not middleware)
 */
function isPartnerUser(db, userId, role) {
  if (role === 'admin') return true;
  const u = (db.users || []).find(x => x.id === userId);
  return !!(u && (u.designation || '').toLowerCase().includes('partner'));
}

/**
 * Partner or admin middleware
 */
function partnerOrAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  const db = readDB();
  if (isPartnerUser(db, req.user.id, req.user.role)) return next();
  return res.status(403).json({ error: 'Business Development access is limited to partners and admins.' });
}

/**
 * Resolve which client IDs a client/group request may access.
 * Returns { ids:[...], single:<id|null> }.
 */
function clientScope(req, db) {
  if (req.user.isGroup) {
    const members = (db.clients || []).filter(c => c.groupId === req.user.groupId).map(c => c.id);
    const sel = req.query.company;
    if (sel && sel !== 'all' && members.includes(sel)) return { ids: [sel], single: sel };
    return { ids: members, single: null }; // combined
  }
  return { ids: [req.user.clientId], single: req.user.clientId };
}

module.exports = {
  auth,
  adminOnly,
  itrAdmin,
  isItrAdminUser,
  adminOrItr,
  staffOnly,
  payrollAccess,
  isPayrollUser,
  adminOrHr,
  isHrAdmin,
  adminItrOrHr,
  partnerOrAdmin,
  isPartnerUser,
  clientScope,
  _lastSeen
};
