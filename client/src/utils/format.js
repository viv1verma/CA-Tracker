/**
 * Format a YYYY-MM-DD date string to DD-MM-YYYY.
 */
export function fmt(d) {
  if (!d) return '\u2014';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return '\u2014';
  const p = (n) => String(n).padStart(2, '0');
  return p(dt.getDate()) + '-' + p(dt.getMonth() + 1) + '-' + dt.getFullYear();
}

/**
 * Format any date string (with or without time) to DD-MM-YYYY.
 */
export function fmtAny(d) {
  if (!d) return '\u2014';
  const s = String(d);
  const dt = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
  if (isNaN(dt)) return '\u2014';
  const p = (n) => String(n).padStart(2, '0');
  return p(dt.getDate()) + '-' + p(dt.getMonth() + 1) + '-' + dt.getFullYear();
}

/**
 * Format a date-time to "DD Mon HH:MM" using en-IN locale.
 */
export function fmtDT(d) {
  return d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '\u2014';
}

/**
 * Format a period key like "2026-07" to "Jul '26",
 * "2026-Q2" to "Q2 '26", "2026-H1" to "H1 '26",
 * "2026-ANN" to "FY 2026".
 */
export function fmtPeriod(key) {
  if (!key) return '\u2014';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = String(key).match(/^(\d{4})-(\d{2})$/);
  if (m) return MN[parseInt(m[2]) - 1] + " '" + m[1].slice(2);
  const q = String(key).match(/^(\d{4})-Q(\d)$/);
  if (q) return 'Q' + q[2] + " '" + q[1].slice(2);
  const h = String(key).match(/^(\d{4})-H(\d)$/);
  if (h) return 'H' + h[2] + " '" + h[1].slice(2);
  const an = String(key).match(/^(\d{4})-ANN$/);
  if (an) return 'FY ' + an[1];
  return key;
}

/**
 * Return a short human-readable label for a frequency value.
 */
export function freqLabel(f) {
  if (!f) return '\u2014';
  const short = {
    Monthly: 'Monthly',
    Quarterly: 'Qtrly',
    'Half-Yearly': 'Half-Yr',
    Annually: 'Annual',
  };
  return short[f] || f;
}
