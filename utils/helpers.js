// ═══════════════════════════════════════════════════════════
// utils/helpers.js — Pure utility functions (no side effects)
// ═══════════════════════════════════════════════════════════
const { MS_DAY } = require('../config');

/**
 * Generate a short unique ID (base36 timestamp + random suffix)
 */
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Parse a currency/number value from various formats.
 * Handles: ₹, $, commas, parenthesised negatives, etc.
 */
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/[₹$,\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}

/**
 * Sales/billing value of an invoice or note:
 * prefer Taxable Value; fall back to Invoice Value, then Net Receivable.
 */
function saleValue(iv) {
  const t = num(iv.taxableValue);
  if (t !== 0) return t;
  const inv = num(iv.invoiceValue);
  if (inv !== 0) return inv;
  return num(iv.netReceivable);
}

/**
 * Add N days to a date string, returning YYYY-MM-DD or null.
 */
function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr); if (isNaN(d)) return null;
  return new Date(d.getTime() + n * MS_DAY).toISOString().slice(0, 10);
}

/**
 * Extract YYYY-MM from a date string.
 */
function monthKeyOf(dateStr) {
  return dateStr ? String(dateStr).slice(0, 7) : null;
}

/**
 * Month name abbreviation from 0-based month index.
 */
function monthName(m) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];
}

/**
 * Today's date as YYYY-MM-DD in IST.
 */
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD in IST
}

/**
 * Current time as HH:MM in IST (24h).
 */
function timeStr() {
  return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Builds a readable "field: old -> new" summary for changed fields only.
 */
function diffFields(before, after, fields) {
  const out = [];
  fields.forEach(f => {
    const a = before ? before[f] : undefined, b = after ? after[f] : undefined;
    const norm = v => (v === undefined || v === null) ? '' : String(v);
    if (norm(a) !== norm(b)) out.push(`${f}: ${norm(a) || '\u2014'} \u2192 ${norm(b) || '\u2014'}`);
  });
  return out.join('; ');
}

/**
 * Extract the client IP from request headers.
 */
function reqIp(req) {
  return ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || '';
}

module.exports = {
  newId,
  num,
  saleValue,
  addDays,
  monthKeyOf,
  monthName,
  todayStr,
  timeStr,
  diffFields,
  reqIp
};
