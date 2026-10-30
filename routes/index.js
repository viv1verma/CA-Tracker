// ═══════════════════════════════════════════════════════════
// routes/index.js — Mount all route modules
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();

const authRoutes           = require('./auth.routes');
const usersRoutes          = require('./users.routes');
const clientsRoutes        = require('./clients.routes');
const assignmentsRoutes    = require('./assignments.routes');
const recurringRoutes      = require('./recurring.routes');
const invoicesRoutes       = require('./invoices.routes');
const complianceRoutes     = require('./compliance.routes');
const itrRoutes            = require('./itr.routes');
const attendanceRoutes     = require('./attendance.routes');
const leavesRoutes         = require('./leaves.routes');
const holidaysRoutes       = require('./holidays.routes');
const compOffsRoutes       = require('./compOffs.routes');
const salaryRoutes         = require('./salary.routes');
const siteVisitsRoutes     = require('./siteVisits.routes');
const dueDateReqRoutes     = require('./dueDateRequests.routes');
const reopenReqRoutes      = require('./reopenRequests.routes');
const leadsRoutes          = require('./leads.routes');
const tendersRoutes        = require('./tenders.routes');
const firmProfileRoutes    = require('./firmProfile.routes');
const notificationsRoutes  = require('./notifications.routes');
const settingsRoutes       = require('./settings.routes');
const adminRoutes          = require('./admin.routes');

// ── Auth & Users (paths: /api/login, /api/me, /api/users) ──
router.use('/api', authRoutes);
router.use('/api', usersRoutes);

// ── Clients & Groups (paths: /api/clients, /api/groups) ──
router.use('/api', clientsRoutes);

// ── Assignments (paths: /api/assignments, /api/assignments/:id/...) ──
router.use('/api', assignmentsRoutes);

// ── Recurring (paths: /api/recurring-templates, /api/statutory/...) ──
router.use('/api', recurringRoutes);

// ── Invoices & Billing (paths: /api/clients/:id/invoices, /api/client/..., /api/invoices/...) ──
router.use('/api', invoicesRoutes);

// ── Compliance (paths: /api/clients/:id/compliance, /api/client/compliance) ──
router.use('/api', complianceRoutes);

// ── ITR Filing (paths: /api/itr/parties, /api/itr/export.xlsx, etc.) ──
router.use('/api/itr', itrRoutes);

// ── Attendance (paths: /api/attendance/punch-in, etc.) ──
router.use('/api/attendance', attendanceRoutes);

// ── Leaves (paths: /api/leaves, /api/leave-requests, /api/leave-report, etc.) ──
router.use('/api', leavesRoutes);

// ── Holidays (paths: /api/holidays) ──
router.use('/api/holidays', holidaysRoutes);

// ── Comp-offs (paths: /api/comp-offs) ──
router.use('/api/comp-offs', compOffsRoutes);

// ── Salary (paths: /api/salary-config, /api/salary/:userId/...) ──
router.use('/api', salaryRoutes);

// ── Site Visits (paths: /api/site-visits) ──
router.use('/api/site-visits', siteVisitsRoutes);

// ── Due Date Requests (paths: /api/due-date-requests, /api/due-date-log) ──
router.use('/api', dueDateReqRoutes);

// ── Reopen Requests (paths: /api/reopen-requests) ──
router.use('/api/reopen-requests', reopenReqRoutes);

// ── Leads (paths: /api/leads) ──
router.use('/api/leads', leadsRoutes);

// ── Tenders (paths: /api/tenders) ──
router.use('/api/tenders', tendersRoutes);

// ── Firm Profile (paths: /api/firm-profile) ──
router.use('/api/firm-profile', firmProfileRoutes);

// ── Notifications (paths: /api/notifications) ──
router.use('/api/notifications', notificationsRoutes);
// Push endpoints are at /api level (vapid-public-key, push-subscribe, etc.)
router.use('/api', notificationsRoutes.pushRouter);

// ── Settings & Rules (paths: /api/settings, /api/rules, /api/my-ip, /api/performance, /api/monthly-report) ──
router.use('/api', settingsRoutes);

// ── Admin (paths: /api/audit-log, /api/backup, /api/restore, /api/reports/...) ──
router.use('/api', adminRoutes);

// ── Health check at root level ──
const { healthHandler } = require('./admin.routes');
router.get('/health', healthHandler);

module.exports = router;
