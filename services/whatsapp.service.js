// ═══════════════════════════════════════════════════════════
// services/whatsapp.service.js — WhatsApp Cloud API service
// ═══════════════════════════════════════════════════════════
// Uses Meta WhatsApp Cloud API (or compatible BSP). Uses approved templates.
// All credentials come from environment variables only.
const https = require('https');

/**
 * Send a WhatsApp template message.
 * @param {string} toMobile - Mobile number (10-digit Indian or E.164)
 * @param {string} templateName - Approved template name
 * @param {string[]} params - Template body parameters
 * @returns {Promise<{ok: boolean, skipped?: boolean, status?: number, error?: string}>}
 */
function sendWhatsApp(toMobile, templateName, params) {
  const tokenWA = process.env.WA_TOKEN;             // permanent/system token
  const phoneId = process.env.WA_PHONE_ID;          // sender phone number ID
  const apiVer  = process.env.WA_API_VERSION || 'v20.0';
  if (!tokenWA || !phoneId || !toMobile) return Promise.resolve({ ok: false, skipped: true });
  // Normalise Indian mobile to E.164 (default +91) without storing it anywhere new
  let num = String(toMobile).replace(/[^0-9]/g, '');
  if (num.length === 10) num = '91' + num;
  const lang = process.env.WA_TEMPLATE_LANG || 'en';
  const payload = JSON.stringify({
    messaging_product: 'whatsapp', to: num, type: 'template',
    template: {
      name: templateName, language: { code: lang },
      components: params && params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : undefined
    }
  });
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'graph.facebook.com', path: `/${apiVer}/${phoneId}/messages`, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tokenWA, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve({ ok: r.statusCode < 300, status: r.statusCode })); });
    req.on('error', e => { console.log('whatsapp send failed:', e.message); resolve({ ok: false, error: e.message }); });
    req.write(payload); req.end();
  });
}

/**
 * Check if WhatsApp is configured and ready to send.
 */
function isWhatsAppReady() {
  return !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID);
}

module.exports = {
  sendWhatsApp,
  isWhatsAppReady
};
