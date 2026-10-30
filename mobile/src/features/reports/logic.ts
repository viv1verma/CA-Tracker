import { colors } from '../../theme/theme';
import type { AuthUser } from '../../api/types';

/**
 * pg-reports. Nine report tabs ported from initReports() / switchReport().
 * Every tab reads only. The single mutation in this module is the Leave tab's
 * "Recover Past Leaves" (POST /leave-migrate), which the web also offers behind
 * a diagnostic banner and never fires on load.
 */

export type ReportType =
  | 'performance' | 'monthly' | 'workload' | 'overdue' | 'clients'
  | 'duedatelog' | 'leave' | 'recurring' | 'audit';

/**
 * rpT1..rpT9. initReports() hides tabs 1–7 and 9 for non-admins (partners keep
 * only Monthly Status), so `adminOnly` mirrors that and the server's adminOnly
 * guard on every one of those routes.
 */
export const REPORT_TABS: { type: ReportType; label: string; adminOnly: boolean }[] = [
  { type: 'performance', label: '📊 Performance', adminOnly: true },
  { type: 'monthly', label: '📅 Monthly', adminOnly: true },
  { type: 'workload', label: '⚖ Workload', adminOnly: true },
  { type: 'overdue', label: '🔴 Overdue', adminOnly: true },
  { type: 'clients', label: '🏢 Clients', adminOnly: true },
  { type: 'duedatelog', label: '📆 Due Date Log', adminOnly: true },
  { type: 'leave', label: '🌴 Leave', adminOnly: true },
  { type: 'recurring', label: '📅 Monthly Status', adminOnly: false },
  { type: 'audit', label: '🔎 Audit Trail', adminOnly: true },
];

export const visibleReportTabs = (u: AuthUser | null) =>
  REPORT_TABS.filter((t) => !t.adminOnly || u?.role === 'admin');

/** initReports(): admins land on Performance, everyone else on Monthly Status. */
export const initialReport = (u: AuthUser | null): ReportType =>
  u?.role === 'admin' ? 'performance' : 'recurring';

/** _rBar()'s three-band colour. */
export const barColor = (pct: number) =>
  pct >= 80 ? colors.green : pct >= 50 ? colors.amber : colors.red;

// ── Response shapes ─────────────────────────────────────────────────────────

/** GET /api/performance */
export interface PerformanceRow {
  memberId: string;
  memberName: string;
  designation?: string;
  total: number;
  completed: number;
  completedOnTime: number;
  pending: number;
  inProgress: number;
  overdue: number;
  performancePct: number;
}

/** GET /api/reports/workload */
export interface WorkloadRow {
  id: string;
  name: string;
  designation?: string;
  branch?: string;
  total: number;
  active: number;
  done: number;
  overdue: number;
  completionRate: number;
}

/** GET /api/reports/overdue */
export interface OverdueRow {
  id: string;
  clientName: string;
  workType: string;
  memberName: string;
  dueDate: string;
  daysOverdue: number;
  priority?: string;
}

/** GET /api/reports/clients */
export interface ClientReportRow {
  id: string;
  name: string;
  type?: string;
  branch?: string;
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  workTypes?: Record<string, number>;
}

/** GET /api/due-date-log */
export interface DueDateLogRow {
  date: string;
  clientName: string;
  workType: string;
  memberName: string;
  oldDueDate?: string;
  newDueDate?: string;
  changedByName: string;
  changedByQual?: string;
  via?: string;
}

/** GET /api/monthly-report */
export interface MonthlyActivity {
  month: number;
  year: number;
  monthKey: string;
  report: {
    memberId: string;
    memberName: string;
    designation?: string;
    totalUpdatesThisMonth: number;
    totalBackwardUpdates: number;
    assignments: {
      assignmentId: string;
      clientName: string;
      workType: string;
      currentPct: number;
      dueDate?: string;
      daysSinceAssigned: number;
      backwardUpdates: number;
      totalUpdates: number;
      activityLog: {
        date: string;
        prevPct?: number;
        completionPct: number;
        isBackward?: boolean;
        remark?: string;
        updatedByName?: string;
      }[];
    }[];
  }[];
}

/** GET /api/leave-report */
export interface LeaveReport {
  summary: {
    userId: string; name: string; applied: number; approved: number; rejected: number;
    pending: number; approvedDays: number; paidDays: number; unpaidDays: number;
  }[];
  totals: {
    applied: number; approved: number; rejected: number; pending: number;
    approvedDays: number; paidDays: number; unpaidDays: number;
  };
  detail: {
    id: string; memberName: string; type: string; fromDate: string; toDate: string;
    days: number; status: string; reason?: string;
  }[];
}

/** GET /api/leave-diagnostic */
export interface LeaveDiagnostic {
  oldStore: { count: number };
  newStore: { count: number; migrated: number };
}

/** rpLeave()'s paid-type test, verbatim. */
const PAID_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Casual', 'Sick', 'Earned', 'Paid'];
export const isPaidLeaveType = (t: string) => PAID_TYPES.includes(t);

/** GET /api/recurring-report */
export interface RecurringReport {
  months: { key: string; label: string }[];
  rows: {
    clientName: string;
    workType: string;
    cells: ({ status: string; completedAt?: string | null; dueDate?: string } | null)[];
  }[];
}

/** recStatusCell()'s badge palette. */
export function recStatusStyle(status?: string): { bg: string; fg: string; icon: string } {
  const map: Record<string, [string, string, string]> = {
    'Completed': ['#dcfce7', '#15803d', '✓'],
    'Under Review': ['#ede9fe', '#5b21b6', '⏳'],
    'In Progress': ['#dbeafe', '#1d4ed8', '▶'],
    'Pending': ['#fef3c7', '#92400e', '○'],
  };
  const hit = status ? map[status] : undefined;
  return hit
    ? { bg: hit[0], fg: hit[1], icon: hit[2] }
    : { bg: '#f3f4f6', fg: '#6b7280', icon: '' };
}

/** GET /api/audit-log */
export interface AuditLog {
  total: number;
  entries: {
    at: string;
    actorId: string;
    actorName: string;
    actorRole?: string;
    action: string;
    entity: string;
    label?: string;
    details?: string;
    ip?: string;
  }[];
  entities: string[];
  actors: { id: string; name: string }[];
}

/** AUDIT_ACTION_COLOR, verbatim. */
export function auditActionStyle(action: string): { bg: string; fg: string } {
  const map: Record<string, [string, string]> = {
    created: ['#dcfce7', '#15803d'],
    updated: ['#e0f2fe', '#0369a1'],
    deleted: ['#fee2e2', '#b91c1c'],
    approved: ['#dcfce7', '#15803d'],
    rejected: ['#fee2e2', '#b91c1c'],
    restored: ['#fef3c7', '#92400e'],
  };
  const hit = map[action];
  return hit ? { bg: hit[0], fg: hit[1] } : { bg: '#f3f4f6', fg: '#6b7280' };
}
