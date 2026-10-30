import type { AuthUser } from '../../api/types';
import type { Assignment, Client, DueDateRequest } from '../../data/types';
import { isOD } from '../assignments/logic';

/**
 * pg-supervising. A port of renderSupervising(): work where I am the reporting
 * person but neither the assignee nor the delegator — the tasks I oversee.
 */
export const supervisedPool = (all: Assignment[], me: AuthUser | null) =>
  me
    ? all.filter(
        (a) => a.reportingPersonId === me.id && a.subAssignedBy !== me.id && a.memberId !== me.id,
      )
    : [];

/** The One-Time / Recurring segmented control. */
export type SupType = 'onetime' | 'recurring';

export const SUP_TYPES: { value: SupType; label: string }[] = [
  { value: 'onetime', label: '📋 One-Time' },
  { value: 'recurring', label: '🔄 Recurring' },
];

export type SupTab = '' | 'Pending' | 'In Progress' | 'Completed' | 'overdue';

export const SUP_TABS: { value: SupTab; label: string; danger?: boolean }[] = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Done' },
  { value: 'overdue', label: '⚠ Overdue', danger: true },
];

/** Type filter, then tab, then search, then client A-Z — the web's exact order. */
export function filterSupervised(
  pool: Assignment[],
  type: SupType,
  tab: SupTab,
  search: string,
  clientsById: Record<string, Client>,
): Assignment[] {
  let out = type === 'recurring'
    ? pool.filter((a) => a.assignmentType === 'recurring')
    : pool.filter((a) => a.assignmentType !== 'recurring');

  if (tab === 'overdue') out = out.filter((a) => isOD(a));
  else if (tab) out = out.filter((a) => a.status === tab);

  const srch = search.trim().toLowerCase();
  if (srch) {
    out = out.filter((a) =>
      `${clientsById[a.clientId]?.name || ''} ${a.memberName || ''} ${a.workType}`
        .toLowerCase()
        .includes(srch));
  }

  const name = (a: Assignment) => clientsById[a.clientId]?.name || '';
  return out.sort((a, b) => name(a).localeCompare(name(b)));
}

/**
 * The most recent due-date request *I* raised on a task, whose status the row
 * shows as "📅 DDR: PENDING / APPROVED / REJECTED".
 */
export function myLatestRequest(
  requests: DueDateRequest[],
  assignmentId: string,
  me: AuthUser | null,
): DueDateRequest | undefined {
  if (!me) return undefined;
  return requests
    .filter((r) => r.assignmentId === assignmentId && r.requestedBy === me.id)
    .sort((a, b) =>
      +new Date((b as { createdAt?: string }).createdAt || 0) -
      +new Date((a as { createdAt?: string }).createdAt || 0))[0];
}

/** Row remark truncation: member remark at 30, supervisor remark at 22. */
export const cut = (s: string | undefined, max: number) =>
  !s ? '' : s.length > max ? `${s.slice(0, max)}…` : s;
