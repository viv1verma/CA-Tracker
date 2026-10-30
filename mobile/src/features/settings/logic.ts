import type { AuthUser } from '../../api/types';

/**
 * pg-password — "Settings". Four tabs, ported from initSettingsPage() and
 * setSettingsTab(): Account (+ Push), Rules, Office and Delegation of Authority.
 * Office and DoA are admin-only, exactly as initSettingsPage() hides their tabs;
 * every one of their routes is `adminOnly` server-side too.
 */

export type SettingsTab = 'account' | 'rules' | 'office' | 'doa';

export const SETTINGS_TABS: { key: SettingsTab; label: string; adminOnly: boolean }[] = [
  { key: 'account', label: '🔑 Account', adminOnly: false },
  { key: 'rules', label: '📋 Rules', adminOnly: false },
  { key: 'office', label: '⚙ Office', adminOnly: true },
  { key: 'doa', label: '🛡 Delegation of Authority', adminOnly: true },
];

export const visibleSettingsTabs = (u: AuthUser | null) =>
  SETTINGS_TABS.filter((t) => !t.adminOnly || u?.role === 'admin');

// ── Account ─────────────────────────────────────────────────────────────────

/** changePassword()'s three checks, in the web's own order and wording. */
export function passwordError(cur: string, nw: string, con: string): string | null {
  if (!cur || !nw || !con) return 'Fill all fields';
  if (nw.length < 6) return 'Min 6 chars';
  if (nw !== con) return 'Passwords do not match';
  return null;
}

// ── Rules ───────────────────────────────────────────────────────────────────

/** GET /api/rules. */
export interface FirmRules {
  canEdit?: boolean;
  updatedAt?: string;
  updatedBy?: string;
  officeIn?: string; officeOut?: string; lateGrace?: string;
  lunchStart?: string; lunchEnd?: string;
  fullDayHours?: number; fullDayHoursCA?: number; halfDayHours?: number;
  lateMarksPerHalfDay?: number;
  sundayOff?: boolean; weekOffSaturdays?: number[];
  paidLeavesPerYear?: number; joiningCutoffDay?: number;
  carryForwardMax?: number; leaveNoticeDays?: number; maxConsecutiveLeave?: number;
  sandwichRule?: boolean;
  compOffEnabled?: boolean; compOffExpiryDays?: number;
  wfhPerMonth?: number | null; wfhNeedsApproval?: boolean;
  probationMonths?: number; noticeDuringProbation?: number; noticeAfterConfirmation?: number;
  policySections?: { title?: string; body?: string }[];
}

export const SAT_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

/** The "Standard Rules — at a glance" table, LIVE/INFO tags and all. */
export function rulesSummary(r: FirmRules): { head: string; rows: { label: string; value: string; live: boolean; note?: string }[] }[] {
  const satTxt = (r.weekOffSaturdays || [2, 4]).map(Number).sort()
    .map((n) => SAT_LABEL[n]).filter(Boolean).join(', ') || 'none';
  const wfhTxt = (r.wfhPerMonth === null || r.wfhPerMonth === undefined || (r.wfhPerMonth as unknown) === '')
    ? 'Unlimited'
    : Number(r.wfhPerMonth) <= 0 ? 'Not allowed' : `${Number(r.wfhPerMonth)} days/mth`;
  const paid = r.paidLeavesPerYear || 18;

  return [
    { head: 'TIMINGS', rows: [
      { label: 'Office hours', value: `${r.officeIn || '-'} – ${r.officeOut || '-'}`, live: true },
      { label: 'Late after', value: r.lateGrace || '-', live: true, note: 'Punch in later = Late' },
      { label: 'Lunch', value: `${r.lunchStart || '-'} – ${r.lunchEnd || '-'}`, live: false, note: 'Not deducted' },
    ] },
    { head: 'FULL DAY / HALF DAY', rows: [
      { label: 'Full day — CA & Partners', value: `${r.fullDayHoursCA || 8} hrs`, live: true },
      { label: 'Full day — Others', value: `${r.fullDayHours || 9} hrs`, live: true, note: 'CS, articles, staff' },
      { label: 'Half day', value: `${r.halfDayHours || 4.5} hrs`, live: true, note: 'Below this = Absent' },
      { label: 'Late marks = 1 half day', value: String(r.lateMarksPerHalfDay || 3), live: false },
    ] },
    { head: 'WEEKLY OFF', rows: [
      { label: 'Sundays', value: r.sundayOff !== false ? 'Off' : 'Working', live: true },
      { label: 'Saturdays off', value: satTxt, live: true },
    ] },
    { head: 'LEAVE', rows: [
      { label: 'Paid leaves', value: `${paid} / year`, live: true, note: `${(paid / 12).toFixed(2)} per month` },
      { label: 'Carry forward', value: Number(r.carryForwardMax) > 0 ? `${r.carryForwardMax} days` : 'Lapses', live: false },
      { label: 'Notice for planned leave', value: `${r.leaveNoticeDays || 0} days`, live: false },
      { label: 'Max consecutive', value: Number(r.maxConsecutiveLeave) > 0 ? `${r.maxConsecutiveLeave} days` : 'No limit', live: false },
    ] },
    { head: 'WORK FROM HOME', rows: [
      { label: 'Firm policy', value: wfhTxt, live: true, note: 'Exceptions per employee below' },
      { label: 'Needs approval', value: r.wfhNeedsApproval !== false ? 'Yes' : 'No', live: true },
    ] },
    { head: 'COMPENSATORY OFF', rows: [
      { label: 'Comp-off', value: r.compOffEnabled !== false ? 'Allowed' : 'Not allowed', live: true },
      { label: 'Expires after', value: Number(r.compOffExpiryDays) > 0 ? `${r.compOffExpiryDays} days` : 'Never', live: false },
    ] },
    { head: 'PROBATION & NOTICE', rows: [
      { label: 'Probation', value: `${r.probationMonths || 0} months`, live: false },
      { label: 'Notice in probation', value: `${r.noticeDuringProbation || 0} days`, live: false },
      { label: 'Notice after confirmation', value: `${r.noticeAfterConfirmation || 0} days`, live: false },
    ] },
  ];
}

