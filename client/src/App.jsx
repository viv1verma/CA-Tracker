import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Assignments from './pages/Assignments/Assignments';
import Approvals from './pages/Approvals/Approvals';
import MyAttendance from './pages/Attendance/MyAttendance';
import PunchStatus from './pages/Attendance/PunchStatus';
import MyLeave from './pages/Leave/MyLeave';
import Salary from './pages/Salary/Salary';
import Clients from './pages/Clients/Clients';
import Team from './pages/Team/Team';
import BizDev from './pages/BizDev/BizDev';
import RequireAuth from './components/RequireAuth';

/* ---------- Lazy-loaded page components ---------- */

// Recurring Tasks
const RecurringDashboard = lazy(() => import('./pages/RecurringTasks/RecurringDashboard'));

// ITR
const ItrDashboard = lazy(() => import('./pages/ITR/ItrDashboard'));

// Reports
const Reports = lazy(() => import('./pages/Reports/Reports'));
const PerformanceReport = lazy(() => import('./pages/Reports/PerformanceReport'));
const MonthlyReport = lazy(() => import('./pages/Reports/MonthlyReport'));
const AuditLog = lazy(() => import('./pages/Reports/AuditLog'));
const WorkloadReport = lazy(() => import('./pages/Reports/WorkloadReport'));
const OverdueReport = lazy(() => import('./pages/Reports/OverdueReport'));
const ClientReport = lazy(() => import('./pages/Reports/ClientReport'));
const LeaveReport = lazy(() => import('./pages/Reports/LeaveReport'));
const AttendanceReport = lazy(() => import('./pages/Reports/AttendanceReport'));

// Firm Profile
const FirmProfile = lazy(() => import('./pages/FirmProfile/FirmProfile'));

// Settings
const Settings = lazy(() => import('./pages/Settings/Settings'));

// Client Portal
const ClientPortal = lazy(() => import('./pages/ClientPortal/ClientPortal'));
const ClientBilling = lazy(() => import('./pages/ClientPortal/ClientBilling'));
const ClientCompliance = lazy(() => import('./pages/ClientPortal/ClientCompliance'));

/* ---------- Loading fallback ---------- */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400 font-medium">Loading...</span>
      </div>
    </div>
  );
}

function AttendanceRoute() {
  const { isAdmin } = useAuth();
  return isAdmin ? <PunchStatus /> : <MyAttendance />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
              </Route>

              {/* Protected routes */}
              <Route element={<RequireAuth />}>
                <Route element={<DataProvider><AppLayout /></DataProvider>}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />

                  {/* Workspace */}
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/assignments" element={<Assignments />} />
                  <Route path="/approvals" element={<Approvals />} />
                  <Route path="/attendance" element={<AttendanceRoute />} />
                  <Route path="/leave" element={<MyLeave />} />
                  <Route path="/recurring" element={<RecurringDashboard />} />
                  <Route path="/itr" element={<ItrDashboard />} />
                  <Route path="/bizdev" element={<BizDev />} />

                  {/* Firm */}
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/salary" element={<Salary />} />
                  <Route path="/firm-profile" element={<FirmProfile />} />
                  <Route path="/settings" element={<Settings />} />

                  {/* Reports */}
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/reports/performance" element={<PerformanceReport />} />
                  <Route path="/reports/monthly" element={<MonthlyReport />} />
                  <Route path="/reports/audit" element={<AuditLog />} />
                  {/* Report sub-pages */}
                  <Route path="/reports/workload" element={<WorkloadReport />} />
                  <Route path="/reports/overdue" element={<OverdueReport />} />
                  <Route path="/reports/client" element={<ClientReport />} />
                  <Route path="/reports/leave" element={<LeaveReport />} />
                  <Route path="/reports/attendance" element={<AttendanceReport />} />

                  {/* Client Portal */}
                  <Route path="/my-tasks" element={<ClientPortal />} />
                  <Route path="/billing" element={<ClientBilling />} />
                  <Route path="/compliance" element={<ClientCompliance />} />

                  {/* Catch-all */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
