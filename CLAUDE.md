# GARP Tracker

HRMS & Assignment Tracker for GARP & Associates (Chartered Accountancy firm, India). Production app deployed on Railway via Docker, serving ~20 users and ~50 clients.

**Production URL:** https://garp-tracker-production.up.railway.app/
**Railway project:** `stellar-gentleness` (workspace: ashu10061990's Projects)
**Repo:** git@github-garp:Ashu10061990/garp-tracker.git (branch: `main`)

## Tech Stack

### Backend
- **Runtime:** Node.js 18+ / Express 4
- **Database:** Single JSON file (`data/db.json`) — sync read/write via `db/index.js`
- **Auth:** JWT (12h expiry) + bcryptjs + single-session enforcement + 5-min idle timeout
- **Env management:** dotenv (`.env` file, gitignored)

### Frontend
- **Framework:** React 19 + Vite 6 (build tool)
- **Routing:** React Router v7 (SPA, all routes served from `/`)
- **Styling:** Tailwind CSS v4
- **State:** React Context + useReducer (AuthContext, DataContext, ToastContext)
- **UI Libraries:** framer-motion (animations), recharts (charts), lucide-react (icons), @headlessui/react v2 (tabs, dialogs)
- **Build output:** `public/dist/` (committed to repo, served by Express)

### Notification System (5 channels)
- **Email:** Resend (primary), Gmail SMTP (fallback) — auto-selects via `email.service.js`
- **SMS:** Fast2SMS (Indian DLT-compliant transactional SMS)
- **WhatsApp:** Meta Cloud API (template messages)
- **Web Push:** web-push library (VAPID)
- **In-app:** Stored in `db.notifications`

## Project Structure

```
server.js                  # Entry point — dotenv, DB init, start server + jobs
app.js                     # Express assembly — middleware, routes, static files, SPA catch-all
config/index.js            # All env-based constants
db/index.js                # readDB(), writeDB(), rules cache
middleware/
  auth.js                  # JWT auth, role checks (admin, itrAdmin, hrAdmin, partner, staff, client)
  security.js              # Blocked paths, cache-control, Android TWA
routes/
  index.js                 # Route index — mounts all 21 routers
  auth.routes.js           # POST /login, GET /me
  users.routes.js          # Team member CRUD
  clients.routes.js        # Client + group CRUD
  assignments.routes.js    # Task CRUD, approval flow, comments, client portal, recurring report
  recurring.routes.js      # Recurring templates, statutory catalog, generation
  invoices.routes.js       # Invoice register, billing dashboards, pivot, bank position
  compliance.routes.js     # GST/TDS/PF/ESI/ITR/ROC compliance tracker
  itr.routes.js            # ITR filing tracker with stage management
  attendance.routes.js     # Punch in/out, reports, summary, monthly grid
  leaves.routes.js         # Leave requests, balance, approval, migration
  holidays.routes.js       # Holiday calendar (includes INDIA_HOLIDAY_CALENDAR data)
  compOffs.routes.js       # Compensatory off management
  salary.routes.js         # Payroll computation, salary slips, email
  siteVisits.routes.js     # Site visit logging
  dueDateRequests.routes.js  # Due date change requests + audit log
  reopenRequests.routes.js   # Task reopen requests
  leads.routes.js          # Business development leads pipeline
  tenders.routes.js        # Government tender tracking, ICAI TMD sync, PDF analysis
  firmProfile.routes.js    # Firm profile, ICAI card parsing, audit experience
  notifications.routes.js  # In-app notifications CRUD, push subscribe/test
  settings.routes.js       # Settings, rules, performance, monthly report
  admin.routes.js          # Health, backup/restore, audit log, reports, notification config
services/
  channel-dispatcher.service.js  # Central notification dispatcher — dispatchNotification()
  notification-templates.js      # 17 event templates with {{var}} interpolation
  notification.service.js        # Web push (sendPushToUser) + in-app (notifyUser)
  email.service.js               # Smart email provider selector (Resend or SMTP)
  resend-email.service.js        # Resend API wrapper
  email.service.legacy.js        # Legacy Nodemailer/SMTP (auto-fallback)
  sms.service.js                 # Fast2SMS integration
  whatsapp.service.js            # Meta WhatsApp Cloud API
  audit.service.js               # Audit trail logging (logAudit, logDueDateChange)
  invoice.service.js             # Invoice/billing computation helpers
jobs/
  scheduler.js             # Background jobs — imports from route modules, NOT duplicated
utils/
  helpers.js               # Pure utilities (newId, num, fmt, diffFields, reqIp, etc.)
client/                    # React source (separate package.json)
  vite.config.js           # Builds to ../public/dist/, dev proxy to :3000
  src/
    main.jsx               # Entry → renders <App/>
    App.jsx                # AuthProvider + Router + Layouts (lazy loading for code splitting)
    api/client.js          # fetch wrapper — replaces old global api() function
    context/
      AuthContext.jsx      # token, user, login/logout, idle timeout, role helpers
      DataContext.jsx      # clients, assigns, users, notifs + 30s auto-refresh
      ToastContext.jsx     # toast notification queue
    hooks/
      useAutoRefresh.js    # 30s polling + visibility/focus refresh
      useModal.js          # Modal open/close state
    layouts/
      AppLayout.jsx        # Sidebar + Topbar + Outlet (with PAGE_META breadcrumbs)
      AuthLayout.jsx       # Login wrapper
    components/
      Sidebar.jsx          # Fixed left nav — role-based items, lucide icons, NavLink active state
      Topbar.jsx           # Breadcrumb + global search (filters clients/assignments/team) + notification bell
      RequireAuth.jsx      # Route guard
      ui/                  # Avatar, Badge, Button, Card, StatCard, ProgressBar, Modal, ConfirmDialog, EmptyState
    pages/
      Login/Login.jsx              # Split layout — branding left, form right, framer-motion
      Dashboard/                   # StatCards, RecentAssignments, AssignmentsByStatus, DueThisWeek
      Assignments/                 # Assignments list, AssignmentForm, AssignmentDetail
      Approvals/Approvals.jsx      # Tabbed: completion approvals, DDR, reopen requests
      Attendance/                  # MyAttendance (punch + calendar), PunchStatus (admin grid + monthly report)
      RecurringTasks/              # RecurringDashboard (heatmap), RecurringSetup (template CRUD)
      ITR/ItrDashboard.jsx         # Pipeline stages, chat comments, bulk import
      Clients/                     # Card grid, ClientForm, ClientProfile (tabbed)
      Team/                        # Card grid, UserForm, MemberProfile (recharts pie)
      Salary/                      # Salary table, SalarySlip (print-friendly)
      Reports/                     # Hub + PerformanceReport, MonthlyReport, AuditLog
      BizDev/                      # Leads + Tenders tabs, LeadForm, TenderDetail
      Leave/MyLeave.jsx            # Balance donut charts, apply form, history
      FirmProfile/FirmProfile.jsx  # Profile/Experience/Holidays tabs
      Settings/Settings.jsx        # Password, office rules, notification config (17 events × 5 channels)
      ClientPortal/                # ClientPortal, ClientBilling (recharts), ClientCompliance (grid)
    utils/
      constants.js         # WORK_TYPES, STATUS_COLORS, AVATAR_COLORS
      format.js            # fmt, fmtAny, fmtDT, fmtPeriod, freqLabel
      helpers.js           # ini, avatarColor, isOverdue, daysOld, pct
      roles.js             # canManage, isHrAdmin, canManageTeam, isPartner, isAttendanceMember
    styles/globals.css     # Tailwind imports + custom theme colors
public/
  dist/                    # Vite build output (committed — Express serves from here)
  legacy.html              # Old vanilla frontend (renamed from index.html)
  js/legacy-app.js         # Old vanilla JS (renamed from app.js)
  css-legacy/              # Old CSS files (renamed from css/)
  sw.js                    # Service worker (PWA offline + push)
  manifest.json            # PWA manifest
```

## Key Patterns

### Database
- **Synchronous JSON file I/O:** `readDB()` returns full JSON, mutate in memory, `writeDB(db)` writes back.
- **Collections:** Top-level arrays/objects in `db.json` — users, clients, assignments, attendance, leaves, leaveRequests, holidays, compOffs, salaryConfig, invoices, bankBalances, outflows, etc.
- **IDs:** `newId()` → `Date.now().toString(36) + random`.
- **Notification channel config:** `db.notificationChannelConfig` — per-event channel toggles (admin-configurable).

### Auth Roles
- `admin` — full access
- `member` — team member (CA staff)
- `client` — external client portal
- `itrclient` — ITR party self-service
- Special flags: `itrAdmin` (e.g., Annpurna), `hrAdmin` (e.g., Meenu Jha), `payrollAccess`, designation containing "partner"

### Notification System
All notifications go through `dispatchNotification(db, eventKey, recipients, vars, opts)` in `channel-dispatcher.service.js`. 17 events defined in `notification-templates.js` with `{{var}}` interpolation.

**Channel routing:** Defaults in templates → overridable per-event in `db.notificationChannelConfig` → per-call overrides via `opts.channelOverrides`.

**Admin API:** `GET/PUT /api/notification-config`, `POST /api/notification-config/test`

### React Frontend Architecture
- **Routing:** React Router v7 with lazy-loaded pages (code splitting). `AppLayout` wraps all authenticated routes. `PAGE_META` maps routes to breadcrumb titles.
- **State:** `AuthContext` (user, token, role helpers), `DataContext` (all entity arrays + 30s auto-refresh), `ToastContext`.
- **API calls:** `api(method, path, body, opts)` in `api/client.js` — auto-adds JWT header, handles 401 → logout, supports background polling with `X-Background: 1`.
- **Modals:** Single `Modal` component using @headlessui `Dialog` + `Transition`. Used by all forms/details across the app.
- **Search:** Topbar global search filters across clients, assignments, and team in real-time.

### Recurring Assignments
Templates in `db.recurringTemplates` with `active` boolean flag (NOT `status`). Fields: `clientId`, `workType`, `memberId`, `memberName`, `reportingPersonId`, `reportingPersonName`, `frequency`, `dueDayOfMonth`, `priority`, `notes`. Generated monthly by `jobs/scheduler.js`.

### Indian Financial Year
FY runs April–March. Helper functions in `invoice.service.js`: `fyOf()`, `periodRange()`, `bucketsFor()`. Month index 3 = April = FY start.

## Commands

```bash
# Server
npm start                      # Start Express server (node server.js)
node server.js                 # Same — dotenv auto-loaded

# React development
cd client && npm run dev       # Vite dev server on :5173, proxies /api to :3000
cd client && npm run build     # Production build to ../public/dist/

# Deploy
git push origin main           # Auto-deploys via Railway (GitHub integration)
railway up                     # Manual deploy (must be linked to stellar-gentleness)
railway link                   # Link CLI to the production Railway project
```

## Environment Variables

All in `.env` (gitignored). See `.env.example` for the full list:

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 3000, Railway sets 8080) |
| `JWT_SECRET` | JWT signing secret |
| `DATA_DIR` | Database directory (default: ./data) |
| `RESEND_API_KEY` | Email via Resend (primary) |
| `SMTP_USER` / `SMTP_PASS` | Email via Gmail SMTP (fallback if no Resend key) |
| `FAST2SMS_API_KEY` | SMS via Fast2SMS |
| `FAST2SMS_SENDER_ID` | DLT sender ID (6 chars) |
| `WA_TOKEN` / `WA_PHONE_ID` | WhatsApp via Meta Cloud API |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | Web Push VAPID keys |
| `MAIL_FROM` | Email sender address |
| `ATTENDANCE_CUTOFF` | Time for attendance reminders (default: 10:00) |

