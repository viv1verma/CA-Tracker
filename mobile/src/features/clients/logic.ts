import type { AuthUser } from '../../api/types';
import type { Assignment, Client } from '../../data/types';
import { isAdmin, isOthers } from '../../auth/permissions';

/**
 * pg-clients. The client list with its per-client task counters, the client
 * sheet, the client profile (dashboard access + invoice register) and groups.
 */

/** The Entity Type options, verbatim from the client sheet's select. */
export const CLIENT_TYPES = [
  'Individual', 'Pvt Ltd', 'Public Company', 'Bank', 'NBFC', 'Partnership',
  'LLP', 'HUF', 'Trust', 'OPC', 'Other',
];

/** The branches the client sheet offers; only partners/admins may choose. */
export const CLIENT_BRANCHES = ['Greater Noida (HO)', 'Pune (BO)'];

export type ClientSort = 'name' | 'type' | 'city' | 'tasks' | 'pending';

export const CLIENT_SORTS: { value: ClientSort; label: string }[] = [
  { value: 'name', label: 'Name A-Z' },
  { value: 'type', label: 'Type A-Z' },
  { value: 'city', label: 'City A-Z' },
  { value: 'tasks', label: 'Most Tasks' },
  { value: 'pending', label: 'Most Pending' },
];

/** canManage(): editing and deleting a client is admin or ITR admin. */
export const canManageClients = (u: AuthUser | null) =>
  !!u && (isAdmin(u) || !!u.itrAdmin);

/** The "Others" qualification is locked out of the client list entirely. */
export const clientsRestricted = (u: AuthUser | null) => isOthers(u);

/** Search covers name, PAN, GST and address; then the chosen sort. */
export function filterClients(
  clients: Client[],
  search: string,
  sort: ClientSort,
  assignments: Assignment[],
): Client[] {
  const q = search.trim().toLowerCase();
  const out = clients.filter((c) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    (c.pan || '').toLowerCase().includes(q) ||
    (c.gst || '').toLowerCase().includes(q) ||
    (c.address || '').toLowerCase().includes(q));

  const count = (id: string) => assignments.filter((a) => a.clientId === id).length;
  const pending = (id: string) =>
    assignments.filter((a) => a.clientId === id && a.status === 'Pending').length;

  switch (sort) {
    case 'name': out.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'type': out.sort((a, b) => (a.type || '').localeCompare(b.type || '')); break;
    case 'city': out.sort((a, b) => (a.address || '').localeCompare(b.address || '')); break;
    case 'tasks': out.sort((a, b) => count(b.id) - count(a.id)); break;
    case 'pending': out.sort((a, b) => pending(b.id) - pending(a.id)); break;
  }
  return out;
}

/** The four per-client counters shown on each row. */
export function clientCounts(clientId: string, assignments: Assignment[]) {
  const mine = assignments.filter((a) => a.clientId === clientId);
  return {
    total: mine.length,
    pending: mine.filter((a) => a.status === 'Pending').length,
    wip: mine.filter((a) => a.status === 'In Progress').length,
    done: mine.filter((a) => a.status === 'Completed').length,
  };
}

/** The four client-portal dashboards an admin can switch on or off. */
export const DASHBOARD_KEYS = [
  { key: 'tasks' as const, label: 'My Tasks' },
  { key: 'billing' as const, label: 'Billing' },
  { key: 'cashflow' as const, label: 'Cash Flow' },
  { key: 'debtors' as const, label: 'Debtors' },
];

export const rupees = (n?: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
