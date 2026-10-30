// ═══════════════════════════════════════════════════════════
// routes/leads.routes.js — Business Development Leads
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId } = require('../utils/helpers');
const { auth, partnerOrAdmin } = require('../middleware/auth');

const LEAD_STATUSES = ['Generated POC', 'Contacted POC', 'Fixed Meeting with POC', 'Met with POC', 'Got the Assignment', 'Lost the Assignment'];

// ── GET /api/leads ──────────────────────────────────────────────────────────
router.get('/', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const leads = (db.leads || []).slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  res.json({ leads, statuses: LEAD_STATUSES });
});

// ── POST /api/leads ─────────────────────────────────────────────────────────
router.post('/', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  if (!db.leads) db.leads = [];
  const { name, poc, pocDesignation, status, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Lead name is required.' });
  const st = LEAD_STATUSES.includes(status) ? status : 'Generated POC';
  const now = new Date().toISOString();
  const lead = {
    id: newId(),
    name: String(name).trim(),
    poc: (poc || '').trim(),
    pocDesignation: (pocDesignation || '').trim(),
    status: st,
    createdBy: req.user.id, createdByName: req.user.name,
    createdAt: now, updatedAt: now,
    events: [{ id: newId(), type: 'created', status: st, note: (note || '').trim(), byId: req.user.id, byName: req.user.name, date: now }]
  };
  db.leads.push(lead);
  writeDB(db);
  res.json(lead);
});

// ── PUT /api/leads/:id ──────────────────────────────────────────────────────
router.put('/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const lead = (db.leads || []).find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const { name, poc, pocDesignation } = req.body || {};
  if (name !== undefined) lead.name = String(name).trim() || lead.name;
  if (poc !== undefined) lead.poc = String(poc).trim();
  if (pocDesignation !== undefined) lead.pocDesignation = String(pocDesignation).trim();
  lead.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(lead);
});

// ── POST /api/leads/:id/event (log activity / status change) ────────────────
router.post('/:id/event', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const lead = (db.leads || []).find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  const { status, note, date } = req.body || {};
  const now = new Date().toISOString();
  const evStatus = LEAD_STATUSES.includes(status) ? status : lead.status;
  const ev = {
    id: newId(),
    type: (status && status !== lead.status) ? 'status' : 'note',
    status: evStatus,
    note: (note || '').trim(),
    byId: req.user.id, byName: req.user.name,
    date: (date && !isNaN(new Date(date))) ? new Date(date).toISOString() : now
  };
  if (!lead.events) lead.events = [];
  lead.events.push(ev);
  if (status && LEAD_STATUSES.includes(status)) lead.status = status;
  lead.updatedAt = now;
  writeDB(db);
  res.json(lead);
});

// ── DELETE /api/leads/:id ───────────────────────────────────────────────────
router.delete('/:id', auth, partnerOrAdmin, (req, res) => {
  const db = readDB();
  const before = (db.leads || []).length;
  db.leads = (db.leads || []).filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true, deleted: before - (db.leads || []).length });
});

module.exports = router;
