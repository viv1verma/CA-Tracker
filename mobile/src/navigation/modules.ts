import type { AuthUser } from '../api/types';
import {
  can, canSubAssign, clientSees, hasPayrollAccess, isAdmin, isClientPortal,
  isHOContext, isItrAdmin, isOthers, isPartner, isStaff,
} from '../auth/permissions';

/**
 * The module registry — one entry per module in the approved parity matrix.
 * Navigation is generated from this list, so adding a module in Phase B means
 * implementing its screen and flipping `status`, never editing the navigator.
 *
 * `visible` mirrors buildDrawer()/buildNav() in public/index.html item for item.
 * Anything a user cannot reach on web is absent here — not greyed out.
 */
export type ModuleId =
  | 'dashboard' | 'assignments' | 'myassign' | 'submanage' | 'supervising'
  | 'recdash' | 'recurring' | 'approvals'
  | 'punchstatus' | 'attendance' | 'myleave'
  | 'compcal' | 'statutory' | 'itrdash' | 'bizdev' | 'mail'
  | 'clients' | 'team' | 'salary' | 'reports'
  | 'firmprofile' | 'notifications' | 'myprofile' | 'password'
  | 'clientportal' | 'clientbilling' | 'clientcompliance' | 'itrclient';

export type ModuleStatus = 'planned' | 'building' | 'done';

export interface ModuleDef {
  id: ModuleId;
  /** The web page's own title, so both apps use the same words. */
  title: string;
  icon: string;
  /** Grouping in the Menu screen; mirrors the web drawer's dividers. */
  group: 'Work' | 'People' | 'Finance' | 'Firm' | 'Account' | 'Portal';
  /** The web page this reproduces — the parity anchor. */
  webPage: string;
  status: ModuleStatus;
  visible: (u: AuthUser | null, branch: string) => boolean;
}

const isMember = (u: AuthUser | null) => u?.role === 'member';

export const MODULES: ModuleDef[] = [
  // ── Work ──────────────────────────────────────────────────────────────────
  { id: 'punchstatus', title: 'Attendance', icon: '🕐', group: 'Work', webPage: 'pg-punchstatus', status: 'done',
    // Admin always; a member only with payroll access (web: me.payrollAccess).
    visible: (u) => hasPayrollAccess(u) },
  { id: 'dashboard', title: 'One-Time Tasks', icon: '📋', group: 'Work', webPage: 'pg-dashboard', status: 'done',
    visible: (u) => isAdmin(u) },
  { id: 'assignments', title: 'Assignments', icon: '☑', group: 'Work', webPage: 'pg-assignments', status: 'done',
    // Admin's landing page; members reach it from the bottom nav unless "Others".
    visible: (u) => isAdmin(u) || (isMember(u) && !isOthers(u)) },
  { id: 'myassign', title: 'My Tasks', icon: '📋', group: 'Work', webPage: 'pg-myassign', status: 'done',
    visible: (u) => isMember(u) },
  { id: 'recdash', title: 'Recurring Tasks', icon: '🔄', group: 'Work', webPage: 'pg-recdash', status: 'done',
    visible: (u) => isAdmin(u) },
  { id: 'recurring', title: 'Recurring Setup', icon: '🔄', group: 'Work', webPage: 'pg-recurring', status: 'done',
    visible: (u) => isMember(u) && canSubAssign(u) },
  { id: 'submanage', title: 'My Team', icon: '👥', group: 'Work', webPage: 'pg-submanage', status: 'done',
    // Web also requires the member to have sub-assigned work; that check needs
    // /api/assignments and is applied in Phase B once the data is loaded.
    visible: (u) => isMember(u) && canSubAssign(u) },
  { id: 'supervising', title: 'Supervising', icon: '👁', group: 'Work', webPage: 'pg-supervising', status: 'done',
    // Same: web additionally requires supervised work to exist. Phase B.
    visible: (u) => isMember(u) },
  { id: 'approvals', title: 'Approvals', icon: '✅', group: 'Work', webPage: 'pg-approvals', status: 'done',
    visible: (u) => isAdmin(u) },
  { id: 'attendance', title: 'Attendance', icon: '🕐', group: 'Work', webPage: 'pg-attendance', status: 'done',
    visible: (u) => isMember(u) },
  { id: 'myleave', title: 'My Leave', icon: '🌴', group: 'Work', webPage: 'pg-myleave', status: 'done',
    visible: (u) => isMember(u) },
  { id: 'itrdash', title: 'ITR Filing', icon: '🧾', group: 'Work', webPage: 'pg-itrdash', status: 'done',
    // HO context only. Web also shows it to any member who has ITR parties;
    // that data check lands in Phase B with /api/itr/parties.
    visible: (u, branch) => isHOContext(branch) && (isAdmin(u) || (isMember(u) && isItrAdmin(u))) },
  { id: 'compcal', title: 'Compliance Calendar', icon: '🗓', group: 'Work', webPage: 'pg-compcal', status: 'planned',
    visible: (u) => isStaff(u) },
  { id: 'statutory', title: 'Statutory Updates', icon: '📢', group: 'Work', webPage: 'pg-statutory', status: 'done',
    visible: (u) => isStaff(u) },
  { id: 'bizdev', title: 'Business Dev', icon: '📈', group: 'Work', webPage: 'pg-bizdev', status: 'done',
    visible: (u) => isPartner(u) || can(u, 'bd.manage') },
  { id: 'mail', title: 'Mail', icon: '📧', group: 'Work', webPage: 'pg-mail', status: 'done',
    visible: (u) => isPartner(u) },

  // ── People ────────────────────────────────────────────────────────────────
  { id: 'clients', title: 'Clients', icon: '◉', group: 'People', webPage: 'pg-clients', status: 'done',
    visible: (u) => isStaff(u) },
  { id: 'team', title: 'Team Members', icon: '◈', group: 'People', webPage: 'pg-team', status: 'done',
    visible: (u) => isStaff(u) },

  // ── Finance & insight ─────────────────────────────────────────────────────
  { id: 'salary', title: 'Salary', icon: '💰', group: 'Finance', webPage: 'pg-salary', status: 'done',
    visible: (u) => hasPayrollAccess(u) },
  { id: 'reports', title: 'Reports', icon: '📊', group: 'Finance', webPage: 'pg-reports', status: 'done',
    visible: (u) => isAdmin(u) || (isMember(u) && !isOthers(u)) },

  // ── Firm ──────────────────────────────────────────────────────────────────
  { id: 'firmprofile', title: 'Firm Profile', icon: '🏛', group: 'Firm', webPage: 'pg-firmprofile', status: 'done',
    visible: (u) => isAdmin(u) },

  // ── Account (reachable for every signed-in identity) ───────────────────────
  { id: 'notifications', title: 'Notifications', icon: '🔔', group: 'Account', webPage: 'notification bell', status: 'done',
    visible: (u) => !!u },
  { id: 'myprofile', title: 'My Profile', icon: '👤', group: 'Account', webPage: 'showEmpProfile(me.id)', status: 'done',
    visible: (u) => isMember(u) },
  { id: 'password', title: 'Settings', icon: '⚙', group: 'Account', webPage: 'pg-password', status: 'done',
    visible: (u) => !!u },

  // ── Client / ITR portals ──────────────────────────────────────────────────
  { id: 'clientportal', title: 'My Tasks', icon: '📋', group: 'Portal', webPage: 'pg-clientportal', status: 'done',
    visible: (u) => u?.role === 'client' && clientSees(u, 'tasks') },
  { id: 'clientbilling', title: 'Billing & Payments', icon: '📊', group: 'Portal', webPage: 'pg-clientbilling', status: 'done',
    visible: (u) => u?.role === 'client' &&
      (clientSees(u, 'billing') || clientSees(u, 'cashflow') || clientSees(u, 'debtors')) },
  { id: 'clientcompliance', title: 'Compliance', icon: '🗓', group: 'Portal', webPage: 'pg-clientcompliance', status: 'done',
    visible: (u) => u?.role === 'client' },
  { id: 'itrclient', title: 'My ITR', icon: '🧾', group: 'Portal', webPage: 'pg-itrclient', status: 'done',
    visible: (u) => u?.role === 'itrclient' },
];

