// ═══════════════════════════════════════════════════════════
// services/email.service.js — Email (SMTP) service
// ═══════════════════════════════════════════════════════════
// All credentials come from environment variables only -- never stored in code,
// the JSON DB, or sent to the browser. Transport is TLS.

let _mailer = null;
let _mailReady = false;
let _mailInfo = { configured: false, user: '', verified: false, error: '' };

// ── IIFE: initialise the SMTP transport on module load ──
(function initMailer() {
  // Gmail / Google Workspace via App Password
  const user = process.env.SMTP_USER;            // e.g. office@garp.co.in
  const pass = process.env.SMTP_PASS;            // 16-char Google App Password
  if (!user || !pass) { console.log('\u2709\uFE0F  Email disabled (set SMTP_USER / SMTP_PASS).'); return; }
  _mailInfo.configured = true; _mailInfo.user = user;
  try {
    const nodemailer = require('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '465');
    _mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,                       // 465 = SSL; 587/25 = STARTTLS (secure:false)
      auth: { user, pass }
    });
    _mailReady = true;
    console.log('\u2705 Email configured (' + user + ') \u2014 verifying\u2026');
    // Verify the SMTP connection/credentials so logs reveal auth problems
    _mailer.verify()
      .then(() => { _mailInfo.verified = true; console.log('\u2705 Email verified \u2014 ready to send from ' + user); })
      .catch(e => { _mailInfo.error = e.message; console.log('\u26A0\uFE0F  Email verify FAILED:', e.message); });
  } catch (e) { _mailInfo.error = e.message; console.log('\u2709\uFE0F  Email init failed:', e.message); }
})();

/**
 * Send an email. Returns a promise resolving to { ok, skipped?, error? }.
 */
function sendEmail(to, subject, text, html) {
  if (!_mailReady || !to) return Promise.resolve({ ok: false, skipped: true, reason: !_mailReady ? 'not configured' : 'no recipient' });
  const from = process.env.MAIL_FROM || ('GARP & Associates <' + process.env.SMTP_USER + '>');
  const msg = { from, to, subject, text };
  if (html) msg.html = html;
  return _mailer.sendMail(msg)
    .then(() => ({ ok: true }))
    .catch(e => { console.log('email send failed:', e.message); return { ok: false, error: e.message }; });
}

/**
 * Get the mail configuration info (for diagnostic endpoints).
 */
function getMailInfo() {
  return { ..._mailInfo };
}

/**
 * Check if the mailer is ready to send.
 */
function isMailReady() {
  return _mailReady;
}

module.exports = {
  sendEmail,
  getMailInfo,
  isMailReady
};
