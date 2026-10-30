import type { AuthUser } from '../../api/types';
import type { ModuleId } from '../../navigation/modules';
import type { Notification } from '../../data/types';

/**
 * The bell panel. Ported from openNotifPanel() / renderNotifList() / openNotif() /
 * markNotifRead() / clearAllNotifs() / updateBellBadge().
 *
 * Reading the list is part of the shared data load (GET /notifications). Opening
 * the panel issues no request at all; only tapping an item (PUT …/read) and
 * Clear All (DELETE /notifications/clear) write anything.
 */

/** updateBellBadge(): the count, capped at "9+" exactly as the web caps it. */
export const badgeText = (unread: number): string | undefined =>
  unread > 0 ? (unread > 9 ? '9+' : String(unread)) : undefined;

/**
 * openNotif()'s routing table: which page a notification belongs to.
 *
 * One deliberate divergence. For a due-date or reopen request the web sends an
 * admin to navTo('reports') + switchReport('requests') — but switchReport has no
 * 'requests' branch, so the Reports page is left showing "Loading..." forever.
 * Approvals is the page that actually holds those requests, so that is where an
 * admin is sent here.
 */
export function targetModule(n: Notification, user: AuthUser | null): ModuleId {
  const t = n.type || '';
  const isAdmin = user?.role === 'admin';

  if (t === 'due-date-request' || t === 'reopen-request') {
    return isAdmin ? 'approvals' : 'myassign';
  }
  if (t === 'completion-approval') return 'assignments';
  if (isAdmin) return 'assignments';
  if (user?.role === 'client') return 'clientportal';
  // An itrclient falls through the web's role chain to navTo('myassign') — a staff
  // page their login cannot render. Their own portal is the page that actually
  // holds their filing, so that is where they are sent.
  if (user?.role === 'itrclient') return 'itrclient';
  return 'myassign';
}

/**
 * goOpen(): the web follows the page change by opening the assignment. Only the
 * two task lists can show one, so the id travels only when that is the target.
 */
export const opensAssignment = (n: Notification, target: ModuleId): boolean =>
  !!n.assignmentId && (target === 'assignments' || target === 'myassign');

/** Newest first, as GET /notifications already sorts them. */
export const sortNotifications = (list: Notification[]): Notification[] =>
  [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
