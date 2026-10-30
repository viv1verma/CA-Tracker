// ═══════════════════════════════════════════════════════════
// routes/holidays.routes.js — Holiday management endpoints
//
// Mount at /api/holidays so that /, /:date resolve correctly.
// Usage in server.js:  app.use('/api/holidays', require('./routes/holidays.routes'));
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { readDB, writeDB } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAudit } = require('../services/audit.service');

// ═══════════════════════════════════════════════════════════
// HOLIDAY CALENDAR (Indian festivals + government holidays)
// Source: Central Government gazetted & restricted holiday list
// ═══════════════════════════════════════════════════════════
const INDIA_HOLIDAY_CALENDAR = {
  2026: [
    // ── Gazetted (mandatory central government holidays) ──
    { date: '2026-01-26', name: 'Republic Day',            type: 'Gazetted' },
    { date: '2026-03-04', name: 'Holi',                    type: 'Gazetted' },
    { date: '2026-03-21', name: 'Id-ul-Fitr (tentative)',  type: 'Gazetted' },
    { date: '2026-03-26', name: 'Rama Navami',             type: 'Gazetted' },
    { date: '2026-03-31', name: 'Mahavir Jayanti',         type: 'Gazetted' },
    { date: '2026-04-03', name: 'Good Friday',             type: 'Gazetted' },
    { date: '2026-05-01', name: 'Buddha Purnima',          type: 'Gazetted' },
    { date: '2026-05-27', name: 'Id-ul-Zuha / Bakrid (tentative)', type: 'Gazetted' },
    { date: '2026-06-26', name: 'Muharram (tentative)',    type: 'Gazetted' },
    { date: '2026-08-15', name: 'Independence Day',        type: 'Gazetted' },
    { date: '2026-08-26', name: 'Id-e-Milad (tentative)',  type: 'Gazetted' },
    { date: '2026-09-04', name: 'Janmashtami',             type: 'Gazetted' },
    { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti',  type: 'Gazetted' },
    { date: '2026-10-20', name: 'Dussehra',                type: 'Gazetted' },
    { date: '2026-11-08', name: 'Diwali (Deepavali)',      type: 'Gazetted' },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti',      type: 'Gazetted' },
    { date: '2026-12-25', name: 'Christmas Day',           type: 'Gazetted' },
    // ── Restricted / optional festival holidays ──
    { date: '2026-01-01', name: "New Year's Day",                  type: 'Restricted' },
    { date: '2026-01-03', name: "Hazarat Ali's Birthday",          type: 'Restricted' },
    { date: '2026-01-14', name: 'Pongal / Makar Sankranti',        type: 'Restricted' },
    { date: '2026-01-23', name: 'Vasant Panchami',                 type: 'Restricted' },
    { date: '2026-02-01', name: 'Guru Ravidas Jayanti',            type: 'Restricted' },
    { date: '2026-02-12', name: 'Maharishi Dayanand Saraswati Jayanti', type: 'Restricted' },
    { date: '2026-02-15', name: 'Maha Shivaratri',                 type: 'Restricted' },
    { date: '2026-02-19', name: 'Shivaji Jayanti',                 type: 'Restricted' },
    { date: '2026-03-03', name: 'Holika Dahan',                    type: 'Restricted' },
    { date: '2026-03-19', name: 'Ugadi / Gudi Padwa',              type: 'Restricted' },
    { date: '2026-03-20', name: 'Jumat-ul-Vida',                   type: 'Restricted' },
    { date: '2026-04-05', name: 'Easter Sunday',                   type: 'Restricted' },
    { date: '2026-04-14', name: 'Vaisakhi / Mesadi',               type: 'Restricted' },
    { date: '2026-04-15', name: 'Bahag Bihu',                      type: 'Restricted' },
    { date: '2026-05-09', name: 'Rabindranath Tagore Jayanti',     type: 'Restricted' },
    { date: '2026-07-16', name: 'Rath Yatra',                      type: 'Restricted' },
    { date: '2026-08-26', name: 'Onam',                            type: 'Restricted' },
    { date: '2026-08-28', name: 'Raksha Bandhan',                  type: 'Restricted' },
    { date: '2026-09-14', name: 'Ganesh Chaturthi',                type: 'Restricted' },
    { date: '2026-10-18', name: 'Maha Saptami',                    type: 'Restricted' },
    { date: '2026-10-19', name: 'Maha Ashtami',                    type: 'Restricted' },
    { date: '2026-10-26', name: 'Maharishi Valmiki Jayanti',       type: 'Restricted' },
    { date: '2026-10-29', name: 'Karva Chauth',                    type: 'Restricted' },
    { date: '2026-11-09', name: 'Govardhan Puja',                  type: 'Restricted' },
    { date: '2026-11-11', name: 'Bhai Dooj',                       type: 'Restricted' },
    { date: '2026-11-15', name: 'Chhath Puja',                     type: 'Restricted' },
    { date: '2026-11-24', name: 'Guru Tegh Bahadur Martyrdom Day', type: 'Restricted' },
    { date: '2026-12-23', name: "Hazarat Ali's Birthday",          type: 'Restricted' },
    { date: '2026-12-24', name: 'Christmas Eve',                   type: 'Restricted' }
  ]
};
const HOLIDAY_YEARS = Object.keys(INDIA_HOLIDAY_CALENDAR).map(Number).sort();

// ── Routes ──────────────────────────────────────────────────────────────────

// List the reference calendar for a year + which dates GARP has marked as holidays
router.get('/', auth, (req, res) => {
  const db = readDB();
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const marked = (db.holidays || []).filter(h => (h.date || '').startsWith(String(year)));
  const markedDates = new Set(marked.map(h => h.date));
  const catalog = (INDIA_HOLIDAY_CALENDAR[year] || []).map(h => ({
    ...h,
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(h.date + 'T00:00:00').getDay()],
    selected: markedDates.has(h.date)
  })).sort((a, b) => a.date.localeCompare(b.date));
  // Custom "other" holidays the admin added that aren't in the reference calendar
  const catalogDates = new Set((INDIA_HOLIDAY_CALENDAR[year] || []).map(h => h.date));
  const custom = marked.filter(h => !catalogDates.has(h.date)).sort((a, b) => a.date.localeCompare(b.date));
  res.json({ year, years: HOLIDAY_YEARS, catalog, custom, holidays: marked });
});