export const moduleById = (id: ModuleId) => MODULES.find((m) => m.id === id);

export function visibleModules(u: AuthUser | null, branch: string): ModuleDef[] {
  const portal = isClientPortal(u);
  return MODULES.filter((m) => {
    // Portal modules never appear for staff, and staff modules never for a portal login.
    if ((m.group === 'Portal') !== portal) {
      // 'password' / 'notifications' are the two the portals share with staff.
      if (!(portal && (m.id === 'password' || m.id === 'notifications'))) return false;
    }
    return m.visible(u, branch);
  });
}

/**
 * Where the app lands after sign-in, matching public/index.html exactly:
 * admin → assignments, member → myassign, client → clientportal,
 * itrclient → itrclient. The web app has no Command Center, so neither does this.
 */
export function landingModule(u: AuthUser | null): ModuleId {
  if (!u) return 'myassign';
  if (u.role === 'admin') return 'assignments';
  if (u.role === 'itrclient') return 'itrclient';
  if (u.role === 'client') return clientSees(u, 'tasks') ? 'clientportal' : 'clientbilling';
  return 'myassign';
}

/**
 * The bottom tabs, mirroring buildNav(). Web shows up to seven; a phone tab bar
 * holds four comfortably, so we take the first three and everything else stays
 * one tap away under Menu — no module is lost.
 */
export function tabsFor(u: AuthUser | null, branch: string): ModuleId[] {
  const visible = new Set(visibleModules(u, branch).map((m) => m.id));
  const wanted: ModuleId[] =
    u?.role === 'admin' ? ['assignments', 'dashboard', 'recdash', 'punchstatus', 'clients', 'team']
    : u?.role === 'member' ? ['myassign', 'attendance', 'assignments', 'recurring', 'submanage', 'supervising', 'clients', 'team']
    : u?.role === 'client' ? ['clientportal', 'clientbilling', 'clientcompliance']
    : u?.role === 'itrclient' ? ['itrclient']
    : [];
  return wanted.filter((id) => visible.has(id)).slice(0, 3);
}
