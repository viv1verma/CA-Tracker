import { colors } from '../../theme/theme';

/**
 * pg-myleave ("My Leave"). The member's own comp-off balance, the holiday work
 * that earned it, and their leave applications. Ported from renderMyLeave().
 */

/** One credited compensatory off, from GET /api/comp-offs. */
export interface CompOff {
  id: string;
  userId: string;
  earnedDate: string;
  days: number;
  reason?: string;
  status?: 'available' | 'used' | string;
}

export interface CompOffBalance {
  earned: number;
  used: number;
  available: number;
}

/**
 * The leave types this page offers. Deliberately the short set from
 * openLeaveForm() — not the attendance page's longer list — because the two
 * forms differ on the web and the server accepts both vocabularies.
 */
export const MY_LEAVE_TYPES = [
  { value: 'Casual', label: 'Casual' },
  { value: 'Sick', label: 'Sick' },
  { value: 'Earned', label: 'Earned' },
  { value: 'Comp Off', label: 'Comp Off' },
  { value: 'Unpaid', label: 'Unpaid' },
  { value: 'Other', label: 'Other' },
];

/** Status pill colours and labels, matching the web's `sc` map. */
export function leaveStatus(status?: string): { bg: string; fg: string; label: string } {
  if (status === 'approved') return { bg: '#dcfce7', fg: '#15803d', label: 'Approved' };
  if (status === 'rejected') return { bg: '#fee2e2', fg: '#991b1b', label: 'Rejected' };
  return { bg: '#fef3c7', fg: '#92400e', label: 'Pending' };
}

/** Comp-off row status colour: used is muted, anything else reads as available. */
export const compOffColor = (status?: string) =>
  status === 'used' ? colors.muted : colors.green;

/**
 * The server computes `days` itself as an inclusive span with a floor of 1;
 * this mirrors it so the form can preview the same number.
 */
export const leaveDayCount = (from: string, to: string) =>
  Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1);
