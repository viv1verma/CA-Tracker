// ═══════════════════════════════════════════════════════════
// routes/users.routes.js — GET/POST /api/users, PUT/DELETE /api/users/:id
//
// Mount at /api/users so that /, /:id resolve correctly.
// Usage in server.js:  app.use('/api/users', require('./routes/users.routes'));
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { readDB, writeDB } = require('../db');
const { newId, diffFields } = require('../utils/helpers');
const { auth, staffOnly, adminItrOrHr, isHrAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ── GET /api/users ──────────────────────────────────────────────────────────
router.get('/users', auth, (req, res) => {
  const db = readDB();
  res.json(db.users.map(u => { const { passwordHash, password, ...safe } = u; return safe; }));
});

// ── POST /api/users ─────────────────────────────────────────────────────────
router.post('/users', auth, staffOnly, async (req, res) => {
  const { name, username, password, role, designation, qualification, branch, joiningDate, dob, anniversary, openingLeave, basicSalary, hra, conveyance, otherAllowance, email, mobile, payrollAccess: pAccess, itrAdmin: iAdmin } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const db = readDB();
  if (db.users.find(u => u.username === username.toLowerCase()))
    return res.status(400).json({ error: 'Username already exists.' });
  const user = {
    id: newId(), name: name.trim(), username: username.toLowerCase().trim(),
    role: (role === 'admin' && req.user.role !== 'admin') ? 'member' : (role || 'member'), designation: designation || '',
    qualification: qualification || 'CA', branch: branch || 'Greater Noida (HO)',
    email: email || '', mobile: mobile || '',
    payrollAccess: req.user.role === 'admin' ? !!pAccess : false,
    itrAdmin: req.user.role === 'admin' ? !!iAdmin : false,
    joiningDate: joiningDate || null, dob: dob || null, anniversary: anniversary || null,
    openingLeave: parseFloat(openingLeave) || 0,
    basicSalary: parseFloat(basicSalary) || 0, hra: parseFloat(hra) || 0,
    conveyance: parseFloat(conveyance) || 0, otherAllowance: parseFloat(otherAllowance) || 0,
    passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString()
  };
  db.users.push(user);
  logAudit(db, req, 'created', 'user', user.id, user.name,
    `role: ${user.role}; designation: ${user.designation || '—'}; branch: ${user.branch || '—'}`);
  writeDB(db);
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

// ── PUT /api/users/:id ──────────────────────────────────────────────────────
router.put('/users/:id', auth, async (req, res) => {
  const db = readDB();
  // HR admins (and admins) can manage any team member; everyone else only themselves
  const canManage = req.user.role === 'admin' || isHrAdmin(db, req.user.id, req.user.role);
  if (!canManage && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden.' });
  const i = db.users.findIndex(u => u.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'User not found.' });
  const _before = { ...db.users[i] }; // snapshot for the audit trail
  const { name, username, password, role, designation, qualification, branch, joiningDate, dob, anniversary, openingLeave, basicSalary, hra, conveyance, otherAllowance } = req.body;
  if (name) db.users[i].name = name.trim();
  if (designation !== undefined && canManage) db.users[i].designation = designation;
  if (qualification !== undefined && canManage) db.users[i].qualification = qualification;
  if (joiningDate !== undefined && canManage) db.users[i].joiningDate = joiningDate;
  if (dob !== undefined) db.users[i].dob = dob;
  if (anniversary !== undefined) db.users[i].anniversary = anniversary;
  if (req.body.email !== undefined) db.users[i].email = req.body.email;
  if (req.body.mobile !== undefined) db.users[i].mobile = req.body.mobile;
  if (req.body.address !== undefined) db.users[i].address = req.body.address;
  if (req.body.bloodGroup !== undefined) db.users[i].bloodGroup = req.body.bloodGroup;
  if (req.body.emergencyName !== undefined) db.users[i].emergencyName = req.body.emergencyName;
  if (req.body.emergencyPhone !== undefined) db.users[i].emergencyPhone = req.body.emergencyPhone;
  if (req.body.emergencyRelation !== undefined) db.users[i].emergencyRelation = req.body.emergencyRelation;
  // Salary, leave & branch fields — ADMIN / HR-ADMIN ONLY (members cannot edit their own pay)
  if (canManage) {
    if (branch !== undefined) db.users[i].branch = branch;
    if (openingLeave !== undefined) db.users[i].openingLeave = parseFloat(openingLeave) || 0;
    if (basicSalary !== undefined) db.users[i].basicSalary = parseFloat(basicSalary) || 0;
    if (hra !== undefined) db.users[i].hra = parseFloat(hra) || 0;
    if (conveyance !== undefined) db.users[i].conveyance = parseFloat(conveyance) || 0;
    if (otherAllowance !== undefined) db.users[i].otherAllowance = parseFloat(otherAllowance) || 0;
  }
  if (username) {
    if (db.users.find(u => u.username === username.toLowerCase() && u.id !== req.params.id))
      return res.status(400).json({ error: 'Username already taken.' });
    db.users[i].username = username.toLowerCase().trim();
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    db.users[i].passwordHash = await bcrypt.hash(password, 10);
  }
  // Role can be changed by managers, but only a true admin may grant the 'admin' role
  if (role && canManage) db.users[i].role = (role === 'admin' && req.user.role !== 'admin') ? db.users[i].role : role;
  // Capability flags stay ADMIN-ONLY (prevents privilege escalation by HR/ITR admins)
  if (req.body.payrollAccess !== undefined && req.user.role === 'admin') db.users[i].payrollAccess = !!req.body.payrollAccess;
  if (req.body.itrAdmin !== undefined && req.user.role === 'admin') db.users[i].itrAdmin = !!req.body.itrAdmin;
  if (req.body.hrAdmin !== undefined && req.user.role === 'admin') db.users[i].hrAdmin = !!req.body.hrAdmin;
  // Audit: record exactly which sensitive fields changed
  const _changed = diffFields(_before, db.users[i], ['name','username','role','designation','qualification','branch','joiningDate',
    'openingLeave','basicSalary','hra','conveyance','otherAllowance','payrollAccess','itrAdmin','hrAdmin']);
  const _pw = password ? (_changed ? '; password reset' : 'password reset') : '';
  if (_changed || _pw) {
    logAudit(db, req, 'updated', 'user', db.users[i].id, db.users[i].name, (_changed || '') + _pw);
  }
  writeDB(db);
  res.json({ id: db.users[i].id, name: db.users[i].name, username: db.users[i].username, role: db.users[i].role, designation: db.users[i].designation || '', qualification: db.users[i].qualification || 'CA' });
});

// ── DELETE /api/users/:id ───────────────────────────────────────────────────
router.delete('/users/:id', auth, adminItrOrHr, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin account.' });
  db.users = db.users.filter(u => u.id !== req.params.id);
  logAudit(db, req, 'deleted', 'user', user.id, user.name,
    `username: ${user.username}; designation: ${user.designation || '—'}`);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
