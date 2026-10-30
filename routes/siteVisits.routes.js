// ═══════════════════════════════════════════════════════════
// routes/siteVisits.routes.js — Site visit endpoints
//
// Mount at /api/site-visits so that /, resolve correctly.
// Usage in server.js:  app.use('/api/site-visits', require('./routes/siteVisits.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { newId, todayStr, timeStr } = require('../utils/helpers');
const { readDB, writeDB } = require('../db');
const { auth } = require('../middleware/auth');

// ── Routes ──────────────────────────────────────────────────────────────────

// Log a site visit
router.post('/', auth, (req, res) => {
  const db = readDB();
  if (!db.siteVisits) db.siteVisits = [];
  const { date, siteName, clientId, purpose, checkIn, checkOut, notes } = req.body;
  if (!siteName) return res.status(400).json({ error: 'Site name required.' });
  const client = clientId ? db.clients.find(c => c.id === clientId) : null;
  const visit = {
    id: newId(), userId: req.user.id, userName: req.user.name,
    date: date || todayStr(), siteName, clientName: client ? client.name : siteName,
    clientId: clientId || null, purpose: purpose || '', checkIn: checkIn || timeStr(),
    checkOut: checkOut || null, notes: notes || '', createdAt: new Date().toISOString()
  };
  db.siteVisits.push(visit);
  // Also reflect in attendance: update existing record OR create one if none exists for that date
  if (!db.attendance) db.attendance = [];
  const attIdx = db.attendance.findIndex(a => a.userId === req.user.id && a.date === visit.date);
  if (attIdx > -1) {
    db.attendance[attIdx].status = 'Site Visit';
    db.attendance[attIdx].offSite = true;
    db.attendance[attIdx].siteName = siteName;
  } else {
    db.attendance.push({
      id: newId(), userId: req.user.id, userName: req.user.name, date: visit.date,
      punchIn: visit.checkIn || null, punchOut: visit.checkOut || null, workHours: 0,
      status: 'Site Visit', offSite: true, siteName, isLate: false,
      createdAt: new Date().toISOString()
    });
  }
  writeDB(db);
  res.json(visit);
});

// List site visits (admin sees all, member sees own)
router.get('/', auth, (req, res) => {
  const db = readDB();
  const visits = (db.siteVisits || []);
  if (req.user.role === 'admin') return res.json(visits.sort((a, b) => b.date.localeCompare(a.date)));
  res.json(visits.filter(v => v.userId === req.user.id).sort((a, b) => b.date.localeCompare(a.date)));
});

module.exports = router;
