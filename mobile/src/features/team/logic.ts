import type { Assignment, TeamUser } from '../../data/types';
import { isOD } from '../assignments/logic';

/**
 * pg-team ("Team Members"). The staff roster with per-member workload, filters
 * and the employee profile panel. Ported from renderTeam() and showEmpProfile().
 */

/** A fuller user record than the shared TeamUser — the profile shows all of it. */
export interface Employee extends TeamUser {
  email?: string;
  mobile?: string;
  joiningDate?: string;
  dob?: string;
  anniversary?: string;
  openingLeave?: number;
  basicSalary?: number;
  hra?: number;
  conveyance?: number;
  otherAllowance?: number;
  isFirmPartner?: boolean;
  itrAdmin?: boolean;
  hrAdmin?: boolean;
  payrollAccess?: boolean;
  address?: string;
  emergencyContact?: string;
  pan?: string;
  aadhaar?: string;
  bankAccount?: string;
  ifsc?: string;
}

export const QUALIFICATIONS = ['CA', 'CS', 'CMA', 'B.Com', 'MBA', 'Others'];

export const TEAM_BRANCHES = [
  'Greater Noida (HO)', 'Pune (BO)', 'Agra (BO)', 'Delhi (BO)', 'Indore (BO)',
];

/** Qualification pill colours, from QC/QB in renderTeam. */
export const QUAL_COLOR: Record<string, [string, string]> = {
  CA: ['#ede9fe', '#7c3aed'],
  CS: ['#dcfce7', '#15803d'],
  CMA: ['#fef3c7', '#b45309'],
};

export const qualColor = (q?: string) => QUAL_COLOR[q || ''] || ['#f3f4f6', '#6b7280'];

/** Avatar hues, keyed off the first letter as the web does. */
const HUES = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed'];
export const avatarHue = (name: string) => HUES[(name || '?').charCodeAt(0) % HUES.length];

export const initials = (name: string) =>
  (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export type TeamSort = 'name' | 'tasks' | 'pending' | 'joining';

export const TEAM_SORTS: { value: TeamSort; label: string }[] = [
  { value: 'name', label: 'A → Z' },
  { value: 'tasks', label: 'Total Tasks' },
  { value: 'pending', label: 'Pending First' },
  { value: 'joining', label: 'Joining Date' },
];

/**
 * The roster excludes admins entirely, then filters on a search across name,
 * designation and branch, plus branch and qualification.
 */
export function filterTeam(
  users: Employee[],
  search: string,
  branch: string,
  qual: string,
  sort: TeamSort,
  assignments: Assignment[],
): Employee[] {
  const q = search.trim().toLowerCase();
  const list = users.filter((u) => {
    if (u.role === 'admin') return false;
    if (q
      && !u.name.toLowerCase().includes(q)
      && !(u.designation || '').toLowerCase().includes(q)
      && !(u.branch || '').toLowerCase().includes(q)) return false;
    if (branch && u.branch !== branch) return false;
    if (qual && u.qualification !== qual) return false;
    return true;
  });

  const count = (id: string) => assignments.filter((a) => a.memberId === id).length;
  const pending = (id: string) =>
    assignments.filter((a) => a.memberId === id && a.status === 'Pending').length;

  switch (sort) {
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'tasks': list.sort((a, b) => count(b.id) - count(a.id)); break;
    case 'pending': list.sort((a, b) => pending(b.id) - pending(a.id)); break;
    case 'joining': list.sort((a, b) => (a.joiningDate || '').localeCompare(b.joiningDate || '')); break;
  }
  return list;
}

/** The per-member workload columns. */
export function memberCounts(userId: string, assignments: Assignment[]) {
  const mine = assignments.filter((a) => a.memberId === userId);
  return {
    total: mine.length,
    pending: mine.filter((a) => a.status === 'Pending').length,
    done: mine.filter((a) => a.status === 'Completed').length,
    overdue: mine.filter((a) => isOD(a)).length,
  };
}

/** The four summary tiles above the roster. */
export function teamStats(users: Employee[], shown: number) {
  const staff = users.filter((u) => u.role !== 'admin');
  const quals: Record<string, number> = {};
  const branches = new Set<string>();
  staff.forEach((u) => {
    if (u.qualification) quals[u.qualification] = (quals[u.qualification] || 0) + 1;
    if (u.branch) branches.add(u.branch);
  });
  const top = Object.keys(quals)
    .sort((a, b) => quals[b] - quals[a])
    .slice(0, 2)
    .map((k) => `${k}:${quals[k]}`)
    .join(' · ');
  return [
    { label: 'Total Staff', value: String(staff.length), color: '#1a56db', bg: '#eff6ff' },
    { label: 'Qualifications', value: top || '—', color: '#7c3aed', bg: '#ede9fe' },
    { label: 'Branches', value: String(branches.size), color: '#059669', bg: '#ecfdf5' },
    { label: 'Showing', value: String(shown), color: '#d97706', bg: '#fffbeb' },
  ];
}

/** Gross pay preview, as the user form computes it live. */
export const grossOf = (e: Partial<Employee>) =>
  (Number(e.basicSalary) || 0) + (Number(e.hra) || 0)
  + (Number(e.conveyance) || 0) + (Number(e.otherAllowance) || 0);

export const rupees = (n?: number) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

/** The employee profile's tabs. */
export const PROFILE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'personal', label: 'Personal' },
  { key: 'work', label: 'Work' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'salary', label: 'Salary' },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]['key'];
