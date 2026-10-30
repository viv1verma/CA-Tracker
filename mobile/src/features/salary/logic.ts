import type { TeamUser } from '../../data/types';

/**
 * pg-salary. Ported from initSalaryPage() / loadSalarySheet() / renderSalarySheet().
 * The page itself only reads: it fetches GET /api/email-status on load and one
 * GET /api/salary/:userId/:year/:month per eligible member when the sheet is
 * generated. The two POST email routes are the only mutations here.
 */

/** GET /api/salary/:userId/:year/:month — computeSalary()'s shape. */
export interface SalaryRecord {
  userId: string;
  userName: string;
  designation?: string;
  branch?: string;
  email?: string;
  joiningDate?: string;
  month: number;
  year: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateCount: number;
  paidLeaves: number;
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowance: number;
  grossSalary: number;
  perDaySalary: number;
  absenceDeduction: number;
  pf: number;
  esi: number;
  totalDeduction: number;
  netPay: number;
  leaveBalance?: { total?: number; used?: number; remaining?: number };
}

/** GET /api/email-status. */
export interface EmailStatus {
  configured: boolean;
  ready: boolean;
  verified: boolean;
  user: string;
  error?: string;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** salBranchSel, verbatim — a wider list than the app's two-branch switcher. */
export const SALARY_BRANCHES = [
  { value: '', label: 'All Branches' },
  { value: 'Greater Noida (HO)', label: 'Greater Noida (HO)' },
  { value: 'Agra (BO)', label: 'Agra (BO)' },
  { value: 'Pune (BO)', label: 'Pune (BO)' },
  { value: 'Delhi (BO)', label: 'Delhi (BO)' },
  { value: 'Indore (BO)', label: 'Indore (BO)' },
];

/**
 * isAttendanceMemberFE() — the web's client-side eligibility test: members only,
 * never partners, and only the Greater Noida head office is on attendance payroll.
 */
export function isAttendanceMemberFE(u: TeamUser): boolean {
  if (!u || u.role !== 'member') return false;
  if ((u.designation || '').toLowerCase().includes('partner')) return false;
  if (!(u.branch || '').toLowerCase().includes('greater noida')) return false;
  return true;
}

/** The member pool loadSalarySheet() walks, after the branch select narrows it. */
export function salaryMembers(users: TeamUser[], branch: string): TeamUser[] {
  return users.filter((u) => isAttendanceMemberFE(u) && (!branch || u.branch === branch));
}

/** ₹ with the en-IN grouping the web's toLocaleString('en-IN') produces. */
export const inr = (n: number | undefined) =>
  `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** The sheet's TOTAL PAYROLL footer. */
export function payrollTotals(rows: SalaryRecord[]) {
  return {
    gross: rows.reduce((s, x) => s + (x.grossSalary || 0), 0),
    deduction: rows.reduce((s, x) => s + (x.totalDeduction || 0), 0),
    pf: rows.reduce((s, x) => s + (x.pf || 0), 0),
    net: rows.reduce((s, x) => s + (x.netPay || 0), 0),
  };
}

/** The three states checkEmailStatus() renders above the sheet. */
export function emailBanner(s: EmailStatus | null):
{ text: string; bg: string; fg: string; border: string } | null {
  if (!s) return null;
  if (!s.configured) {
    return {
      text: '✉️ Email not set up — slips can be printed but not emailed. Ask admin to set SMTP on the server.',
      bg: '#fef3c7', fg: '#92400e', border: '#fde68a',
    };
  }
  if (s.verified) {
    return {
      text: `✅ Email ready (${s.user}) — slips can be emailed.`,
      bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0',
    };
  }
  return {
    text: `⚠️ Email configured (${s.user}) but the login failed to verify${s.error ? `: ${s.error}` : ''}. Check the App Password.`,
    bg: '#fef2f2', fg: '#991b1b', border: '#fecaca',
  };
}
