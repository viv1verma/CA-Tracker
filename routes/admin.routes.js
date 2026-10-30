// ═══════════════════════════════════════════════════════════
// routes/admin.routes.js — Health, Backup, Restore, Audit Log, Reports
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('../config');
const { readDB, writeDB } = require('../db');
const { logAudit } = require('../services/audit.service');
const { auth, adminOnly } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════
// Health check
// Mount this router at '/api' for audit/backup/reports routes.
// The /health endpoint sits at the root, so the caller should also do:
//   app.get('/health', (req, res) => res.json({ status:'ok', time:new Date().toISOString() }));
// OR mount this route's healthHandler separately.
// ═══════════════════════════════════════════════════════════
function healthHandler(req, res) { res.json({ status: 'ok', time: new Date().toISOString() }); }

// ═══════════════════════════════════════════════════════════
// Audit log
// ═══════════════════════════════════════════════════════════
router.get('/audit-log', auth, adminOnly, (req, res) => {
  const db = readDB();
  let list = (db.auditLog || []).slice();
  const { entity, actorId, from, to, q } = req.query;
  if (entity && entity !== 'all') list = list.filter(e => e.entity === entity);
  if (actorId && actorId !== 'all') list = list.filter(e => e.actorId === actorId);
  if (from) list = list.filter(e => e.at >= from);
  if (to) list = list.filter(e => e.at <= (to + 'T23:59:59.999Z'));
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(e => `${e.actorName} ${e.label} ${e.details} ${e.action} ${e.entity}`.toLowerCase().includes(s));
  }
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const total = list.length;
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 200));
  res.json({
    total,
    entries: list.slice(0, limit),
    entities: ['user', 'client', 'attendance', 'leave', 'comp-off', 'holiday', 'settings', 'data'],
    actors: [...new Map((db.auditLog || []).map(e => [e.actorId, { id: e.actorId, name: e.actorName }])).values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  });
});

