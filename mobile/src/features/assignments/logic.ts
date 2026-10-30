import type { AuthUser } from '../../api/types';
import { isOthers } from '../../auth/permissions';
import type { Assignment, AssignmentStatus, Client, TeamUser } from '../../data/types';

/** Status pill colours, copied from STATUS_BG in public/index.html. */
export const STATUS_BG: Record<string, [string, string]> = {
  'Pending': ['#fef3c7', '#92400e'],
  'In Progress': ['#dbeafe', '#1e40af'],
  'Under Review': ['#ede9fe', '#5b21b6'],
  'Completed': ['#dcfce7', '#15803d'],
  'On Hold': ['#f3f4f6', '#374151'],
};
export const sbg = (s?: string): [string, string] => STATUS_BG[s || 'Pending'] || ['#f3f4f6', '#374151'];

/** The filter chips on pg-assignments, in the web's order. */
export const STATUS_FILTERS: { value: '' | AssignmentStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Pending', label: '⏳ Pending' },
  { value: 'In Progress', label: '🔵 In Progress' },
  { value: 'Under Review', label: '🔷 Review' },
  { value: 'Completed', label: '✅ Done' },
  { value: 'On Hold', label: '⏸ Hold' },
];

export const STATUS_OPTIONS: AssignmentStatus[] =
  ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];

export const PRIORITY_OPTIONS = ['Normal', 'High', 'Urgent'] as const;

/** The Work Type list from the assignSheet <select>, with the manual sentinel last. */
export const WORK_TYPES = [
  'ITR Filing', 'GST Return', 'GSTR-1', 'GSTR-3B', 'TDS Return', 'TDS Monthly Deposit',
  'Audit', 'ROC Filing', 'Balance Sheet', 'Tax Planning', 'Payroll', 'MSME Registration',
  'PF/ESI Compliance', 'Loan Projection', 'MCA Filing', 'Trademark', 'Other',
];
export const MANUAL_WORK_TYPE = '__manual__';

export type SortKey = 'client' | 'member' | 'worktype' | 'status' | 'due' | 'days' | 'pct';
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'client', label: 'Client A-Z' },
  { value: 'member', label: 'Member A-Z' },
  { value: 'worktype', label: 'Work Type A-Z' },
  { value: 'status', label: 'Status A-Z' },
  { value: 'due', label: 'Due Date' },
  { value: 'days', label: 'Oldest First' },
  { value: 'pct', label: 'Progress %' },
];

// ── Date helpers (fmt / fmtAny / fmtDT from the web app) ─────────────────────
const p2 = (n: number) => String(n).padStart(2, '0');

/** fmt(): a plain YYYY-MM-DD due date rendered DD-MM-YYYY. */
export function fmt(d?: string | null): string {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return '—';
  return `${p2(dt.getDate())}-${p2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

/** fmtAny(): handles both ISO timestamps and plain dates. */
export function fmtAny(d?: string | null): string {
  if (!d) return '—';
  const s = String(d);
  const dt = s.includes('T') ? new Date(s) : new Date(`${s}T00:00:00`);
  if (isNaN(dt.getTime())) return '—';
  return `${p2(dt.getDate())}-${p2(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

/** fmtDT(): date + time, as the comment and activity rows show it. */
export function fmtDT(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = dt.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${p2(dt.getDate())} ${MN[dt.getMonth()]}, ${p2(h)}:${p2(dt.getMinutes())} ${ampm}`;
}

/** The canonical overdue rule: past end-of-day on the due date and not Completed. */
export function isOD(a: Assignment): boolean {
  return !!a.dueDate && new Date(`${a.dueDate}T23:59:59`) < new Date() && a.status !== 'Completed';
}

export function daysOld(a: Assignment): number {
  return Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 864e5);
}

/** The date input's YYYY-MM-DD form, which is what the API stores. */
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function parseISODate(s?: string | null): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date();
}

// ── Visibility / permissions (renderAssignments + the row action buttons) ────

/**
 * The pool of assignments this identity sees on pg-assignments. Admin sees all;
 * "Others" see only their own; everyone else sees what they work on or assigned
 * out, with supervise-only tasks excluded (those live in the Supervising page).
 */
export function assignmentPool(all: Assignment[], me: AuthUser | null): Assignment[] {
  if (!me) return [];
  if (me.role === 'admin') return all;
  return all.filter((a) => {
    if (isOthers(me)) return a.memberId === me.id;
    const superviseOnly =
      a.reportingPersonId === me.id && a.subAssignedBy !== me.id && a.memberId !== me.id;
    if (superviseOnly) return false;
    return a.memberId === me.id || a.subAssignedBy === me.id || a.parentAssigneeId === me.id;
  });
}

export const canEditAssignment = (a: Assignment, me: AuthUser | null) =>
  !!me && (me.role === 'admin' || a.subAssignedBy === me.id || a.reportingPersonId === me.id);

/** Same predicate the web uses to show the row's delete button. */
export const canDeleteAssignment = canEditAssignment;

export const isOwnTask = (a: Assignment, me: AuthUser | null) => !!me && a.memberId === me.id;

/** The reminder button is hidden on your own task; the server also requires reporter/admin. */
export const canRemind = (a: Assignment, me: AuthUser | null) => !!me && a.memberId !== me.id;

export const canComment = (a: Assignment, me: AuthUser | null) =>
  !!me && (a.memberId === me.id || a.reportingPersonId === me.id || me.role === 'admin');

/** Completion approval: the reporting manager, or admin. */
export const canApproveCompletion = (a: Assignment, me: AuthUser | null) =>
  !!me && !!a.awaitingApproval &&
  ((!!a.reportingPersonId && a.reportingPersonId === me.id) || me.role === 'admin');

/** Only CA-qualified members (or admin) may change a due date. */
export const canEditDueDate = (me: AuthUser | null) =>
  !!me && (me.role === 'admin' || me.qualification === 'CA');

// ── Filtering and sorting (renderAssignments) ────────────────────────────────

export interface ListFilters {
  search: string;
  memberId: string;
  status: '' | AssignmentStatus;
  sort: SortKey;
}

export function filterAndSort(
  pool: Assignment[],
  filters: ListFilters,
  clientsById: Record<string, Client>,
): Assignment[] {
  const srch = filters.search.trim().toLowerCase();
  const out = pool.filter((a) => {
    if (filters.memberId && a.memberId !== filters.memberId) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (srch) {
      const hay = `${clientsById[a.clientId]?.name || ''} ${a.memberName || ''} ${a.workType}`.toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    return true;
  });

  const byName = (a: Assignment) => clientsById[a.clientId]?.name || '';
  switch (filters.sort) {
    case 'client': out.sort((a, b) => byName(a).localeCompare(byName(b))); break;
    case 'member': out.sort((a, b) => (a.memberName || '').localeCompare(b.memberName || '')); break;
    case 'worktype': out.sort((a, b) => (a.workType || '').localeCompare(b.workType || '')); break;
    case 'status': out.sort((a, b) => (a.status || '').localeCompare(b.status || '')); break;
    case 'due': out.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')); break;
    case 'days': out.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); break;
    case 'pct': out.sort((a, b) => (b.completionPct || 0) - (a.completionPct || 0)); break;
  }
  return out;
}

/** Members offered in the "All Members" filter and the assignee pickers. */
export const memberUsers = (users: TeamUser[]) => users.filter((u) => u.role === 'member');
