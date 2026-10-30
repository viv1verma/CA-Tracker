// ═══════════════════════════════════════════════════════════
// routes/auth.routes.js — POST /api/login, GET /api/me
//
// Mount at /api so that /api/login and /api/me resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/auth.routes'));
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const { readDB, writeDB } = require('../db');
const { auth } = require('../middleware/auth');

// ── POST /api/login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const db = readDB();
  const uname = username.trim().toLowerCase();
  const user = db.users.find(u => u.username === uname);
  if (user) {
    const _h = user.passwordHash || user.password || '';
    if (!_h || !await bcrypt.compare(password, _h))
      return res.status(401).json({ error: 'Invalid credentials.' });
    if (!user.passwordHash && user.password) {
      const _i = db.users.findIndex(u => u.id === user.id);
      if (_i > -1) { db.users[_i].passwordHash = user.password; delete db.users[_i].password; writeDB(db); }
    }
    // Single active session per account: bump session counter so older tokens become invalid
    const _ui = db.users.findIndex(u => u.id === user.id);
    const newSess = ((db.users[_ui] && db.users[_ui].sess) || 0) + 1;
    if (_ui > -1) { db.users[_ui].sess = newSess; writeDB(db); }
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)', sess: newSess },
      JWT_SECRET, { expiresIn: '12h' }
    );
    return res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)' } });
  }
  // Client login — match stored credentials, OR fall back to PAN for clients
  // created before logins existed (username = PAN, password = PAN).
  const client = (db.clients || []).find(c => {
    const pan = (c.pan || '').trim().toLowerCase();
    return c.clientUsername === uname || (pan && pan === uname);
  });
  if (client) {
    const pan = (client.pan || '').trim();
    let valid = false;
    if (client.passwordHash) {
      valid = await bcrypt.compare(password, client.passwordHash);
    }
    // PAN fallback: accept the PAN as password (case-insensitive) if it matches
    if (!valid && pan && password.trim().toLowerCase() === pan.toLowerCase()) {
      valid = true;
    }
    if (valid) {
      const tokenUser = client.clientUsername || (client.pan||'').trim().toLowerCase();
      const token = jwt.sign(
        { id: client.id, username: tokenUser, name: client.name, role: 'client', clientId: client.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: client.id, username: tokenUser, name: client.name, role: 'client', clientId: client.id } });
    }
  }
  // ITR client login — username = PAN (uppercase), password = PAN@1010
  const itr = (db.itrParties || []).find(p => (p.pan || '').trim().toUpperCase() === username.trim().toUpperCase());
  if (itr) {
    const expected = (itr.pan || '').trim().toUpperCase() + '@1010';
    if (password.trim() === expected) {
      const token = jwt.sign(
        { id: itr.id, username: itr.pan.toUpperCase(), name: itr.name, role: 'itrclient', itrId: itr.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: itr.id, username: itr.pan.toUpperCase(), name: itr.name, role: 'itrclient', itrId: itr.id } });
    }
  }
  // Group login — one credential for a group of companies
  const group = (db.groups || []).find(g => (g.groupUsername || '').toLowerCase() === uname);
  if (group && group.passwordHash) {
    const ok = await bcrypt.compare(password, group.passwordHash);
    if (ok) {
      const token = jwt.sign(
        { id: group.id, username: group.groupUsername, name: group.name, role: 'client', isGroup: true, groupId: group.id },
        JWT_SECRET, { expiresIn: '12h' }
      );
      return res.json({ token, user: { id: group.id, username: group.groupUsername, name: group.name, role: 'client', isGroup: true, groupId: group.id } });
    }
  }
  return res.status(401).json({ error: 'Invalid credentials.' });
});

// ── GET /api/me ─────────────────────────────────────────────────────────────
router.get('/me', auth, (req, res) => {
  const db = readDB();
  if (req.user.role === 'itrclient') {
    const p = (db.itrParties || []).find(x => x.id === req.user.id);
    if (!p) return res.status(404).json({ error: 'Not found.' });
    return res.json({ id: p.id, username: (p.pan||'').toUpperCase(), name: p.name, role: 'itrclient', itrId: p.id, pan: p.pan, ay: p.ay, type: p.type });
  }
  if (req.user.role === 'client') {
    // Group login: return member companies + combined option
    if (req.user.isGroup) {
      const g = (db.groups || []).find(x => x.id === req.user.groupId);
      if (!g) return res.status(404).json({ error: 'Group not found.' });
      const companies = (db.clients || []).filter(c => c.groupId === g.id)
        .map(c => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const dash = g.dashboards || { tasks: true, billing: true, cashflow: true, debtors: true };
      return res.json({ id: g.id, username: g.groupUsername, name: g.name, role: 'client', isGroup: true, groupId: g.id, companies, dashboards: dash });
    }
    const c = (db.clients || []).find(x => x.id === req.user.id);
    if (!c) return res.status(404).json({ error: 'Client not found.' });
    const dash = c.dashboards || { tasks: true, billing: true, cashflow: true, debtors: true };
    return res.json({ id: c.id, username: c.clientUsername, name: c.name, role: 'client', clientId: c.id, email: c.email || c.contactEmail || '', contact: c.contact || '', dashboards: dash });
  }
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const isItrAdmin = !!(user.itrAdmin || (user.name || '').trim().toLowerCase() === 'annpurna');
  const isHr = !!(user.hrAdmin || (user.name || '').trim().toLowerCase() === 'meenu jha');
  const isPayroll = !!(user.payrollAccess || isHr);
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role, designation: user.designation || '', qualification: user.qualification || 'CA', branch: user.branch || 'Greater Noida (HO)', itrAdmin: isItrAdmin, payrollAccess: isPayroll, hrAdmin: isHr });
});

module.exports = router;