## Deployment

- **Docker:** `Dockerfile` uses `node:18-alpine`, `npm install --production`, copies repo including `public/dist/` (pre-built React)
- **Railway:** Project `stellar-gentleness`, service `garp-tracker`, volume mounted at `/data`
- **Auto-deploy:** Pushes to `main` trigger Railway redeploy via GitHub integration
- **Manual deploy:** `railway up` (must be linked via `railway link`)
- **React builds** are committed to `public/dist/` — no build step needed in Docker

## Common Gotchas

### Backend
- `writeDB(db)` must be called after any mutation — the dispatcher mutates `db.notifications` and `db.pushSubscriptions` but does NOT call writeDB
- Hardcoded name checks: "Annpurna" → itrAdmin, "Meenu Jha" → hrAdmin in `middleware/auth.js`
- Salary routes use lazy `require()` to avoid circular deps with attendance/leaves routes
- The scheduler imports from route files (`attendance.routes`, `recurring.routes`, `leaves.routes`) — be careful with circular dependencies
- Recurring templates use `active` (boolean), NOT `status` — `t.active !== false` means active
- Recurring template fields: `dueDayOfMonth` (not `dueDay`), `reportingPersonId` (not `reportingTo`), must include `memberName` and `reportingPersonName`
- Attendance punch times are stored as `"HH:MM"` strings, NOT ISO dates — never parse with `new Date()`
- Leave request statuses are lowercase (`'pending'`, `'approved'`, `'rejected'`)

