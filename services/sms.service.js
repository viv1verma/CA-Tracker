// ═══════════════════════════════════════════════════════════
// services/sms.service.js — Fast2SMS integration (Indian SMS gateway)
// ═══════════════════════════════════════════════════════════
// Uses Fast2SMS bulk API for DLT-registered transactional SMS.
// All credentials come from environment variables only.
const https = require('https');

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
const FAST2SMS_SENDER_ID = process.env.FAST2SMS_SENDER_ID || 'GARPAS';
const FAST2SMS_ROUTE = process.env.FAST2SMS_ROUTE || 'dlt';

if (FAST2SMS_API_KEY) {
  console.log('\u2705 SMS (Fast2SMS) configured — sender:', FAST2SMS_SENDER_ID);
} else {
  console.log('\uD83D\uDCF1 SMS disabled (set FAST2SMS_API_KEY).');
}

/**
 * Send an SMS via Fast2SMS.
 * @param {string} toMobile - 10-digit Indian mobile number (or with +91/91 prefix)
 * @param {string} message - Message body (must match DLT-registered template)
 * @param {string} [dltTemplateId] - DLT template ID (required for transactional SMS in India)
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
function sendSms(toMobile, message, dltTemplateId) {
  if (!FAST2SMS_API_KEY || !toMobile || !message) {
    return Promise.resolve({ ok: false, skipped: true, reason: !FAST2SMS_API_KEY ? 'not configured' : 'missing params' });
  }

  // Skip if no DLT template ID (required for Indian transactional SMS)
  if (FAST2SMS_ROUTE === 'dlt' && !dltTemplateId) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'no DLT template ID' });
  }

  // Normalize to 10-digit Indian number
  let num = String(toMobile).replace(/[^0-9]/g, '');
  if (num.startsWith('91') && num.length === 12) num = num.slice(2);
  if (num.length !== 10) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'invalid mobile number' });
  }

  const payload = JSON.stringify({
    route: FAST2SMS_ROUTE,
    sender_id: FAST2SMS_SENDER_ID,
    message: dltTemplateId ? undefined : message,
    variables_values: dltTemplateId ? message : undefined,
    flash: 0,
    numbers: num,
    ...(dltTemplateId ? { DLT_TE_ID: dltTemplateId } : {})
  });

  return new Promise(resolve => {
    const req = https.request({
      hostname: 'www.fast2sms.com',
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': FAST2SMS_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, r => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.return === true || r.statusCode < 300) {
            resolve({ ok: true, requestId: data.request_id });
          } else {
            console.log('SMS send failed:', data.message || body);
            resolve({ ok: false, error: data.message || 'Send failed' });
          }
        } catch (e) {
          resolve({ ok: r.statusCode < 300, raw: body });
        }
      });
    });
    req.on('error', e => {
      console.log('SMS send error:', e.message);
      resolve({ ok: false, error: e.message });
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Check if SMS is configured and ready to send.
 */
function isSmsReady() {
  return !!FAST2SMS_API_KEY;
}

module.exports = {
  sendSms,
  isSmsReady
};
