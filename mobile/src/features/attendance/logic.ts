import { colors } from '../../theme/theme';
import type { AttendanceRecord } from './types';

/**
 * pg-attendance. The punch card, leave balance, my-attendance history and the
 * WFH approval queue — ported from the web's attendance page.
 */

/** The leave types the Apply Leave sheet offers, verbatim from the web select. */
export const LEAVE_TYPES = [
  { value: 'Casual Leave', label: 'Casual Leave (CL)' },
  { value: 'Sick Leave', label: 'Sick Leave (SL)' },
  { value: 'Earned Leave', label: 'Earned/Privilege Leave (EL)' },
  { value: 'Comp Off', label: 'Comp Off (compensatory)' },
  { value: 'Leave Without Pay', label: 'Leave Without Pay (LWP)' },
  { value: 'Work from Home', label: 'Work from Home' },
  { value: 'Half Day', label: 'Half Day' },
];

/** Attendance status pill colours. */
export function attColor(status?: string): { bg: string; fg: string } {
  switch (status) {
    case 'Present': return { bg: '#dcfce7', fg: '#15803d' };
    case 'Work from Home': return { bg: '#dbeafe', fg: '#1e40af' };
    case 'WFH Pending': return { bg: '#fef3c7', fg: '#92400e' };
    case 'Site Visit': return { bg: '#ede9fe', fg: '#5b21b6' };
    case 'Half Day': return { bg: '#fef3c7', fg: '#92400e' };
    case 'Absent': return { bg: '#fee2e2', fg: '#b91c1c' };
    default: return { bg: '#f3f4f6', fg: '#374151' };
  }
}

/** The alert shown when nothing is marked and it is past 10:00. */
export function attendanceAlert(today: AttendanceRecord | null): boolean {
  if (today && today.punchIn) return false;
  return new Date().getHours() >= 10;
}

/** previewLeaveDays(): inclusive day count between two YYYY-MM-DD dates. */
export function leaveDays(from: string, to: string): number | null {
  if (!from || !to) return null;
  const days = Math.round((+new Date(to) - +new Date(from)) / 864e5) + 1;
  return days > 0 ? days : null;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Month/year options for the history picker: this year and the two before it. */
export function monthOptions() {
  return MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
}

export function yearOptions() {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }));
}

/** Leave-request status colours, shared by the My Leave list. */
export function leaveStatusColor(status?: string) {
  if (status === 'approved') return { bg: '#dcfce7', fg: colors.green };
  if (status === 'rejected') return { bg: '#fee2e2', fg: colors.red };
  return { bg: '#fef3c7', fg: colors.amber };
}