/**
 * saveRules()'s one guard: a half day that is not shorter than the shortest full
 * day. The web confirms and warns that the server will reset it.
 */
export function halfDayWarning(full: number, fullCA: number, half: number): string | null {
  const minFull = Math.min(full || 9, fullCA || 8);
  if (minFull && half >= minFull) {
    return `Half-day hours (${half}) are not less than the shortest full day (${minFull}h).\n\nThe system will reset half day to ${minFull / 2}h. Continue?`;
  }
  return null;
}

// ── Per-employee rule overrides ─────────────────────────────────────────────

/** RO_GROUPS, verbatim — the order the override editor lays fields out in. */
export const RO_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Working hours', keys: ['fullDayHours', 'halfDayHours'] },
  { title: 'Timings', keys: ['officeIn', 'officeOut', 'lateGrace', 'lateMarksPerHalfDay'] },
  { title: 'Leave', keys: ['paidLeavesPerYear', 'carryForwardMax', 'leaveNoticeDays', 'maxConsecutiveLeave', 'joiningCutoffDay'] },
  { title: 'Work from home', keys: ['wfhPerMonth', 'wfhNeedsApproval'] },
  { title: 'Compensatory off', keys: ['compOffEnabled', 'compOffExpiryDays'] },
  { title: 'Notice period', keys: ['probationMonths', 'noticeDuringProbation', 'noticeAfterConfirmation'] },
];

export interface RoSchema {
  fields: { key: string; label: string; kind: 'bool' | 'time' | 'number'; unit?: string }[];
  notOverridable: string[];
  note?: string;
}

export interface RoRow {
  user: { id: string; name: string; designation?: string; branch?: string };
  count: number;
  values: Record<string, unknown>;
}

export interface RoDetail {
  user: { id: string; name: string; designation?: string; branch?: string };
  values: Record<string, unknown>;
  firm: Record<string, unknown>;
  wfhUsedThisMonth?: number;
  setBy?: string;
  setAt?: string;
  history?: { at: string; byName: string; changes?: string[]; reason?: string }[];
}

/** roFmt(): blank means "no limit", never a stored zero. */
export function roFmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'unlimited';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return String(v);
}

// ── Office ──────────────────────────────────────────────────────────────────

export interface OfficeSettings {
  mobileOnlyPunch?: boolean;
  wifiCheckEnabled?: boolean;
  officeIPs?: string[];
  [k: string]: unknown;
}

export interface MyIp {
  detectedIp: string;
  forwardedChain?: string[];
  remoteAddress?: string;
}

/** showMyIP()'s prefix suggestion: the first three octets of an IPv4. */
export function ipPrefixSuggestion(ip: string): string {
  const parts = (ip || '').split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') : ip;
}

export interface HolidayData {
  year: number;
  catalog: { date: string; name: string; day: string; type?: string; selected?: boolean }[];
  custom: { date: string; name: string }[];
}

// ── Delegation of Authority ─────────────────────────────────────────────────

export interface Delegation {
  capabilities: { key: string; group: string; label: string; description: string }[];
  grants: Record<string, string[]>;
  limits: {
    id: string; matter?: string; approverId?: string; approverName?: string;
    limitAmount?: number; unlimited?: boolean; notes?: string;
  }[];
  updatedAt?: string;
  updatedBy?: string;
  people: { id: string; name: string; role: string; designation?: string; branch?: string }[];
}

/**
 * renderDoaMatrix(): admins are never listed as editable — they hold every
 * capability and cannot be locked out — and delegation.manage stays admin-only.
 */
export const LOCKED_CAPABILITY = 'delegation.manage';

export const doaStaff = (d: Delegation) => d.people.filter((p) => p.role !== 'admin');
export const doaAdmins = (d: Delegation) => d.people.filter((p) => p.role === 'admin');
