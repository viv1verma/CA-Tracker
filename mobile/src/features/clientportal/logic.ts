import type { AuthUser } from '../../api/types';

/**
 * pg-clientportal — the client's own task list. Ported from renderClientPortal(),
 * openClientTask(), renderClientThread(), postClientComment() and
 * downloadClientTasks().
 *
 * This is NOT Row 2's My Tasks. That page is staff-facing and reads
 * /api/assignments; this one reads /api/client/assignments, whose rows carry a
 * different shape (companyName, period, remarkHistory, embedded comments) and
 * whose only client action is commenting — a client can never edit status,
 * progress or dates.
 */

/** One row of GET /api/client/assignments. */
export interface ClientTask {
  id: string;
  workType: string;
  companyName?: string;
  period?: string;
  assignmentType?: string;
  status: string;
  priority?: string;
  completionPct?: number;
  dueDate?: string;
  memberName?: string;
  reportingPersonName?: string;
  remark?: string;
  remarkHistory?: {
    remark: string; by?: string; status?: string; completionPct?: number; date: string;
  }[];
  completedAt?: string | null;
  comments?: { author?: string; authorName?: string; role?: string; text: string; date: string; isReminder?: boolean }[];
}

export type ClientTab = 'active' | 'done';

/** periodLabel(): 'YYYY-MM' → 'Mon YYYY', anything else passes through. */
export function periodLabel(p?: string): string {
  if (!p) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m[2], 10) - 1];
  return `${mn} ${m[1]}`;
}

/** fmtCli(): the portal's own DD-MM-YYYY, distinct from the staff fmt(). */
export function fmtCli(d?: string | null): string {
  if (!d) return '—';
  const s = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const dt = s.includes('T') ? new Date(s) : new Date(`${s}T00:00:00`);
  if (isNaN(dt.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()}`;
}

/** STATUS_BG / sbg(), the same palette the staff pages use. */
export const STATUS_BG: Record<string, [string, string]> = {
  'Pending': ['#fef3c7', '#92400e'],
  'In Progress': ['#dbeafe', '#1e40af'],
  'Under Review': ['#ede9fe', '#5b21b6'],
  'Completed': ['#dcfce7', '#15803d'],
  'On Hold': ['#f3f4f6', '#374151'],
};
export const sbg = (s?: string): [string, string] => STATUS_BG[s || 'Pending'] || ['#f3f4f6', '#374151'];

/** The three counters. "Active" is simply everything not Completed. */
export function portalStats(tasks: ClientTask[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'Completed').length;
  return { total, done, active: total - done };
}

/** The tab filter, verbatim: done = Completed, active = everything else. */
export const tasksForTab = (tasks: ClientTask[], tab: ClientTab) =>
  tasks.filter((t) => (tab === 'done' ? t.status === 'Completed' : t.status !== 'Completed'));

/** Overdue styling: past due and not completed. */
export const isOverdue = (t: ClientTask) =>
  !!t.dueDate && new Date(`${t.dueDate}T23:59:59`) < new Date() && t.status !== 'Completed';

/** The row's one-line preview: the newest team remark, else the plain remark. */
export function latestRemark(t: ClientTask): string {
  const h = t.remarkHistory;
  return h && h.length ? h[h.length - 1].remark : (t.remark || '');
}

/** The Period dropdown, built from the period-unfiltered task set. */
export function periodOptions(all: ClientTask[]) {
  const periods = [...new Set(all.map((t) => t.period).filter(Boolean) as string[])]
    .sort().reverse();
  return [{ value: 'all', label: 'All Periods' },
    ...periods.map((p) => ({ value: p, label: periodLabel(p) }))];
}

/** The Company dropdown — a group login only; a single client has no selector. */
export function companyOptions(u: AuthUser | null) {
  if (!u?.isGroup || !Array.isArray(u.companies)) return null;
  return [{ value: 'all', label: '🏢 All Companies (combined)' },
    ...u.companies.map((c) => ({ value: c.id, label: c.name }))];
}

/** showCompany: the company column appears only for a group viewing "all". */
export const showsCompanyColumn = (u: AuthUser | null, company: string) =>
  !!u?.isGroup && (company === 'all' || !company);

/** renderClientThread(): a client's own messages sit on the right. */
export function commentAuthor(m: NonNullable<ClientTask['comments']>[number]): string {
  const tag = m.role === 'client' ? ' · Client'
    : m.role === 'admin' ? ' · Admin'
      : m.role ? ' · Team' : '';
  return `${m.author || m.authorName || 'Unknown'}${tag}`;
}
