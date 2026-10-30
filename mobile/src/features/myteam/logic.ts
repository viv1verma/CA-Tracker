import type { AuthUser } from '../../api/types';
import type { Assignment, Client } from '../../data/types';

/**
 * pg-submanage ("My Team"). A port of renderSubManage(): the work I delegated,
 * grouped by the parent task it came out of.
 */

/** Everything I sub-assigned, regardless of who it went to. */
export const myDelegated = (all: Assignment[], me: AuthUser | null) =>
  me ? all.filter((a) => a.subAssignedBy === me.id) : [];

export interface SubGroup {
  /** The parent assignment id, or 'standalone' for sub-tasks with no parent. */
  key: string;
  /** The group's heading, exactly as the web composes it. */
  title: string;
  parentId: string | null;
  items: Assignment[];
}

/**
 * Group by parentAssignmentId, keeping insertion order so the list is stable
 * between renders — the same grouping the web builds with a plain object.
 */
export function groupDelegated(
  delegated: Assignment[],
  all: Assignment[],
  clientsById: Record<string, Client>,
): SubGroup[] {
  const groups = new Map<string, Assignment[]>();
  delegated.forEach((a) => {
    const k = a.parentAssignmentId || 'standalone';
    const list = groups.get(k);
    if (list) list.push(a);
    else groups.set(k, [a]);
  });

  return [...groups.entries()].map(([key, items]) => {
    if (key === 'standalone') {
      return { key, title: '📋 Standalone', parentId: null, items };
    }
    const parent = all.find((x) => x.id === key);
    const client = parent ? clientsById[parent.clientId] : undefined;
    return {
      key,
      title: parent ? `📋 From: ${client?.name || '—'} — ${parent.workType}` : '📋 Standalone',
      parentId: parent ? parent.id : null,
      items,
    };
  });
}
