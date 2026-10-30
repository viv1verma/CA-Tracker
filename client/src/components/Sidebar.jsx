import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ini, avatarColor } from '../utils/helpers';

/* ------------------------------------------------------------------ */
/*  SVG Icon components (inline, no external library)                  */
/* ------------------------------------------------------------------ */

const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-2a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
    </svg>
  ),
  clipboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  checkCircle: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  clock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  refresh: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  fileText: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  userGroup: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  dollar: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  barChart: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  building: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  gear: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  briefcase: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0h2a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h2" />
    </svg>
  ),
  creditCard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  calendarCheck: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 16l2 2 4-4" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Navigation item component                                         */
/* ------------------------------------------------------------------ */

function SidebarLink({ to, icon, label, badge, onClose }) {
  return (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }) {
  return (
    <h3 className="px-3 pt-5 pb-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                  */
/* ------------------------------------------------------------------ */

export default function Sidebar({ isOpen, onClose }) {
  const {
    user, logout,
    isAdmin, isMember, isClient, isItrClient,
    isPartner, hasPayrollAccess, canManage,
  } = useAuth();

  const [bg, fg] = avatarColor(user?.name);
  const initials = ini(user?.name);

  /* Determine which role category to show */
  const isStaff = isAdmin || isMember;
  const isAnyClient = isClient || isItrClient;

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-gray-200
          flex flex-col transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* ---- Header / Branding ---- */}
        <div className="flex items-center gap-2 px-5 h-16 border-b border-gray-100 flex-shrink-0">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-0.5">
              <span className="text-xl font-extrabold tracking-tight text-primary-dark">GARP</span>
              <span className="text-xl font-extrabold tracking-tight text-amber-500">&amp; Associates</span>
            </div>
            <span className="text-[9px] font-semibold tracking-[0.2em] text-gray-400 uppercase -mt-0.5">
              Chartered Accountants
            </span>
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {/* --- WORKSPACE section (staff) --- */}
          {isStaff && (
            <>
              <SectionLabel>Workspace</SectionLabel>
              <SidebarLink to="/dashboard" icon={icons.dashboard} label="Dashboard" onClose={onClose} />
              {isAdmin && (
                <SidebarLink to="/assignments" icon={icons.clipboard} label="Assignments" onClose={onClose} />
              )}
              {isMember && !isAdmin && (
                <SidebarLink to="/assignments" icon={icons.clipboard} label="My Tasks" onClose={onClose} />
              )}
              <SidebarLink to="/approvals" icon={icons.checkCircle} label="Approvals" onClose={onClose} />
              <SidebarLink to="/attendance" icon={icons.clock} label="Attendance" onClose={onClose} />
              <SidebarLink to="/recurring" icon={icons.refresh} label="Recurring Tasks" onClose={onClose} />
              <SidebarLink to="/itr" icon={icons.fileText} label="ITR Filing" onClose={onClose} />
              {isMember && (
                <SidebarLink to="/leave" icon={icons.calendar} label="My Leave" onClose={onClose} />
              )}
              {isPartner && (
                <SidebarLink to="/bizdev" icon={icons.briefcase} label="Business Dev" onClose={onClose} />
              )}
            </>
          )}

          {/* --- FIRM section (admin, partial for members) --- */}
          {isStaff && (
            <>
              <SectionLabel>Firm</SectionLabel>
              {(isAdmin || canManage) && (
                <SidebarLink to="/clients" icon={icons.users} label="Clients" onClose={onClose} />
              )}
              {(isAdmin || canManage) && (
                <SidebarLink to="/team" icon={icons.userGroup} label="Team Members" onClose={onClose} />
              )}
              {hasPayrollAccess && (
                <SidebarLink to="/salary" icon={icons.dollar} label="Salary" onClose={onClose} />
              )}
              <SidebarLink to="/reports" icon={icons.barChart} label="Reports" onClose={onClose} />
              {isAdmin && (
                <SidebarLink to="/firm-profile" icon={icons.building} label="Firm Profile" onClose={onClose} />
              )}
              {isAdmin && (
                <SidebarLink to="/settings" icon={icons.gear} label="Settings" onClose={onClose} />
              )}
            </>
          )}

          {/* --- CLIENT PORTAL section --- */}
          {isAnyClient && (
            <>
              <SectionLabel>Portal</SectionLabel>
              <SidebarLink to="/dashboard" icon={icons.dashboard} label="Dashboard" onClose={onClose} />
              <SidebarLink to="/my-tasks" icon={icons.clipboard} label="My Tasks" onClose={onClose} />
              <SidebarLink to="/billing" icon={icons.creditCard} label="Billing & Payments" onClose={onClose} />
              <SidebarLink to="/compliance" icon={icons.calendarCheck} label="Compliance Calendar" onClose={onClose} />
            </>
          )}
        </nav>

        {/* ---- User profile footer ---- */}
        <div className="flex-shrink-0 border-t border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: bg, color: fg }}
            >
              {initials}
            </div>
            {/* Name + role */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-400 truncate capitalize">{user?.designation || user?.role || ''}</p>
            </div>
            {/* Logout button */}
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Logout"
            >
              {icons.logout}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
