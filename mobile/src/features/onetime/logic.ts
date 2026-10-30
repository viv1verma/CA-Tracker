import type { Assignment, Client, TeamUser } from '../../data/types';
import { colors } from '../../theme/theme';
import { isOD } from '../assignments/logic';

/**
 * pg-dashboard ("One-Time Tasks"). Everything here is a port of renderDashboard()
 * and renderDashTable() in public/index.html — the same exclusions, the same
 * counters, the same aggregation.
 */

/** The page's defining rule: recurring assignments never appear here. */
export const oneTimePool = (all: Assignment[]) =>
  all.filter((a) => a.assignmentType !== 'recurring');

/** The five tabs. '' is All; 'overdue' is a computed filter, not a status. */
export type DashTab = '' | 'Pending' | 'In Progress' | 'Completed' | 'overdue';

export const DASH_TABS: { value: DashTab; label: string; danger?: boolean }[] = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'overdue', label: '⚠ Overdue', danger: true },
];

/** The web opens this page on the Pending tab (`let dashTabFilter='Pending'`). */
export const DEFAULT_TAB: DashTab = 'Pending';

export interface DashStat {
  label: string;
  value: number;
  color: string;
  /** The tab this card switches to when tapped, as the web's onclick does. */
  tab: DashTab;
}

/**
 * The stat strip. Note the web counts Total over non-recurring, non-sub rows,
 * while the other four count every non-recurring row — reproduced exactly.
 */
export function dashStats(all: Assignment[]): DashStat[] {
  const nonRec = oneTimePool(all);
  return [
    { label: 'Total', value: nonRec.filter((a) => !a.isSubAssignment).length, color: colors.primary, tab: '' },
    { label: 'Pending', value: nonRec.filter((a) => a.status === 'Pending').length, color: colors.amber, tab: 'Pending' },
    { label: 'In Progress', value: nonRec.filter((a) => a.status === 'In Progress').length, color: colors.purple, tab: 'In Progress' },
    { label: 'Done', value: nonRec.filter((a) => a.status === 'Completed').length, color: colors.green, tab: 'Completed' },
    { label: '⚠ OD', value: nonRec.filter((a) => isOD(a)).length, color: colors.red, tab: 'overdue' },
  ];
}

/** Overdue count for the alert strip — non-recurring only, as the web computes it. */
export const overdueCount = (all: Assignment[]) => oneTimePool(all).filter((a) => isOD(a)).length;

export const overdueTasks = (all: Assignment[]) => oneTimePool(all).filter((a) => isOD(a));

/** renderDashTable(): tab + search over the non-recurring pool. */
export function dashFilter(
  all: Assignment[],
  tab: DashTab,
  search: string,
  clientsById: Record<string, Client>,
): Assignment[] {
  const srch = search.trim().toLowerCase();
  return oneTimePool(all).filter((a) => {
    if (tab === 'overdue') return isOD(a);
    if (tab && a.status !== tab) return false;
    if (srch) {
      const hay = `${clientsById[a.clientId]?.name || ''} ${a.memberName || ''} ${a.workType}`.toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    return true;
  });
}

/** One row of the Team Workload table. */
export interface WorkloadRow extends TeamUser {
  tot: number;
  comp: number;
  inp: number;
  pend: number;
  ov: number;
  p: number;
}

/**
 * Team Workload. Counted over *all* assignments (the web does not exclude
 * recurring here), members with no work dropped, busiest first.
 */
export function workloadRows(all: Assignment[], users: TeamUser[]): WorkloadRow[] {
  return users
    .filter((u) => u.role === 'member')
    .map((m) => {
      const mine = all.filter((a) => a.memberId === m.id);
      const comp = mine.filter((a) => a.status === 'Completed').length;
      return {
        ...m,
        tot: mine.length,
        comp,
        inp: mine.filter((a) => a.status === 'In Progress').length,
        pend: mine.filter((a) => a.status === 'Pending').length,
        ov: mine.filter((a) => isOD(a)).length,
        p: mine.length ? Math.round((comp / mine.length) * 100) : 0,
      };
    })
    .filter((m) => m.tot > 0)
    .sort((a, b) => b.tot - a.tot);
}

/** Completion-bar colour thresholds from the workload table. */
export const workloadColor = (p: number) =>
  p >= 80 ? colors.green : p >= 50 ? colors.amber : colors.red;

/** The Sub-Assignments summary card: every sub-assignment, recurring included. */
export const subAssignments = (all: Assignment[]) => all.filter((a) => a.isSubAssignment);

/** Row remark truncation, matching the web's 30 / 25 character limits. */
export const shortRemark = (s?: string, max = 30) =>
  !s ? '' : s.length > max ? `${s.slice(0, max)}…` : s;
