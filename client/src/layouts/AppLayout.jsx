import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

/* ------------------------------------------------------------------ */
/*  Route-to-page metadata mapping                                     */
/* ------------------------------------------------------------------ */

const PAGE_META = {
  '/dashboard':     { title: 'Dashboard',       section: 'Workspace' },
  '/assignments':   { title: 'Assignments',     section: 'Workspace' },
  '/approvals':     { title: 'Approvals',       section: 'Workspace' },
  '/attendance':    { title: 'Attendance',       section: 'Workspace' },
  '/recurring':     { title: 'Recurring Tasks', section: 'Workspace' },
  '/itr':           { title: 'ITR Filing',      section: 'Workspace' },
  '/leave':         { title: 'My Leave',        section: 'Workspace' },
  '/bizdev':        { title: 'Business Dev',    section: 'Workspace' },
  '/clients':       { title: 'Clients',         section: 'Firm' },
  '/team':          { title: 'Team Members',    section: 'Firm' },
  '/salary':        { title: 'Salary',          section: 'Firm' },
  '/reports':              { title: 'Reports',              section: 'Firm' },
  '/reports/performance':  { title: 'Performance Analytics', section: 'Firm' },
  '/reports/monthly':      { title: 'Monthly Report',       section: 'Firm' },
  '/reports/audit':        { title: 'Audit Trail',          section: 'Firm' },
  '/reports/workload':     { title: 'Workload Report',      section: 'Firm' },
  '/reports/overdue':      { title: 'Overdue Report',       section: 'Firm' },
  '/reports/client':       { title: 'Client Report',        section: 'Firm' },
  '/reports/leave':        { title: 'Leave Report',         section: 'Firm' },
  '/reports/attendance':   { title: 'Attendance Report',    section: 'Firm' },
  '/firm-profile':  { title: 'Firm Profile',    section: 'Firm' },
  '/settings':      { title: 'Settings',        section: 'Firm' },
  '/my-tasks':      { title: 'My Tasks',        section: 'Portal' },
  '/billing':       { title: 'Billing & Payments', section: 'Portal' },
  '/compliance':    { title: 'Compliance Calendar', section: 'Portal' },
};

/* ------------------------------------------------------------------ */
/*  Layout component                                                   */
/* ------------------------------------------------------------------ */

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Match current path to metadata (fall back to Dashboard)
  const meta = PAGE_META[location.pathname] || { title: 'Dashboard', section: 'Workspace' };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: always visible on desktop (lg+), slide-over on mobile */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        <Topbar
          title={meta.title}
          breadcrumb={meta.section}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
