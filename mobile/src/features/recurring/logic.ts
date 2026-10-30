import type { Assignment, Client, RecurringTemplate } from '../../data/types';
import { colors } from '../../theme/theme';
import { isOD } from '../assignments/logic';

/**
 * pg-recdash. Two tabs over one dataset: the generated recurring *tasks*, and the
 * *templates* that generate them. Ports renderRecDash / renderRecDashTable /
 * rdRenderSetup from public/index.html.
 */

/** The page's defining rule — the mirror image of One-Time Tasks. */
export const recurringPool = (all: Assignment[]) =>
  all.filter((a) => a.assignmentType === 'recurring');

export type RecTab = '' | 'Pending' | 'In Progress' | 'Completed' | 'overdue';

export const REC_TABS: { value: RecTab; label: string; danger?: boolean }[] = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'overdue', label: '⚠ Overdue', danger: true },
];

export interface RecStat { label: string; value: number; color: string; tab: RecTab }

/** The stat strip; Total counts every recurring task, unlike the one-time page. */
export function recStats(all: Assignment[]): RecStat[] {
  const rec = recurringPool(all);
  return [
    { label: 'Total', value: rec.length, color: colors.purple, tab: '' },
    { label: 'Pending', value: rec.filter((a) => a.status === 'Pending').length, color: colors.amber, tab: 'Pending' },
    { label: 'In Progress', value: rec.filter((a) => a.status === 'In Progress').length, color: colors.primary, tab: 'In Progress' },
    { label: 'Done', value: rec.filter((a) => a.status === 'Completed').length, color: colors.green, tab: 'Completed' },
    { label: '⚠ OD', value: rec.filter((a) => isOD(a)).length, color: colors.red, tab: 'overdue' },
  ];
}

/** Tab + search over the recurring pool. */
export function recFilter(
  all: Assignment[],
  tab: RecTab,
  search: string,
  clientsById: Record<string, Client>,
): Assignment[] {
  const srch = search.trim().toLowerCase();
  return recurringPool(all).filter((a) => {
    if (tab === 'overdue') return isOD(a);
    if (tab && a.status !== tab) return false;
    if (srch) {
      const hay = `${clientsById[a.clientId]?.name || ''} ${a.memberName || ''} ${a.workType}`.toLowerCase();
      if (!hay.includes(srch)) return false;
    }
    return true;
  });
}

/** fmtPeriod(): a recurringMonthKey rendered the way the web's period chip does. */
export function fmtPeriod(key?: string): string {
  if (!key) return '—';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) return `${MN[parseInt(m[2], 10) - 1]} '${m[1].slice(2)}`;
  const q = /^(\d{4})-Q(\d)$/.exec(key);
  if (q) return `Q${q[2]} '${q[1].slice(2)}`;
  const h = /^(\d{4})-H(\d)$/.exec(key);
  if (h) return `H${h[2]} '${h[1].slice(2)}`;
  const an = /^(\d{4})-ANN$/.exec(key);
  if (an) return `FY ${an[1]}`;
  return key;
}

export const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annually'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** freqBadge() colours and the short labels the table uses. */
export function freqBadge(f?: string): { label: string; bg: string; fg: string } {
  const map: Record<string, [string, string, string]> = {
    Monthly: ['Monthly', '#dbeafe', '#1e40af'],
    Quarterly: ['Qtrly', '#dcfce7', '#166534'],
    'Half-Yearly': ['Half-Yr', '#fef3c7', '#92400e'],
    Annually: ['Annual', '#fae8ff', '#86198f'],
  };
  const hit = f ? map[f] : undefined;
  return hit
    ? { label: hit[0], bg: hit[1], fg: hit[2] }
    : { label: f || '—', bg: '#f3f4f6', fg: '#374151' };
}

/** The full frequency name, as the Setup table shows it. */
export function freqPill(f?: string): { label: string; bg: string; fg: string } {
  const b = freqBadge(f);
  return { ...b, label: f || 'Monthly' };
}

/** Row remark truncation: member remark at 28, supervisor remark at 22. */
export const cut = (s: string | undefined, max: number) =>
  !s ? '' : s.length > max ? `${s.slice(0, max)}…` : s;

/** Templates as the Setup tab lists them, newest data straight from the API. */
export const templatesFor = (templates: RecurringTemplate[]) => templates;
