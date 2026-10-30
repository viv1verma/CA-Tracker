// ═══════════════════════════════════════════════════════════
// routes/assignments.routes.js — Assignment CRUD, approval,
//   client portal, recurring report
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId } = require('../utils/helpers');
const { auth, clientScope } = require('../middleware/auth');
const { logDueDateChange } = require('../services/audit.service');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ── Helper ───────────────────────────────────────────────────────────────────
/**
 * A single generated recurring task can be handed to someone else for one period
 * only (e.g. cover while the usual assignee is on leave). Flag it so a later
 * template save doesn't pull it back to the template's assignee. Setting it back
 * to the template's assignee clears the flag.
 */
function markRecurringOverride(db, a, newMemberId) {
  if (!a || a.assignmentType !== 'recurring' || !newMemberId) return;
  const tpl = (db.recurringTemplates || []).find(t => t.id === a.recurringTemplateId);
  if (!tpl || !tpl.memberId) return;
  if (newMemberId !== tpl.memberId) a.assigneeOverridden = true;
  else delete a.assigneeOverridden;
}

// ── GET /api/assignments — List assignments (role-filtered, enriched) ────────
router.get('/assignments', auth, (req, res) => {
  const db = readDB();
  let result;
  if (req.user.role === 'admin') {
    result = db.assignments;
  } else {
    result = db.assignments.filter(a =>
      a.memberId === req.user.id ||
      a.reportingPersonId === req.user.id ||
      a.subAssignedBy === req.user.id ||
      a.parentAssigneeId === req.user.id ||
      (a.isSubAssignment && a.subAssignedByName === req.user.name)
    );
  }
  // Enrich recurring tasks with their template's frequency (for display)
  const _tmap = {}; (db.recurringTemplates || []).forEach(t => { _tmap[t.id] = t; });
  const _tByAttr = {}; (db.recurringTemplates || []).forEach(t => { _tByAttr[t.clientId + '|' + t.workType + '|' + t.memberId] = t; });
  const _amap = {}; (db.assignments || []).forEach(x => { _amap[x.id] = x; });
  result = result.map(a => {
    const base = { ...a, status: a.status || 'Pending' };
    if (a.assignmentType === 'recurring' && !base.frequency) {
      let t = a.recurringTemplateId ? _tmap[a.recurringTemplateId] : null;
      if (!t) t = _tByAttr[a.clientId + '|' + a.workType + '|' + a.memberId];
      if (t) base.frequency = t.frequency || 'Monthly';
    }
    // Attach a read-only summary of the parent to sub-tasks
    if (a.isSubAssignment && a.parentAssignmentId) {
      const p = _amap[a.parentAssignmentId];
      if (p) {
        base.parent = {
          id: p.id, workType: p.workType, notes: p.notes || '',
          dueDate: p.dueDate, priority: p.priority || 'Normal', status: p.status || 'Pending',
          clientId: p.clientId, assigneeName: p.memberName || '',
          reportingPersonName: p.reportingPersonName || '',
          remark: p.remark || '', completionPct: p.completionPct || 0,
          assignmentType: p.assignmentType || 'onetime',
          comments: (p.comments || []).map(c => ({ authorName: c.authorName || c.author || '', role: c.role, text: c.text, date: c.date }))
        };
      }
    }
    return base;
  });
  res.json(result);
});

