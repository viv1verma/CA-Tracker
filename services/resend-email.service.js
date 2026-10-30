// ═══════════════════════════════════════════════════════════
// services/resend-email.service.js — Resend email API wrapper
// ═══════════════════════════════════════════════════════════
// Modern email API with template support. Same external API as the
// legacy SMTP service so callers don't need to change.

let _resend = null;
let _ready = false;
let _info = { configured: false, provider: 'resend', verified: false, error: '' };

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'GARP & Associates <noreply@garp.co.in>';

if (RESEND_API_KEY) {
  try {
    const { Resend } = require('resend');
    _resend = new Resend(RESEND_API_KEY);
    _ready = true;
    _info.configured = true;
    _info.verified = true;
    console.log('\u2705 Email (Resend) configured — from:', MAIL_FROM);
  } catch (e) {
    _info.error = e.message;
    console.log('\u2709\uFE0F  Resend init failed:', e.message);
  }
}

/**
 * Send an email via Resend. Same signature as the legacy SMTP service.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} [html] - Optional HTML body
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string, id?: string}>}
 */
async function sendEmail(to, subject, text, html) {
  if (!_ready || !to) {
    return { ok: false, skipped: true, reason: !_ready ? 'not configured' : 'no recipient' };
  }

  try {
    const msg = { from: MAIL_FROM, to, subject, text };
    if (html) msg.html = html;
    const result = await _resend.emails.send(msg);
    if (result.error) {
      console.log('Resend send failed:', result.error.message);
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.log('Resend send error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Get mail configuration info (for diagnostic endpoints).
 */
function getMailInfo() {
  return { ..._info };
}

/**
 * Check if the mailer is ready to send.
 */
function isMailReady() {
  return _ready;
}

module.exports = {
  sendEmail,
  getMailInfo,
  isMailReady
};
