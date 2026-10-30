// ═══════════════════════════════════════════════════════════
// routes/reopenRequests.routes.js — Reopen request endpoints
//
// Mount at /api/reopen-requests so that /, /:id resolve correctly.
// Usage in server.js:  app.use('/api/reopen-requests', require('./routes/reopenRequests.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { newId } = require('../utils/helpers');
const { readDB, writeDB } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

// ── Routes ──────────────────────────────────────────────────────────────────

// List reopen requests (admin sees all, members see own)
router.get('/', auth, (req, res) => {
  const db = readDB();
  const reqs = db.reopenRequests || [];
  if (req.user.role === 'admin') return res.json(reqs);
  res.json(reqs.filter(r => r.requestedBy === req.user.id || r.memberId === req.user.id));
});

// Submit a reopen request
router.post('/', auth, (req, res) => {
  const { assignmentId, reason } = req.body;
  if (!assignmentId) return res.status(400).json({ error: 'Assignment ID required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (assignment.status !== 'Completed') return res.status(400).json({ error: 'Assignment is not completed.' });
  // Only reporting manager can request reopen
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id)
    return res.status(403).json({ error: 'Only the Reporting Manager can request to reopen.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const request = {
    id: newId(), assignmentId,
    clientName: client ? client.name : '\u2014', workType: assignment.workType,
    memberName: assignment.memberName, memberId: assignment.memberId,
    requestedBy: req.user.id, requestedByName: req.user.name,
    reason: reason || '', status: 'pending', adminNote: '',
    createdAt: new Date().toISOString(), resolvedAt: null
  };
  if (!db.reopenRequests) db.reopenRequests = [];
  db.reopenRequests.push(request);
  writeDB(db);
  res.json(request);
});

// Approve/reject a reopen request (admin only)
router.put('/:id', auth, adminOnly, (req, res) => {
  const { status, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const db = readDB();
  const i = (db.reopenRequests || []).findIndex(r => r.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Request not found.' });
  db.reopenRequests[i].status = status;
  db.reopenRequests[i].adminNote = adminNote || '';
  db.reopenRequests[i].resolvedAt = new Date().toISOString();
  if (status === 'approved') {
    const ai = db.assignments.findIndex(a => a.id === db.reopenRequests[i].assignmentId);
    if (ai > -1) {
      db.assignments[ai].status = 'In Progress';
      db.assignments[ai].completedAt = null;
      db.assignments[ai].completedOnTime = null;
      db.assignments[ai].completionPct = db.assignments[ai].completionPct || 0;
    }
  }
  writeDB(db);
  res.json(db.reopenRequests[i]);
});

module.exports = router;
