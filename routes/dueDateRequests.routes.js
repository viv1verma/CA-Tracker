// ═══════════════════════════════════════════════════════════
// routes/dueDateRequests.routes.js — Due date change request endpoints
//
// Covers: /api/due-date-requests, /api/due-date-requests/:id,
// /api/due-date-log (separate path).
// Mount at /api so all sub-paths resolve correctly.
// Usage in server.js:  app.use('/api', require('./routes/dueDateRequests.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { newId } = require('../utils/helpers');
const { readDB, writeDB } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { logDueDateChange } = require('../services/audit.service');

// ── Routes ──────────────────────────────────────────────────────────────────

// List due-date change requests (admin sees all, members see own)
router.get('/due-date-requests', auth, (req, res) => {
  const db = readDB();
  const reqs = db.dueDateRequests || [];
  if (req.user.role === 'admin') return res.json(reqs);
  res.json(reqs.filter(r => r.requestedBy === req.user.id || r.memberId === req.user.id));
});

// Submit a due-date change request
router.post('/due-date-requests', auth, (req, res) => {
  const { assignmentId, requestedDueDate, reason } = req.body;
  if (!assignmentId || !requestedDueDate) return res.status(400).json({ error: 'Assignment and new due date required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id) return res.status(403).json({ error: 'Only Reporting Person can request due date changes.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const request = {
    id: newId(), assignmentId,
    clientName: client ? client.name : '\u2014', workType: assignment.workType,
    memberName: assignment.memberName, memberId: assignment.memberId,
    currentDueDate: assignment.dueDate, requestedDueDate,
    reason: reason || '', requestedBy: req.user.id, requestedByName: req.user.name,
    status: 'pending', adminNote: '',
    createdAt: new Date().toISOString(), resolvedAt: null
  };
  if (!db.dueDateRequests) db.dueDateRequests = [];
  db.dueDateRequests.push(request);
  writeDB(db);
  res.json(request);
});

// Approve/reject a due-date change request (admin only)
router.put('/due-date-requests/:id', auth, adminOnly, (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const db = readDB();
  const i = (db.dueDateRequests || []).findIndex(r => r.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Request not found.' });
  db.dueDateRequests[i].status = status;
  db.dueDateRequests[i].adminNote = adminNote || '';
  db.dueDateRequests[i].resolvedAt = new Date().toISOString();
  if (status === 'approved') {
    const ai = db.assignments.findIndex(a => a.id === db.dueDateRequests[i].assignmentId);
    if (ai > -1) {
      logDueDateChange(db, db.assignments[ai], db.assignments[ai].dueDate, db.dueDateRequests[i].requestedDueDate, req.user, 'request-approved');
      db.assignments[ai].dueDate = db.dueDateRequests[i].requestedDueDate;
    }
  }
  writeDB(db);
  res.json(db.dueDateRequests[i]);
});

// Due-date change audit log (admin only), newest first
router.get('/due-date-log', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json([...(db.dueDateChangeLog || [])].sort((a, b) => new Date(b.date) - new Date(a.date)));
});

module.exports = router;