// ── POST /api/assignments — Create assignment ───────────────────────────────
router.post('/assignments', auth, (req, res) => {
  const db = readDB();
  if (req.body.parentAssignmentId) {
    const parent = db.assignments.find(a => a.id === req.body.parentAssignmentId);
    if (!parent) return res.status(404).json({ error: 'Parent assignment not found.' });
    if (req.user.role !== 'admin' && parent.memberId !== req.user.id && parent.subAssignedBy !== req.user.id)
      return res.status(403).json({ error: 'Only the primary assignee can create sub-assignments.' });
  }
  const isAdmin = req.user.role === 'admin';
  const a = {
    ...req.body, id: newId(),
    assignmentType: req.body.assignmentType || 'onetime',
    isSubAssignment: !!req.body.parentAssignmentId,
    subAssignedBy: req.body.parentAssignmentId ? req.user.id : (req.body.subAssignedBy || null),
    subAssignedByName: req.body.parentAssignmentId ? req.user.name : (req.body.subAssignedByName || null),
    reportingPersonId: req.body.reportingPersonId || (!isAdmin && req.body.memberId !== req.user.id ? req.user.id : null),
    reportingPersonName: req.body.reportingPersonName || (!isAdmin && req.body.memberId !== req.user.id ? req.user.name : null),
    createdAt: new Date().toISOString(),
    originalDueDate: req.body.dueDate,
    completedAt: null, completedOnTime: null, completionPct: 0, activityLog: []
  };
  db.assignments.push(a);

  // Notify the assigned member (in-app + push)
  const client = db.clients.find(c => c.id === a.clientId);
  const assignerName = req.user.name;
  writeDB(db);
  if (a.memberId && a.memberId !== req.user.id) {
    const member = db.users.find(u => u.id === a.memberId);
    dispatchNotification(db, 'new-assignment',
      { userId: a.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
      {
        assignmentLabel: a.isSubAssignment ? 'New Sub-Task' : 'New Assignment',
        assignerName,
        clientName: (client && client.name) || 'Client',
        workType: a.workType,
        dueDate: a.dueDate || '',
        dueDateSuffix: a.dueDate ? ' . Due ' + a.dueDate : '',
        memberName: member ? member.name : ''
      },
      { assignmentId: a.id, clientName: (client && client.name) || '', workType: a.workType }
    ).catch(() => {});
    writeDB(db);
  }
  res.json(a);
});

// ── PUT /api/assignments/:id — Update assignment ────────────────────────────
router.put('/assignments/:id', auth, (req, res) => {
  const db = readDB();
  const i = db.assignments.findIndex(a => a.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Assignment not found.' });
  const a = db.assignments[i];
  const isAdmin = req.user.role === 'admin';
  // Creator = sub-assigner OR reporting person (member who assigned the task)
  const isCreator = a.subAssignedBy === req.user.id || a.reportingPersonId === req.user.id;
  const isOwnTask = a.memberId === req.user.id;

  if (isAdmin) {
    const { status, completedAt, completedOnTime, ...rest } = req.body;
    if (rest.dueDate !== undefined && rest.dueDate !== a.dueDate) {
      logDueDateChange(db, a, a.dueDate, rest.dueDate, req.user, 'admin-edit');
    }
    if (status) {
      rest.status = status;
      if (status === 'Completed') {
        const now = new Date();
        if (!a.completedAt) rest.completedAt = now.toISOString();
        rest.completionPct = 100;
        const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
        if (a.completedOnTime == null) rest.completedOnTime = due ? now <= due : null;
      } else { rest.completedAt = null; rest.completedOnTime = null; }
    }
    db.assignments[i] = { ...db.assignments[i], ...rest };
    markRecurringOverride(db, db.assignments[i], rest.memberId);
  } else if (isCreator && !isOwnTask) {
    // Reporting person / assigner: can edit details + add supervisorRemark only
    const allowed = {};
    if (req.body.supervisorRemark !== undefined) allowed.supervisorRemark = req.body.supervisorRemark;
    if (req.body.dueDate !== undefined && req.body.dueDate !== a.dueDate) {
      // Only CA-qualified team members (or admin) may change due dates
      if (req.user.role !== 'admin' && req.user.qualification !== 'CA')
        return res.status(403).json({ error: 'Only Chartered Accountant (CA) team members can extend or change due dates.' });
      logDueDateChange(db, a, a.dueDate, req.body.dueDate, req.user, 'edit');
      allowed.dueDate = req.body.dueDate;
    }
    if (req.body.priority !== undefined) allowed.priority = req.body.priority;
    if (req.body.notes !== undefined) allowed.notes = req.body.notes;
    if (req.body.memberId !== undefined) { allowed.memberId = req.body.memberId; allowed.memberName = req.body.memberName; }
    db.assignments[i] = { ...db.assignments[i], ...allowed };
    markRecurringOverride(db, db.assignments[i], allowed.memberId);
  } else if (isOwnTask || isCreator) {
    if (a.status === 'Completed') return res.status(400).json({ error: 'This task is Completed and locked. Your reporting manager must request a reopen.' });
    // CA-qualified members (or admin) may extend/change the due date of their own task
    if (req.body.dueDate !== undefined && req.body.dueDate !== a.dueDate) {
      if (req.user.role === 'admin' || req.user.qualification === 'CA') {
        logDueDateChange(db, a, a.dueDate, req.body.dueDate, req.user, 'ca-edit');
        db.assignments[i].dueDate = req.body.dueDate;
      } else {
        return res.status(403).json({ error: 'Only Chartered Accountant (CA) team members can extend or change due dates. Please raise a Due Date Request instead.' });
      }
    }
    const prevPct = a.completionPct || 0;
    const prevStatus = a.status;
    if (req.body.status) {
      // Member marking Completed -> goes to reporting manager (or admin) for approval first
      if (req.body.status === 'Completed' && req.user.role !== 'admin') {
        db.assignments[i].status = 'Under Review';
        db.assignments[i].awaitingApproval = true;
        db.assignments[i].submittedForApprovalAt = new Date().toISOString();
        // completion stays below 100 until approved
        if ((db.assignments[i].completionPct || 0) < 90) db.assignments[i].completionPct = 90;
        // Notify approver: reporting manager, else admin
        const approverId = a.reportingPersonId || (db.users.find(u => u.role === 'admin') || {}).id;
        const cl = db.clients.find(c => c.id === a.clientId);
        if (approverId && approverId !== req.user.id) {
          const approver = db.users.find(u => u.id === approverId);
          dispatchNotification(db, 'approval-needed',
            { userId: approverId, email: approver && approver.email, mobile: approver && approver.mobile, name: approver && approver.name },
            {
              memberName: req.user.name,
              workType: a.workType,
              clientName: cl ? cl.name : '\u2014'
            },
            { assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType }
          ).catch(() => {});
        }
      } else {
        db.assignments[i].status = req.body.status;
        if (req.body.status === 'Completed') {
          db.assignments[i].completionPct = 100;
          db.assignments[i].awaitingApproval = false;
          const now = new Date();
          db.assignments[i].completedAt = now.toISOString();
          const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
          db.assignments[i].completedOnTime = due ? now <= due : null;
        }
      }
    }
    if (req.body.remark !== undefined) db.assignments[i].remark = req.body.remark;
    if (req.body.completionPct !== undefined) {
      const pct = Math.min(100, Math.max(0, Math.round(parseInt(req.body.completionPct) / 10) * 10));
      db.assignments[i].completionPct = pct;
    }
    if (!db.assignments[i].activityLog) db.assignments[i].activityLog = [];
    const newPct = db.assignments[i].completionPct || 0;
    db.assignments[i].activityLog.push({
      date: new Date().toISOString(), updatedBy: req.user.id, updatedByName: req.user.name,
      status: db.assignments[i].status, completionPct: newPct, prevPct, prevStatus,
      remark: db.assignments[i].remark || '', isBackward: newPct < prevPct
    });
  } else {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  writeDB(db);
  res.json(db.assignments[i]);
});

// ── POST /api/assignments/:id/approve-completion — Approve / reject ─────────
router.post('/assignments/:id/approve-completion', auth, (req, res) => {
  const db = readDB();
  const i = db.assignments.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Assignment not found.' });
  const a = db.assignments[i];
  const approverIsManager = a.reportingPersonId && a.reportingPersonId === req.user.id;
  const approverIsAdminFallback = !a.reportingPersonId && req.user.role === 'admin';
  const approverIsAdmin = req.user.role === 'admin';
  if (!approverIsManager && !approverIsAdminFallback && !approverIsAdmin)
    return res.status(403).json({ error: 'Only the reporting manager (or Admin) can approve this completion.' });
  if (!a.awaitingApproval) return res.status(400).json({ error: 'This task is not awaiting approval.' });

  const approve = req.body.approve !== false; // default approve unless explicitly false
  const cl = db.clients.find(c => c.id === a.clientId);
  if (approve) {
    const now = new Date();
    a.status = 'Completed';
    a.completionPct = 100;
    a.awaitingApproval = false;
    a.completedAt = now.toISOString();
    a.approvedById = req.user.id; a.approvedByName = req.user.name; a.approvedAt = now.toISOString();
    const due = a.dueDate ? new Date(a.dueDate + 'T23:59:59') : null;
    a.completedOnTime = due ? now <= due : null;
    if (a.memberId && a.memberId !== req.user.id) {
      const member = db.users.find(u => u.id === a.memberId);
      dispatchNotification(db, 'completion-approved',
        { userId: a.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
        { memberName: member ? member.name : '', workType: a.workType, clientName: cl ? cl.name : '\u2014', approverName: req.user.name },
        { assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType }
      ).catch(() => {});
    }
  } else {
    a.status = 'In Progress';
    a.awaitingApproval = false;
    a.rejectionRemark = (req.body.remark || '').trim();
    if (a.memberId && a.memberId !== req.user.id) {
      const member = db.users.find(u => u.id === a.memberId);
      dispatchNotification(db, 'completion-rejected',
        { userId: a.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
        { memberName: member ? member.name : '', workType: a.workType, clientName: cl ? cl.name : '\u2014', approverName: req.user.name, rejectionNote: a.rejectionRemark ? ' Note: ' + a.rejectionRemark : '' },
        { assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType }
      ).catch(() => {});
    }
  }
  if (!a.activityLog) a.activityLog = [];
  a.activityLog.push({ date: new Date().toISOString(), updatedBy: req.user.id, updatedByName: req.user.name,
    status: a.status, completionPct: a.completionPct || 0, remark: approve ? 'Completion approved' : ('Sent back: ' + (a.rejectionRemark||'')), isApproval: true });
  db.assignments[i] = a;
  writeDB(db);
  res.json(a);
});

// ── DELETE /api/assignments/:id — Delete assignment (admin only) ─────────────
router.delete('/assignments/:id', auth, (req, res) => {
  const db = readDB();
  const a = db.assignments.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only Admin can delete a task.' });
  db.assignments = db.assignments.filter(x => x.id !== req.params.id);
  // Also delete sub-assignments of this assignment
  db.assignments = db.assignments.filter(x => x.parentAssignmentId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── POST /api/assignments/bulk-delete — Bulk delete assignments ─────────────
router.post('/assignments/bulk-delete', auth, (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs provided.' });
  const db = readDB();
  let deleted = 0;
  ids.forEach(id => {
    const a = db.assignments.find(x => x.id === id);
    if (!a) return;
    const isAdmin = req.user.role === 'admin';
    const isCreator = a.subAssignedBy === req.user.id || a.reportingPersonId === req.user.id;
    if (isAdmin || isCreator) {
      db.assignments = db.assignments.filter(x => x.id !== id && x.parentAssignmentId !== id);
      deleted++;
    }
  });
  writeDB(db);
  res.json({ ok: true, deleted });
});

// ── POST /api/assignments/:id/comments — Add comment / reminder ─────────────
router.post('/assignments/:id/comments', auth, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text required.' });
  const db = readDB();
  const i = (db.assignments || []).findIndex(a => a.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Task not found.' });
  const a = db.assignments[i];
  const isClientOwner = req.user.role === 'client' && a.clientId === req.user.clientId;
  const isTeam = req.user.role === 'admin' || a.memberId === req.user.id || a.reportingPersonId === req.user.id;
  if (!isClientOwner && !isTeam) return res.status(403).json({ error: 'Forbidden.' });
  if (!a.comments) a.comments = [];
  const comment = {
    id: newId(), authorId: req.user.id, authorName: req.user.name,
    role: req.user.role, isReminder: !!req.body.isReminder,
    text, date: new Date().toISOString()
  };
  a.comments.push(comment);
  // Notify the other side
  try {
    if (req.user.role === 'client') {
      const cl = db.clients.find(c => c.id === a.clientId);
      const recipients = [];
      if (a.memberId) {
        const m = db.users.find(u => u.id === a.memberId);
        recipients.push({ userId: a.memberId, email: m && m.email, mobile: m && m.mobile, name: m && m.name });
      }
      if (a.reportingPersonId && a.reportingPersonId !== a.memberId) {
        const rp = db.users.find(u => u.id === a.reportingPersonId);
        recipients.push({ userId: a.reportingPersonId, email: rp && rp.email, mobile: rp && rp.mobile, name: rp && rp.name });
      }
      if (recipients.length) {
        dispatchNotification(db, 'client-comment', recipients,
          { workType: a.workType, clientName: cl ? cl.name : req.user.name, memberName: '' },
          { assignmentId: a.id, clientName: cl ? cl.name : '', workType: a.workType, pushTag: 'cmt-' + a.id }
        ).catch(() => {});
      }
    }
  } catch (e) {}
  writeDB(db);
  res.json(comment);
});

// ── GET /api/client/assignments — Client portal tasks ───────────────────────
// NOTE: This endpoint is mounted at /api/client/assignments in the main app,
// so the router path is just '/'. See mounting instructions.
router.get('/client/assignments', auth, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Client access only.' });
  const db = readDB();
  const sc = clientScope(req, db);
  const cmap = {}; (db.clients || []).forEach(c => { cmap[c.id] = c.name; });
  const periodOf = a => a.recurringMonthKey || (a.dueDate ? a.dueDate.slice(0, 7) : '');
  let mine = (db.assignments || []).filter(a => sc.ids.includes(a.clientId));
  if (req.query.period && req.query.period !== 'all') mine = mine.filter(a => periodOf(a) === req.query.period);
  const out = mine.map(a => ({
    id: a.id,
    workType: a.workType,
    companyName: cmap[a.clientId] || '\u2014',
    period: periodOf(a),
    assignmentType: a.assignmentType || 'onetime',
    status: a.status || 'Pending',
    priority: a.priority || 'Normal',
    completionPct: a.completionPct || 0,
    dueDate: a.dueDate,
    memberName: a.memberName || '\u2014',
    reportingPersonName: a.reportingPersonName || '\u2014',
    remark: a.remark || '',
    remarkHistory: (a.activityLog || [])
      .filter(l => l.remark && l.remark.trim())
      .map(l => ({ remark: l.remark, by: l.updatedByName || 'Team', status: l.status, completionPct: l.completionPct, date: l.date })),
    completedAt: a.completedAt || null,
    comments: (a.comments || []).map(c => ({ author: c.authorName, role: c.role, text: c.text, date: c.date }))
  })).sort((x, y) => (x.status === 'Completed' ? 1 : 0) - (y.status === 'Completed' ? 1 : 0) || new Date(x.dueDate || 0) - new Date(y.dueDate || 0));
  res.json(out);
});

// ── GET /api/recurring-report — Month-wise recurring task status report ──────
router.get('/recurring-report', auth, (req, res) => {
  if (req.user.role === 'client' || req.user.role === 'itrclient') return res.status(403).json({ error: 'Forbidden.' });
  const db = readDB();
  const months = Math.min(12, Math.max(2, parseInt(req.query.months) || 6));
  const now = new Date();
  const keys = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  keys.reverse();
  const monthLabels = keys.map(k => {
    const [y, m] = k.split('-');
    return { key: k, label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1] + ' ' + y.slice(2) };
  });
  const cmap = {}; (db.clients || []).forEach(c => { cmap[c.id] = c.name; });
  const periodOf = a => a.recurringMonthKey || (a.dueDate ? a.dueDate.slice(0, 7) : '');
  const recs = (db.assignments || []).filter(a => a.assignmentType === 'recurring');
  const groups = {};
  recs.forEach(a => {
    const k = a.clientId + '||' + a.workType;
    if (!groups[k]) groups[k] = { clientId: a.clientId, clientName: cmap[a.clientId] || '\u2014', workType: a.workType, byMonth: {} };
    const p = periodOf(a);
    if (keys.includes(p)) {
      const prev = groups[k].byMonth[p];
      const rank = s => s === 'Completed' ? 3 : (s === 'Under Review' ? 2 : (s === 'In Progress' ? 1 : 0));
      if (!prev || rank(a.status) > rank(prev.status)) groups[k].byMonth[p] = { status: a.status, completedAt: a.completedAt || null, dueDate: a.dueDate };
    }
  });
  const rows = Object.values(groups)
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.workType.localeCompare(b.workType))
    .map(g => ({ clientName: g.clientName, workType: g.workType, cells: keys.map(k => g.byMonth[k] || null) }));
  res.json({ months: monthLabels, rows });
});

module.exports = router;
