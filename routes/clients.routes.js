// ═══════════════════════════════════════════════════════════
// routes/clients.routes.js — Clients CRUD, Groups, Dashboards, Login Status
//
// Mount at /api so that both /api/clients/* and /api/groups/* resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/clients.routes'));
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { readDB, writeDB } = require('../db');
const { newId, diffFields } = require('../utils/helpers');
const { auth, adminOnly, staffOnly, adminOrItr } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ── GET /api/clients ────────────────────────────────────────────────────────
router.get('/clients', auth, (req, res) => {
  const db = readDB();
  // Never expose password hashes; flag whether login is set up
  const safe = db.clients.map(c => { const { passwordHash, ...rest } = c; return { ...rest, hasLogin: !!c.passwordHash }; });
  res.json(safe);
});

// ── POST /api/clients ───────────────────────────────────────────────────────
router.post('/clients', auth, staffOnly, async (req, res) => {
  const db = readDB();
  const { clientUsername, clientPassword, ...rest } = req.body;
  const client = { ...rest, id: newId(), createdAt: new Date().toISOString() };
  // Default login to PAN (username = PAN, password = PAN) unless explicit values given
  const pan = (rest.pan || '').trim();
  const uname = (clientUsername || pan).toLowerCase().trim();
  const pwd = clientPassword || pan;
  if (uname && pwd) {
    if (db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname))
      return res.status(400).json({ error: 'A login with this username/PAN already exists.' });
    client.clientUsername = uname;
    client.passwordHash = await bcrypt.hash(pwd, 10);
  }
  db.clients.push(client);
  logAudit(db, req, 'created', 'client', client.id, client.name, `PAN: ${client.pan || '—'}`);
  writeDB(db);
  const { passwordHash, ...safe } = client;
  res.json({ ...safe, hasLogin: !!client.passwordHash });
});

// ── PUT /api/clients/:id ────────────────────────────────────────────────────
router.put('/clients/:id', auth, adminOnly, async (req, res) => {
  const db = readDB();
  const i = db.clients.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Client not found.' });
  const _cBefore = { ...db.clients[i] }; // snapshot for the audit trail
  const { clientUsername, clientPassword, ...rest } = req.body;
  db.clients[i] = { ...db.clients[i], ...rest };
  const pan = (db.clients[i].pan || '').trim();
  // Username: explicit value wins, else default to PAN if no login set yet
  if (clientUsername !== undefined || (!db.clients[i].clientUsername && pan)) {
    const uname = ((clientUsername !== undefined ? clientUsername : pan) || '').toLowerCase().trim();
    if (uname && (db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname && c.id !== req.params.id)))
      return res.status(400).json({ error: 'A login with this username/PAN already exists.' });
    db.clients[i].clientUsername = uname || undefined;
  }
  // Password: explicit value wins, else default to PAN if no password set yet
  if (clientPassword) {
    db.clients[i].passwordHash = await bcrypt.hash(clientPassword, 10);
  } else if (!db.clients[i].passwordHash && pan) {
    db.clients[i].passwordHash = await bcrypt.hash(pan, 10);
  }
  const _cChanged = diffFields(_cBefore, db.clients[i], ['name','pan','gstin','contact','email','address','clientUsername','groupId']);
  const _cPw = clientPassword ? (_cChanged ? '; password reset' : 'password reset') : '';
  if (_cChanged || _cPw) logAudit(db, req, 'updated', 'client', db.clients[i].id, db.clients[i].name, (_cChanged || '') + _cPw);
  writeDB(db);
  const { passwordHash, ...safe } = db.clients[i];
  res.json({ ...safe, hasLogin: !!db.clients[i].passwordHash });
});

// ── DELETE /api/clients/:id ─────────────────────────────────────────────────
router.delete('/clients/:id', auth, adminOrItr, (req, res) => {
  const db = readDB();
  const _c = (db.clients || []).find(c => c.id === req.params.id);
  const _n = (db.assignments || []).filter(a => a.clientId === req.params.id).length;
  db.clients = db.clients.filter(c => c.id !== req.params.id);
  db.assignments = db.assignments.filter(a => a.clientId !== req.params.id);
  if (_c) logAudit(db, req, 'deleted', 'client', _c.id, _c.name, `PAN: ${_c.pan || '—'}; also removed ${_n} assignment(s)`);
  writeDB(db);
  res.json({ ok: true });
});

