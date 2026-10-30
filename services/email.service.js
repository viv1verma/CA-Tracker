// ═══════════════════════════════════════════════════════════
// services/email.service.js — Smart email provider selection
// ═══════════════════════════════════════════════════════════
// Auto-selects Resend (if RESEND_API_KEY set) or falls back to legacy
// SMTP (Nodemailer with Gmail). Exports the same API either way.
//
// Priority: RESEND_API_KEY > SMTP_USER/SMTP_PASS > disabled

let provider;

if (process.env.RESEND_API_KEY) {
  provider = require('./resend-email.service');
} else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  provider = require('./email.service.legacy');
} else {
  console.log('\u2709\uFE0F  Email disabled (set RESEND_API_KEY or SMTP_USER/SMTP_PASS).');
  provider = {
    sendEmail: () => Promise.resolve({ ok: false, skipped: true, reason: 'not configured' }),
    getMailInfo: () => ({ configured: false, provider: 'none', verified: false, error: 'No email provider configured' }),
    isMailReady: () => false
  };
}

module.exports = {
  sendEmail: provider.sendEmail,
  getMailInfo: provider.getMailInfo,
  isMailReady: provider.isMailReady
};
