import { colors } from '../../theme/theme';

/**
 * pg-punchstatus ("Daily Attendance"). One row per attendance-eligible member for
 * a chosen day, plus the day-wise monthly report. Ported from initPunchStatus().
 */

/** One row of GET /api/attendance/today-all. */
export interface PunchStatusRow {
  userId: string;
  userName: string;
  designation?: string;
  branch?: string;
  date: string;
  punchIn?: string | null;
  punchOut?: string | null;
  workHours?: number;
  status?: string;
  isLate?: boolean;
  offSite?: boolean;
  remark?: string;
  site?: string;
}

/** GET /api/attendance/report. */
export interface MonthlyReport {
  days: { day: number; dow: string; working?: boolean }[];
  rows: {
    userId: string;
    userName: string;
    branch?: string;
    cells: { code: string }[];
    presentDays: number;
    absent: number;
    late: number;
  }[];
}

/** The leave labels the status column substitutes, verbatim from the web. */
export const LEAVE_LABELS: Record<string, string> = {
  'Casual Leave': '🌴 Casual Leave',
  'Sick Leave': '🤒 Sick Leave',
  'Earned Leave': '🌴 Earned Leave',
  'Leave Without Pay': '⛔ LWP',
  'Paid Leave': '🌴 Paid Leave',
  'Leave': '⛔ Leave',
  'Work from Home': '🏠 WFH',
  'Half Day': '◑ Half Day',
};

/**
 * The status cell: a site visit wins, then a named leave, otherwise the punch
 * state decides Done / In Office / Absent.
 */
export function statusCell(r: PunchStatusRow): { label: string; color: string } {
  const isSV = r.offSite || r.status === 'Site Visit';
  if (isSV) {
    return { label: `🗺 Site Visit${r.site ? ` · ${r.site}` : ''}`, color: '#0891b2' };
  }
  if (r.status && LEAVE_LABELS[r.status]) {
    return { label: LEAVE_LABELS[r.status], color: '#6b7280' };
  }
  if (r.punchIn && r.punchOut) return { label: 'Done', color: colors.green };
  if (r.punchIn) return { label: 'In Office', color: colors.amber };
  return { label: 'Absent', color: '#9ca3af' };
}

/** The four counters above the list. */
export function punchStats(rows: PunchStatusRow[]) {
  return [
    { label: 'Total', value: rows.length, color: '#1a56db', bg: '#eff6ff' },
    { label: 'In Office', value: rows.filter((r) => r.punchIn && !r.punchOut).length, color: '#d97706', bg: '#fffbeb' },
    { label: 'Done', value: rows.filter((r) => r.punchIn && r.punchOut).length, color: '#16a34a', bg: '#ecfdf5' },
    { label: 'Absent', value: rows.filter((r) => !r.punchIn).length, color: '#dc2626', bg: '#fef2f2' },
  ];
}

/** The hours cell: hours when complete, "Active" while punched in, else a dash. */
export const hoursCell = (r: PunchStatusRow) =>
  r.workHours ? `${r.workHours}h` : r.punchIn ? 'Active' : '—';

/** Report cell colours, matching the web's cellColor(). */
export function reportCellColor(code: string): { bg: string; fg: string } {
  const map: Record<string, [string, string]> = {
    P: ['#dcfce7', '#166534'],
    L: ['#fef9c3', '#854d0e'],
    A: ['#fee2e2', '#991b1b'],
    HD: ['#ffedd5', '#9a3412'],
    WFH: ['#ede9fe', '#5b21b6'],
    SV: ['#cffafe', '#155e75'],
    CL: ['#dbeafe', '#1e40af'],
    SL: ['#fce7f3', '#9d174d'],
    EL: ['#ede9fe', '#5b21b6'],
    LWP: ['#f3f4f6', '#374151'],
    PL: ['#ede9fe', '#5b21b6'],
    LV: ['#ede9fe', '#5b21b6'],
    '–': ['#f1f5f9', '#94a3b8'],
  };
  const hit = map[code];
  return hit ? { bg: hit[0], fg: hit[1] } : { bg: 'transparent', fg: colors.text };
}

/** The statuses the edit sheet offers. */
export const PUNCH_STATUSES = [
  'Present', 'Absent', 'Half Day', 'Work from Home', 'Site Visit',
  'Casual Leave', 'Sick Leave', 'Earned Leave', 'Leave Without Pay',
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