### Frontend (React)
- **@headlessui/react v2:** Use named imports (`TabGroup`, `TabList`, `TabPanel`, `TabPanels`), NOT dot notation (`Tab.Group`). Use `Transition`/`TransitionChild` for animations (NOT framer-motion AnimatePresence with Dialog)
- **Data IDs:** Backend uses `item.id`, NOT `item._id` — never use `_id` in React components
- **API path prefix:** `api()` auto-prepends `/api` — call `api('GET', '/clients')` not `api('GET', '/api/clients')`
- **Recurring report shape:** API returns `{ months: [{key, label}], rows: [{clientName, workType, cells: [null|{status}]}] }` — cells is an array indexed by position, NOT an object keyed by month
- **Performance report:** API returns a flat array of member objects, not `{members, summary}` — reshape in component
- **Monthly report:** API returns `{month, year, report: [...]}` — compute summary/breakdown from `report` array
- **Audit log:** Response uses `entries` (not `items`), timestamp field is `at` (not `timestamp`), subject is `label`
- **Leave balance:** API returns `{accrued, used, remaining, compOff}` — NOT separate objects per leave type
- **Salary config:** Employee name field is `name`, not `userName`
- **Client GSTIN:** Backend field is `gstin`, not `gst`
- **Completion approval:** Use `POST /assignments/:id/approve-completion` (not PUT with status change)
- **Notification config save:** Per-event `PUT /notification-config/:eventKey` (not bulk PUT)
- After building React (`npm run build`), commit `public/dist/` to the repo — Railway deploys from repo, not from Docker build

### SMS (Fast2SMS)
- Requires DLT-registered templates (Indian TRAI regulation)
- `dltTemplateId` in `notification-templates.js` must be filled after DLT portal registration
- SMS is skipped gracefully if no DLT template ID is set

### Email (Resend)
- Requires a verified sender domain in Resend dashboard
- `MAIL_FROM` address domain must match verified domain
- Falls back to SMTP automatically if `RESEND_API_KEY` is not set
