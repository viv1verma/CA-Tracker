// ═══════════════════════════════════════════════════════════
// config/index.js — All configuration constants
// ═══════════════════════════════════════════════════════════
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'GARP-ASSOCIATES-2024-SECRET';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ── VAPID keys for Web Push ──
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BAM7b-PNpQNQb-bsk-2W7DYzdyposuocVJ1yNBcQSJxXgY3wq9dBXGAITz0MDZ98u8NpWt9MLj8HPzfyI07cFbQ';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'vyuXrJC0RnjlsNPbvKHA_wf9uMs0MiYKJIQHR2H-znU';

// ── Email settings (read from env) ──
// Primary: RESEND_API_KEY (Resend API)
// Fallback: SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT (legacy Nodemailer/Gmail)
// Shared: MAIL_FROM (sender address)

// ── SMS settings (read from env) ──
// FAST2SMS_API_KEY, FAST2SMS_SENDER_ID, FAST2SMS_ROUTE

// ── WhatsApp Cloud API settings (read from env) ──
// WA_TOKEN, WA_PHONE_ID, WA_API_VERSION, WA_TEMPLATE_STAGE, WA_TEMPLATE_LANG

// ── Android TWA ──
// ANDROID_PACKAGE, ANDROID_SHA256 (set in Railway)

// ── Session / idle timeout ──
const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes, matching the client-side auto-logout

// ── Audit trail ──
const AUDIT_MAX = 5000; // keep the most recent N entries so the DB file stays bounded

// ── Attendance cutoff for reminders ──
const ATTENDANCE_CUTOFF = process.env.ATTENDANCE_CUTOFF || '10:00'; // HH:MM local

// ── Office timing fallbacks (used if rules are blank) ──
const OFFICE_IN  = '09:30';
const OFFICE_OUT = '18:30';
const LATE_GRACE = '10:00';
const MIN_HOURS  = 9;

// ── Day constant ──
const MS_DAY = 86400000;

// ── Tender sync ──
const SYNC_PDF_PER_RUN = 5;
const ICAI_TMD_URL = 'https://tmdicai.org/Opportunities.php';

module.exports = {
  PORT,
  JWT_SECRET,
  DATA_DIR,
  DB_FILE,
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  IDLE_LIMIT_MS,
  AUDIT_MAX,
  ATTENDANCE_CUTOFF,
  OFFICE_IN,
  OFFICE_OUT,
  LATE_GRACE,
  MIN_HOURS,
  MS_DAY,
  SYNC_PDF_PER_RUN,
  ICAI_TMD_URL
};
