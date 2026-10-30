import type { AuthUser } from '../../api/types';
import type { Assignment, Client } from '../../data/types';
import { colors } from '../../theme/theme';
import { isOD } from '../assignments/logic';

/**
 * pg-myassign ("My Tasks", member). A port of renderMemberView() — the same
 * ownership rule, tabs, period filter, ordering and per-row update affordance.
 */

/** Only tasks assigned to me. Supervised work lives in the Supervising page. */
export const myTasks = (all: Assignment[], me: AuthUser | null) =>
  me ? all.filter((a) => a.memberId === me.id) : [];

export type MyTab = '' | 'Pending' | 'In Progress' | 'Completed' | 'overdue';

export const MY_TABS: { value: MyTab; label: string; danger?: boolean }[] = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Done' },
  { value: 'overdue', label: '⚠ Overdue', danger: true },
];

export interface MyStat { label: string; value: number; color: string }

/** The four counters above the list. */
export function myStats(mine: Assignment[]): MyStat[] {
  return [
    { label: 'Tasks', value: mine.length, color: colors.primary },
    { label: 'Pending', value: mine.filter((a) => a.status === 'Pending').length, color: colors.amber },
    { label: 'WIP', value: mine.filter((a) => a.status === 'In Progress').length, color: colors.purple },
    { label: 'Done', value: mine.filter((a) => a.status === 'Completed').length, color: colors.green },
  ];
}

/**
 * A task's period: a recurring task's month key, otherwise the due date's month.
 * Drives the "Period:" dropdown, which is built from this member's own tasks.
 */
export const periodOf = (a: Assignment) =>
  a.recurringMonthKey || (a.dueDate ? a.dueDate.slice(0, 7) : '');

/** periodLabel(): 'YYYY-MM' → 'Mon YYYY', anything else passed through. */
export function periodLabel(p: string): string {
  if (!p) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

/** Newest period first, as the web sorts then reverses. */
export function periodOptions(mine: Assignment[]) {
  const periods = [...new Set(mine.map(periodOf).filter(Boolean))].sort().reverse();
  return [
    { value: 'all', label: 'All Periods' },
    ...periods.map((p) => ({ value: p, label: periodLabel(p) })),
  ];
}

/**
 * Tab + period filter, then the web's ordering: overdue first, then client A-Z.
 * There is no search box and no sort selector on this page.
 */
export function filterMyTasks(
  mine: Assignment[],
  tab: MyTab,
  period: string,
  clientsById: Record<string, Client>,
): Assignment[] {
  let out = mine.filter((a) => {
    if (tab === 'overdue') return isOD(a);
    if (tab && a.status !== tab) return false;
    return true;
  });
  if (period && period !== 'all') out = out.filter((a) => periodOf(a) === period);

  const name = (a: Assignment) => clientsById[a.clientId]?.name || '';
  return out.sort((a, b) => {
    const aOD = isOD(a) ? 0 : 1;
    const bOD = isOD(b) ? 0 : 1;
    if (aOD !== bOD) return aOD - bOD;
    return name(a).localeCompare(name(b));
  });
}

/** A completed task shows "✓ Done" instead of the Update button. */
export const canUpdate = (a: Assignment) => a.status !== 'Completed';