// ── PUT /api/clients/:id/dashboards ─────────────────────────────────────────
// Admin: set which dashboards a client can see
router.put('/clients/:id/dashboards', auth, adminOnly, (req, res) => {
  const db = readDB();
  const i = db.clients.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Client not found.' });
  const d = req.body || {};
  db.clients[i].dashboards = {
    tasks: d.tasks !== false, billing: d.billing !== false,
    cashflow: d.cashflow !== false, debtors: d.debtors !== false
  };
  writeDB(db);
  res.json(db.clients[i].dashboards);
});

// ── GET /api/clients/login-status ───────────────────────────────────────────
// Admin diagnostic: shows login status for all clients (no passwords exposed)
router.get('/clients/login-status', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json((db.clients || []).map(c => ({
    name: c.name,
    hasPan: !!(c.pan && c.pan.trim()),
    pan: c.pan || '(none)',
    hasStoredLogin: !!c.clientUsername,
    hasPassword: !!c.passwordHash,
    canLoginWithPan: !!(c.pan && c.pan.trim()) || (!!c.clientUsername && !!c.passwordHash)
  })));
});

// ── PUT /api/clients/:id/group ──────────────────────────────────────────────
// Assign / unassign a company (client) to a group
router.put('/clients/:id/group', auth, adminOnly, (req, res) => {
  const db = readDB();
  const c = (db.clients || []).find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Company not found.' });
  const gid = req.body.groupId;
  if (gid && !(db.groups || []).find(g => g.id === gid)) return res.status(400).json({ error: 'Group not found.' });
  if (gid) c.groupId = gid; else delete c.groupId;
  writeDB(db);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// Groups (one login for multiple companies)
// ═══════════════════════════════════════════════════════════

// ── GET /api/groups ─────────────────────────────────────────────────────────
router.get('/groups', auth, adminOnly, (req, res) => {
  const db = readDB();
  const groups = (db.groups || []).map(g => ({
    id: g.id, name: g.name, groupUsername: g.groupUsername,
    companies: (db.clients || []).filter(c => c.groupId === g.id).map(c => ({ id: c.id, name: c.name }))
  }));
  res.json(groups);
});

// ── POST /api/groups ────────────────────────────────────────────────────────
router.post('/groups', auth, adminOnly, async (req, res) => {
  const db = readDB();
  if (!db.groups) db.groups = [];
  const name = (req.body.name || '').trim();
  const uname = (req.body.groupUsername || '').toLowerCase().trim();
  const pwd = req.body.groupPassword || '';
  if (!name || !uname || !pwd) return res.status(400).json({ error: 'Group name, username and password are required.' });
  if (db.groups.find(g => (g.groupUsername || '').toLowerCase() === uname) || db.users.find(u => u.username === uname) || db.clients.find(c => c.clientUsername === uname))
    return res.status(400).json({ error: 'This username is already in use.' });
  const group = { id: newId(), name, groupUsername: uname, passwordHash: await bcrypt.hash(pwd, 10), createdAt: new Date().toISOString(), dashboards: { tasks: true, billing: true, cashflow: true, debtors: true } };
  db.groups.push(group);
  writeDB(db);
  res.json({ ok: true, id: group.id, name: group.name });
});

// ── PUT /api/groups/:id ─────────────────────────────────────────────────────
router.put('/groups/:id', auth, adminOnly, async (req, res) => {
  const db = readDB();
  const g = (db.groups || []).find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  if (req.body.name) g.name = req.body.name.trim();
  if (req.body.groupPassword) g.passwordHash = await bcrypt.hash(req.body.groupPassword, 10);
  if (req.body.dashboards) g.dashboards = req.body.dashboards;
  writeDB(db);
  res.json({ ok: true });
});

// ── DELETE /api/groups/:id ───────────────────────────────────────────────────
router.delete('/groups/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  // detach companies, then remove the group
  (db.clients || []).forEach(c => { if (c.groupId === req.params.id) delete c.groupId; });
  db.groups = (db.groups || []).filter(g => g.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