// Admin marks which festival/government holidays are GARP holidays for a year
router.put('/', auth, adminOnly, (req, res) => {
  const db = readDB();
  const year = parseInt(req.body && req.body.year) || new Date().getFullYear();
  const dates = Array.isArray(req.body && req.body.dates) ? req.body.dates : [];
  if (!db.holidays) db.holidays = [];
  const catalog = INDIA_HOLIDAY_CALENDAR[year] || [];
  const catalogDates = new Set(catalog.map(h => h.date));
  // Keep other years, and keep this year's custom (non-catalog) holidays untouched
  const kept = db.holidays.filter(h => !String(h.date || '').startsWith(String(year)) || !catalogDates.has(h.date));
  const picked = dates
    .filter(d => catalogDates.has(d))
    .map(d => { const c = catalog.find(x => x.date === d); return { date: d, name: c.name, type: c.type, source: 'catalog' }; });
  db.holidays = kept.concat(picked).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  logAudit(db, req, 'updated', 'holiday', String(year), `${year} holiday list`, `${picked.length} holiday(s) marked for ${year}`);
  writeDB(db);
  res.json({ ok: true, count: picked.length, holidays: db.holidays.filter(h => String(h.date).startsWith(String(year))) });
});

// Admin adds a custom "other" holiday (not in the reference calendar)
router.post('/', auth, adminOnly, (req, res) => {
  const db = readDB();
  if (!db.holidays) db.holidays = [];
  const { date, name } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date is required.' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Holiday name is required.' });
  if (db.holidays.some(h => h.date === date)) return res.status(400).json({ error: 'That date is already a holiday.' });
  const h = { date, name: String(name).trim(), type: 'Other', source: 'custom' };
  db.holidays.push(h);
  db.holidays.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  logAudit(db, req, 'created', 'holiday', h.date, h.name, `custom holiday added on ${h.date}`);
  writeDB(db);
  res.json(h);
});

// Delete a holiday by date
router.delete('/:date', auth, adminOnly, (req, res) => {
  const db = readDB();
  const before = (db.holidays || []).length;
  const _h = (db.holidays || []).find(h => h.date === req.params.date);
  db.holidays = (db.holidays || []).filter(h => h.date !== req.params.date);
  if (_h) logAudit(db, req, 'deleted', 'holiday', _h.date, _h.name, `holiday removed from ${_h.date}`);
  writeDB(db);
  res.json({ ok: true, deleted: before - db.holidays.length });
});

module.exports = router;
