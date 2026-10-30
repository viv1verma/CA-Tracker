// ═══════════════════════════════════════════════════════════
// routes/notifications.routes.js — Notifications, Push & VAPID
// ═══════════════════════════════════════════════════════════
const router = require('express').Router();

const { readDB, writeDB } = require('../db');
const { newId } = require('../utils/helpers');
const { auth } = require('../middleware/auth');
const { sendPushToUser, getVapidPublicKey } = require('../services/notification.service');
const { dispatchNotification } = require('../services/channel-dispatcher.service');

// ── GET /api/notifications ──────────────────────────────────────────────────
router.get('/', auth, (req, res) => {
  const db = readDB();
  res.json((db.notifications || []).filter(n => n.toUserId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// ── POST /api/notifications (send reminder) ─────────────────────────────────
router.post('/', auth, (req, res) => {
  const { assignmentId, message } = req.body;
  if (!assignmentId) return res.status(400).json({ error: 'Assignment ID required.' });
  const db = readDB();
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin' && assignment.reportingPersonId !== req.user.id)
    return res.status(403).json({ error: 'Only Reporting Person or Admin can send reminders.' });
  const client = db.clients.find(c => c.id === assignment.clientId);
  const notif = {
    id: newId(),
    toUserId: assignment.memberId,
    toName: assignment.memberName,
    fromUserId: req.user.id,
    fromName: req.user.name,
    assignmentId,
    clientName: client ? client.name : '—',
    workType: assignment.workType,
    message: (message || '').trim() || 'Please update the status of your assignment.',
    read: false,
    createdAt: new Date().toISOString()
  };
  if (!db.notifications) db.notifications = [];
  db.notifications.push(notif);
  writeDB(db);
  // Also send push/email/sms/whatsapp for reminder (in-app already created above)
  const member = db.users.find(u => u.id === assignment.memberId);
  dispatchNotification(db, 'manual-reminder',
    { userId: assignment.memberId, email: member && member.email, mobile: member && member.mobile, name: member && member.name },
    {
      senderName: req.user.name,
      clientName: client ? client.name : '\u2014',
      workType: assignment.workType,
      message: notif.message,
      memberName: member ? member.name : ''
    },
    { assignmentId, clientName: client ? client.name : '', workType: assignment.workType, channelOverrides: { inapp: false } }
  ).then(() => { const d = readDB(); writeDB(d); }).catch(err => console.error('Reminder dispatch error:', err));
  res.json(notif);
});

// ── PUT /api/notifications/:id/read ─────────────────────────────────────────
router.put('/:id/read', auth, (req, res) => {
  const db = readDB();
  const i = (db.notifications || []).findIndex(n => n.id === req.params.id && n.toUserId === req.user.id);
  if (i === -1) return res.status(404).json({ error: 'Not found.' });
  db.notifications[i].read = true;
  writeDB(db);
  res.json(db.notifications[i]);
});

// ── DELETE /api/notifications/clear ──────────────────────────────────────────
router.delete('/clear', auth, (req, res) => {
  const db = readDB();
  db.notifications = (db.notifications || []).filter(n => n.toUserId !== req.user.id);
  writeDB(db);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// Push endpoints — these live at the /api level, not under /api/notifications.
// The calling code must mount them at the right prefix.
// When this router is mounted at /api/notifications, these are accessible via
// a SEPARATE mount: app.use('/api', notificationRoutes.pushRouter)
// ═══════════════════════════════════════════════════════════
const pushRouter = require('express').Router();

// ── GET /api/vapid-public-key ───────────────────────────────────────────────
pushRouter.get('/vapid-public-key', (req, res) => {
  res.json({ key: getVapidPublicKey() });
});

// ── POST /api/push-subscribe ────────────────────────────────────────────────
pushRouter.post('/push-subscribe', auth, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const db = readDB();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];
  db.pushSubscriptions = db.pushSubscriptions.filter(s => s.userId !== req.user.id);
  db.pushSubscriptions.push({
    userId: req.user.id, userName: req.user.name,
    endpoint: subscription.endpoint, subscription,
    createdAt: new Date().toISOString()
  });
  writeDB(db);
  console.log(`✅ Push subscription saved for ${req.user.name}`);
  res.json({ ok: true });
});

// ── POST /api/push-test ─────────────────────────────────────────────────────
pushRouter.post('/push-test', auth, async (req, res) => {
  const db = readDB();
  const targetId = req.body.userId || req.user.id;
  const subs = (db.pushSubscriptions || []).filter(s => s.userId === targetId);
  console.log(`Push test for user ${req.user.name}: ${subs.length} subscriptions found`);
  if (!subs.length) return res.json({ ok: false, message: 'No push subscription found. Please click "Enable Notifications" first.' });
  const payload = {
    title: '✅ GARP Notifications Active!',
    body: `Hi ${req.user.name}! You will now receive assignment alerts on this device.`,
    tag: 'test-push-' + Date.now(),
    url: '/'
  };
  try {
    await sendPushToUser(db, targetId, payload);
    writeDB(db);
    res.json({ ok: true, message: `Notification sent to ${subs.length} device(s)!` });
  } catch (e) {
    console.error('Push test error:', e);
    res.json({ ok: false, message: e.message });
  }
});

// ── POST /api/push-unsubscribe ──────────────────────────────────────────────
pushRouter.post('/push-unsubscribe', auth, (req, res) => {
  const db = readDB();
  db.pushSubscriptions = (db.pushSubscriptions || []).filter(s => s.userId !== req.user.id);
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
module.exports.pushRouter = pushRouter;