// ═══════════════════════════════════════════════════════════
// Backup
// ═══════════════════════════════════════════════════════════
router.get('/backup', auth, adminOnly, (req, res) => {
  const db = readDB();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="garp-backup-${stamp}.json"`);
  res.send(JSON.stringify(db, null, 2));
});

// ═══════════════════════════════════════════════════════════
// Restore
// ═══════════════════════════════════════════════════════════
router.post('/restore', auth, adminOnly, (req, res) => {
  const incoming = req.body && req.body.db;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.users)) {
    return res.status(400).json({ error: 'Invalid backup file: missing users array.' });
  }
  let carriedAudit = [];
  try {
    const cur = readDB();
    carriedAudit = (cur.auditLog || []).slice();
    const bdir = path.join(DATA_DIR, 'pre-restore-backups');
    if (!fs.existsSync(bdir)) fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, `before-restore-${Date.now()}.json`), JSON.stringify(cur));
  } catch (e) { /* best-effort */ }
  const counts = {
    users: (incoming.users || []).length,
    clients: (incoming.clients || []).length,
    assignments: (incoming.assignments || []).length,
    invoices: (incoming.invoices || []).length
  };
  incoming.auditLog = carriedAudit;
  logAudit(incoming, req, 'restored', 'data', '', 'Full data restore',
    `replaced all data — restored ${counts.users} users, ${counts.clients} clients, ${counts.assignments} assignments, ${counts.invoices} invoices`);
  writeDB(incoming);
  res.json({ ok: true, restored: counts });
});

// ═══════════════════════════════════════════════════════════
// Reports
// ═══════════════════════════════════════════════════════════
router.get('/reports/workload', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(db.users.filter(u => u.role === 'member').map(m => {
    const all    = db.assignments.filter(a => a.memberId === m.id);
    const active = all.filter(a => a.status !== 'Completed');
    const done   = all.length - active.length;
    const overdue = active.filter(a => a.dueDate && new Date(a.dueDate) < new Date()).length;
    return {
      id: m.id, name: m.name, designation: m.designation, branch: m.branch,
      total: all.length, active: active.length, done, overdue,
      completionRate: all.length ? Math.round(done / all.length * 100) : 0,
      byPriority: {
        High: active.filter(a => a.priority === 'High').length,
        Normal: active.filter(a => !a.priority || a.priority === 'Normal').length
      }
    };
  }));
});

router.get('/reports/overdue', auth, adminOnly, (req, res) => {
  const db = readDB();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = db.assignments
    .filter(a => a.dueDate && new Date(a.dueDate) < today && a.status !== 'Completed')
    .map(a => {
      const cl = db.clients.find(c => c.id === a.clientId);
      const mb = db.users.find(u => u.id === a.memberId);
      return {
        ...a, clientName: cl ? cl.name : '—', memberName: mb ? mb.name : '—',
        designation: mb ? (mb.designation || '') : '',
        daysOverdue: Math.floor((today - new Date(a.dueDate)) / 86400000)
      };
    }).sort((a, b) => b.daysOverdue - a.daysOverdue);
  res.json(list);
});

router.get('/reports/clients', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(db.clients.map(cl => {
    const myA  = db.assignments.filter(a => a.clientId === cl.id);
    const done = myA.filter(a => a.status === 'Completed').length;
    const od   = myA.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'Completed').length;
    const wt   = myA.reduce((acc, a) => { acc[a.workType] = (acc[a.workType] || 0) + 1; return acc; }, {});
    return {
      id: cl.id, name: cl.name, type: cl.type, branch: cl.branch,
      total: myA.length, completed: done, pending: myA.length - done, overdue: od,
      completionRate: myA.length ? Math.round(done / myA.length * 100) : 0, workTypes: wt
    };
  }).sort((a, b) => b.total - a.total));
});

// ═══════════════════════════════════════════════════════════
// Birthdays today
// ═══════════════════════════════════════════════════════════
router.get('/birthdays/today', auth, (req, res) => {
  const db = readDB();
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  res.json(db.users.filter(u => u.dob && u.dob.slice(5) === mmdd)
    .map(u => ({ id: u.id, name: u.name, designation: u.designation })));
});

// ═══════════════════════════════════════════════════════════
// Notify celebrations (manual trigger)
// ═══════════════════════════════════════════════════════════
router.post('/notify-celebrations', auth, adminOnly, async (req, res) => {
  const { dispatchNotification } = require('../services/channel-dispatcher.service');
  const { todayStr } = require('../utils/helpers');
  const db = readDB();
  const today = todayStr();
  const todayMMDD = today.slice(5);
  const celebrated = [];
  const allUsers = db.users.map(u => ({ userId: u.id, email: u.email, mobile: u.mobile, name: u.name }));
  for (const user of db.users.filter(u => u.role === 'member')) {
    if (user.dob && user.dob.slice(5) === todayMMDD) {
      await dispatchNotification(db, 'birthday', allUsers, { name: user.name }).catch(() => {});
      celebrated.push({ type: 'birthday', name: user.name });
    }
    if (user.anniversary && user.anniversary.slice(5) === todayMMDD) {
      await dispatchNotification(db, 'anniversary', allUsers, { name: user.name }).catch(() => {});
      celebrated.push({ type: 'anniversary', name: user.name });
    }
  }
  writeDB(db);
  res.json({ ok: true, celebrated });
});

// ── Notification channel configuration (admin only) ──────────────────────────
const { getChannelConfig, updateChannelConfig } = require('../services/channel-dispatcher.service');
const { NOTIFICATION_TEMPLATES } = require('../services/notification-templates');

// GET /api/notification-config — returns all events with channel settings
router.get('/notification-config', auth, adminOnly, (req, res) => {
  const db = readDB();
  const config = getChannelConfig(db);
  // Add available channels status
  const { notifConfigStatus } = require('../services/notification.service');
  res.json({ events: config, channels: notifConfigStatus() });
});

// PUT /api/notification-config/:eventKey — toggle channels for an event
router.put('/notification-config/:eventKey', auth, adminOnly, (req, res) => {
  const { eventKey } = req.params;
  if (!NOTIFICATION_TEMPLATES[eventKey]) return res.status(400).json({ error: 'Unknown event key.' });
  const db = readDB();
  const result = updateChannelConfig(db, eventKey, req.body);
  if (result.error) return res.status(400).json(result);
  writeDB(db);
  res.json({ ok: true, eventKey, channels: result });
});

// POST /api/notification-config/test — send a test notification for a specific event
router.post('/notification-config/test', auth, adminOnly, async (req, res) => {
  const { eventKey, channel } = req.body;
  if (!NOTIFICATION_TEMPLATES[eventKey]) return res.status(400).json({ error: 'Unknown event key.' });
  const db = readDB();
  const user = (db.users || []).find(u => u.id === req.user.id);
  const testVars = {
    memberName: req.user.name, assignerName: 'System Test', clientName: 'Test Client',
    workType: 'Test Work', dueDate: new Date().toISOString().slice(0, 10),
    assignmentLabel: 'Test Assignment', dueDateSuffix: '', approverName: req.user.name,
    rejectionNote: '', leaveType: 'Casual Leave', days: 1, fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10), reason: 'Testing', status: 'approved',
    adminNote: '', cutoffTime: '10:00', count: 1, names: req.user.name, name: req.user.name,
    senderName: req.user.name, message: 'This is a test notification', managerName: req.user.name,
    stage: 'Filed', ay: '2025-26', aySuffix: ' for AY 2025-26',
    firstPsu: 'Test PSU', firstDueDate: new Date().toISOString().slice(0, 10), tenderSummary: 'Test tender summary',
    month: 'July', year: '2026'
  };
  // Force only the requested channel
  const channelOverrides = { push: false, inapp: false, email: false, sms: false, whatsapp: false };
  if (channel) channelOverrides[channel] = true;
  else { channelOverrides.push = true; channelOverrides.inapp = true; } // default: push+inapp
  try {
    const result = await dispatchNotification(db, eventKey,
      { userId: req.user.id, email: user && user.email, mobile: user && user.mobile, name: req.user.name },
      testVars, { channelOverrides });
    writeDB(db);
    res.json({ ok: true, eventKey, channel: channel || 'push+inapp', result: result.results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
module.exports.healthHandler = healthHandler;
