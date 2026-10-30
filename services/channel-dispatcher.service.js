// ═══════════════════════════════════════════════════════════
// services/channel-dispatcher.service.js — Central notification dispatcher
// ═══════════════════════════════════════════════════════════
// Single entry point that dispatches a notification event across all
// configured channels (push, inapp, email, SMS, WhatsApp).
// Each channel call is fire-and-forget — failures are logged, not thrown.

const { NOTIFICATION_TEMPLATES, interpolate } = require('./notification-templates');
const { sendEmail } = require('./email.service');
const { sendSms } = require('./sms.service');
const { sendWhatsApp } = require('./whatsapp.service');
const { newId } = require('../utils/helpers');

// Web push + in-app are lazy-loaded to avoid circular deps
let _notifService = null;
function notifService() {
  if (!_notifService) _notifService = require('./notification.service');
  return _notifService;
}

/**
 * Resolve which channels are enabled for an event.
 * Merges: template defaults → db overrides → per-call overrides.
 */
function resolveChannels(eventKey, db, channelOverrides) {
  const template = NOTIFICATION_TEMPLATES[eventKey];
  if (!template) return {};

  // Start with template defaults
  const channels = { push: false, inapp: false, email: false, sms: false, whatsapp: false };
  (template.channels || []).forEach(ch => { channels[ch] = true; });

  // Apply db-level overrides (admin config)
  const dbConfig = (db && db.notificationChannelConfig && db.notificationChannelConfig[eventKey]) || null;
  if (dbConfig) {
    Object.keys(channels).forEach(ch => {
      if (dbConfig[ch] !== undefined) channels[ch] = !!dbConfig[ch];
    });
  }

  // Apply per-call overrides
  if (channelOverrides) {
    Object.keys(channels).forEach(ch => {
      if (channelOverrides[ch] !== undefined) channels[ch] = !!channelOverrides[ch];
    });
  }

  return channels;
}

/**
 * Dispatch a notification across all configured channels.
 *
 * @param {object} db - Database object (mutated for inapp/push — caller must writeDB)
 * @param {string} eventKey - One of the 17 keys from NOTIFICATION_TEMPLATES
 * @param {object|object[]} recipients - { userId, email?, mobile?, name? } or array
 * @param {object} vars - Template variables (e.g., { clientName, workType, dueDate })
 * @param {object} [opts] - Optional overrides
 * @param {object} [opts.channelOverrides] - Per-call channel on/off: { email: true, sms: false }
 * @param {string} [opts.assignmentId] - Assignment ID for in-app notification
 * @param {string} [opts.clientName] - Client name for in-app notification
 * @param {string} [opts.workType] - Work type for in-app notification
 * @param {string} [opts.notifType] - Override notification type for in-app
 * @param {string} [opts.pushTag] - Override push notification tag
 * @param {string} [opts.emailHtmlOverride] - Bypass template; use this HTML for email
 * @param {string} [opts.emailTextOverride] - Bypass template; use this text for email
 * @returns {Promise<{results: object}>}
 */
async function dispatchNotification(db, eventKey, recipients, vars, opts) {
  const template = NOTIFICATION_TEMPLATES[eventKey];
  if (!template) {
    console.warn('dispatchNotification: unknown event key:', eventKey);
    return { results: {} };
  }

  opts = opts || {};
  vars = vars || {};
  const channels = resolveChannels(eventKey, db, opts.channelOverrides);
  const recipientList = Array.isArray(recipients) ? recipients : [recipients];
  const results = { push: [], inapp: [], email: [], sms: [], whatsapp: [] };

  for (const recipient of recipientList) {
    const userId = recipient.userId;
    const email = recipient.email;
    const mobile = recipient.mobile;

    // ── In-app notification ──
    if (channels.inapp && userId && template.templates.inapp) {
      try {
        const t = template.templates.inapp;
        const title = interpolate(t.title, vars);
        const message = interpolate(t.message, vars);
        notifService().notifyUser(db, userId, {
          title,
          message,
          type: opts.notifType || eventKey,
          assignmentId: opts.assignmentId || null,
          clientName: opts.clientName || vars.clientName || '',
          workType: opts.workType || vars.workType || ''
        });
        results.inapp.push({ userId, ok: true });
      } catch (e) {
        results.inapp.push({ userId, ok: false, error: e.message });
      }
    }

    // ── Web Push notification ──
    if (channels.push && userId && template.templates.push) {
      try {
        const t = template.templates.push;
        const payload = {
          title: interpolate(t.title, vars),
          body: interpolate(t.body, vars),
          tag: opts.pushTag || eventKey + '-' + (opts.assignmentId || newId()),
          url: '/'
        };
        await notifService().sendPushToUser(db, userId, payload);
        results.push.push({ userId, ok: true });
      } catch (e) {
        results.push.push({ userId, ok: false, error: e.message });
      }
    }

    // ── Email ──
    if (channels.email && email && template.templates.email) {
      try {
        const t = template.templates.email;
        const subject = interpolate(t.subject, vars);
        const text = opts.emailTextOverride || interpolate(t.textBody, vars);
        const html = opts.emailHtmlOverride || (t.htmlBody ? interpolate(t.htmlBody, vars) : null);
        const r = await sendEmail(email, subject, text, html);
        results.email.push({ email, ...r });
      } catch (e) {
        results.email.push({ email, ok: false, error: e.message });
      }
    }

    // ── SMS ──
    if (channels.sms && mobile && template.templates.sms) {
      try {
        const t = template.templates.sms;
        const body = interpolate(t.body, vars);
        const r = await sendSms(mobile, body, t.dltTemplateId);
        results.sms.push({ mobile, ...r });
      } catch (e) {
        results.sms.push({ mobile, ok: false, error: e.message });
      }
    }

    // ── WhatsApp ──
    if (channels.whatsapp && mobile && template.templates.whatsapp) {
      try {
        const t = template.templates.whatsapp;
        const templateName = t.templateName;
        const params = (t.params || []).map(p => interpolate(p, vars));
        const r = await sendWhatsApp(mobile, templateName, params);
        results.whatsapp.push({ mobile, ...r });
      } catch (e) {
        results.whatsapp.push({ mobile, ok: false, error: e.message });
      }
    }
  }

  return { results };
}

/**
 * Get the current channel configuration for all events.
 * Merges template defaults with any db overrides.
 */
function getChannelConfig(db) {
  const config = {};
  for (const [key, template] of Object.entries(NOTIFICATION_TEMPLATES)) {
    const channels = resolveChannels(key, db);
    config[key] = { channels, label: template.label || key };
  }
  return config;
}

/**
 * Update the channel toggles for a specific event.
 * Persisted in db.notificationChannelConfig.
 */
function updateChannelConfig(db, eventKey, channels) {
  if (!NOTIFICATION_TEMPLATES[eventKey]) return { error: 'Unknown event key.' };
  if (!db.notificationChannelConfig) db.notificationChannelConfig = {};
  db.notificationChannelConfig[eventKey] = {
    push: !!channels.push,
    inapp: !!channels.inapp,
    email: !!channels.email,
    sms: !!channels.sms,
    whatsapp: !!channels.whatsapp
  };
  return db.notificationChannelConfig[eventKey];
}

module.exports = {
  dispatchNotification,
  getChannelConfig,
  updateChannelConfig,
  resolveChannels
};
