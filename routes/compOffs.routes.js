// ═══════════════════════════════════════════════════════════
// routes/compOffs.routes.js — Compensatory off endpoints
//
// Mount at /api/comp-offs so that /, /:id resolve correctly.
// Usage in server.js:  app.use('/api/comp-offs', require('./routes/compOffs.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { newId } = require('../utils/helpers');
const { readDB, writeDB } = require('../db');
const { auth, adminOnly, isPayrollUser } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ── Helper functions ────────────────────────────────────────────────────────

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

// ── Routes ──────────────────────────────────────────────────────────────────

// List comp-offs -- own by default; admin/payroll can request all
router.get('/', auth, (req, res) => {
  const db = readDB();
  const all = req.query.all === '1';
  const canSeeAll = req.user.role === 'admin' || isPayrollUser(db, req.user.id, req.user.role);
  let list = db.compOffs || [];
  if (!(all && canSeeAll)) list = list.filter(c => c.userId === req.user.id);
  list = list.slice().sort((a, b) => String(b.earnedDate).localeCompare(String(a.earnedDate)));
  const userId = (all && canSeeAll) ? null : req.user.id;
  res.json({ compOffs: list, balance: userId ? getCompOffBalance(db, userId) : null });
});

// Admin grants a comp-off manually
router.post('/', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.compOffs) db.compOffs = [];
  const { userId, earnedDate, days, reason } = req.body || {};
  const u = (db.users || []).find(x => x.id === userId);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (!earnedDate || !/^\d{4}-\d{2}-\d{2}$/.test(earnedDate)) return res.status(400).json({ error: 'A valid date is required.' });
  const d = parseFloat(days) || 1;
  const c = {
    id: newId(), userId: u.id, userName: u.name,
    earnedDate, days: d, reason: (reason || 'Granted by admin').trim(),
    status: 'available', grantedBy: req.user.name,
    createdAt: new Date().toISOString()
  };
  db.compOffs.push(c);
  logAudit(db, req, 'created', 'comp-off', u.id, u.name, `${d} day granted for ${earnedDate} — ${c.reason}`);
  writeDB(db);
  res.json(c);
});

// Admin revokes / deletes a comp-off
router.delete('/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = (db.compOffs || []).length;
  const _c = (db.compOffs || []).find(c => c.id === req.params.id);
  db.compOffs = (db.compOffs || []).filter(c => c.id !== req.params.id);
  if (_c) logAudit(db, req, 'deleted', 'comp-off', _c.userId, _c.userName, `${_c.days} day earned ${_c.earnedDate} (${_c.reason || '—'}) revoked`);
  writeDB(db);
  res.json({ ok: true, deleted: before - db.compOffs.length });
});

module.exports = router;
