// ═══════════════════════════════════════════════════════════
// services/notification.service.js — Push, in-app & channel notifications
// ═══════════════════════════════════════════════════════════
const { VAPID_PUBLIC, VAPID_PRIVATE } = require('../config');
const { newId } = require('../utils/helpers');
const { sendEmail } = require('./email.service');
const { sendWhatsApp } = require('./whatsapp.service');

// ── Web Push initialisation ──
let webpush = null;
try {
  webpush = require('web-push');
  webpush.setVapidDetails('mailto:admin@garp.in', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('\u2705 Web Push enabled');
} catch (e) { console.log('web-push not available'); }

// ── Push notification helpers ──

/**
 * Send a push notification to a specific user (all their subscriptions).
 * Cleans up dead/expired subscriptions automatically.
 * @param {object} db - The database object (mutated: dead subs removed)
 * @param {string} userId - Target user ID
 * @param {object} payload - { title, body, tag, url }
 * @returns {Promise<void>}
 */
async function sendPushToUser(db, userId, payload) {
  if (!webpush) return;
  const subs = (db.pushSubscriptions || []).filter(s => s.userId === userId);
  const deadEndpoints = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        deadEndpoints.push(sub.endpoint); // Expired subscription
      }
    }
  }
  // Clean up dead subscriptions
  if (deadEndpoints.length > 0) {
    db.pushSubscriptions = (db.pushSubscriptions || []).filter(s =>
      !deadEndpoints.includes(s.endpoint)
    );
  }
}

/**
 * Unified helper: create an in-app notification AND send a push to a user.
 * @param {object} db - The database object (mutated: notification added)
 * @param {string} userId - Target user ID
 * @param {object} opts - { title, message, type, assignmentId, clientName, workType, url }
 * @returns {object|undefined} The created notification object
 */
function notifyUser(db, userId, { title, message, type, assignmentId, clientName, workType, url }) {
  if (!userId) return;
  if (!db.notifications) db.notifications = [];
  const user = (db.users || []).find(u => u.id === userId);
  const notif = {
    id: newId(), toUserId: userId, toName: user ? user.name : '',
    fromUserId: 'system', fromName: 'System',
    type: type || 'event',
    assignmentId: assignmentId || null,
    clientName: clientName || '', workType: workType || '',
    message: message || title || 'Update', title: title || 'Notification',
    read: false, createdAt: new Date().toISOString()
  };
  db.notifications.push(notif);
  sendPushToUser(db, userId, { title: title || 'GARP', body: message || '', tag: (type || 'evt') + '-' + (assignmentId || newId()), url: url || '/' }).catch(() => {});
  return notif;
}

// ── ITR stage notification (email + WhatsApp + SMS via dispatcher) ──

/**
 * Fire email, WhatsApp, and SMS channels for an ITR stage change.
 * Delegates to the channel dispatcher for multi-channel delivery.
 */
function notifyItrStage(party, db) {
  if (!party) return;
  const { dispatchNotification } = require('./channel-dispatcher.service');
  const name = party.name || 'Taxpayer';
  const stage = party.stage || '';
  const ay = party.ay || '';
  dispatchNotification(db || {}, 'itr-stage-change',
    { email: party.email, mobile: party.mobile, name },
    { name, stage, ay: ay || '-', aySuffix: ay ? ' for AY ' + ay : '' }
  ).catch(e => console.error('ITR notification dispatch error:', e));
}

/**
 * Returns the configuration status of notification channels.
 */
function notifConfigStatus() {
  const { isSmsReady } = require('./sms.service');
  return {
    email: require('./email.service').isMailReady(),
    sms: isSmsReady(),
    whatsapp: !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID)
  };
}

/**
 * Get the VAPID public key (for client subscription).
 */
function getVapidPublicKey() {
  return VAPID_PUBLIC;
}

/**
 * Check if web push is available.
 */
function isWebPushAvailable() {
  return webpush !== null;
}

module.exports = {
  sendPushToUser,
  notifyUser,
  notifyItrStage,
  notifConfigStatus,
  getVapidPublicKey
};
