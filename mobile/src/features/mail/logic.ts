/**
 * pg-mail ("Mail") — a read-only view of the office mailboxes. The server holds
 * Gmail read scopes only: GARP Tracker can never send, delete or change mail.
 */

export interface MailAccount {
  key: string;
  label: string;
  expected: string;
  connected: boolean;
  mailbox?: string;
  connectedAt?: string;
  connectedBy?: string;
}

export interface MailStatus {
  configured: boolean;
  accounts: MailAccount[];
  readOnly: boolean;
  setupHint?: string;
}

export interface MailOwner { userId: string; name: string; auto?: boolean }

export interface MailRow {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date?: string;
  daysAgo: number;
  msgCount: number;
  unread?: boolean;
  internal?: boolean;
  replyState: 'needs_reply' | 'awaiting_them' | 'replied' | 'fyi' | string;
  replyLabel?: string;
  replyTone?: string;
  waitingDays?: number;
  responseHours?: number | null;
  owner?: MailOwner | null;
  client?: { id?: string; name?: string } | null;
}

export interface MailSummary {
  needsReply: number;
  awaiting: number;
  replied: number;
  fyi: number;
}

/** MAIL_TONE — the four states share one palette across cards and pills. */
export const MAIL_TONE: Record<string, { bg: string; col: string }> = {
  red: { bg: '#fef2f2', col: '#b91c1c' },
  amber: { bg: '#fffbeb', col: '#92400e' },
  green: { bg: '#f0fdf4', col: '#15803d' },
  grey: { bg: '#f8fafc', col: '#64748b' },
};

export const tone = (t?: string) => MAIL_TONE[t || 'grey'] || MAIL_TONE.grey;

/**
 * The dashboard: four states, each a filter. The inbox becomes a work queue
 * you can clear rather than a list you scroll.
 */
export const MAIL_CARDS = [
  { key: 'needs_reply', title: 'Needs reply', sub: 'ball is with you', tone: 'red' },
  { key: 'awaiting_them', title: 'Awaiting them', sub: 'you are chasing', tone: 'amber' },
  { key: 'replied', title: 'Replied', sub: 'handled', tone: 'green' },
  { key: 'fyi', title: 'No reply needed', sub: 'notifications', tone: 'grey' },
] as const;

export function cardCount(s: MailSummary | null, key: string): number {
  if (!s) return 0;
  if (key === 'needs_reply') return s.needsReply;
  if (key === 'awaiting_them') return s.awaiting;
  if (key === 'replied') return s.replied;
  return s.fyi;
}

/**
 * Ageing of the "needs reply" pile. The count alone says "12 waiting"; the
 * shape says "3 of them are over a week old" — a signal, not just a number.
 */
export function ageBuckets(rows: MailRow[]) {
  const nr = rows.filter((r) => r.replyState === 'needs_reply');
  const d = (r: MailRow) => r.waitingDays || 0;
  return {
    total: nr.length,
    month: nr.filter((r) => d(r) >= 30).length,
    week: nr.filter((r) => d(r) >= 7 && d(r) < 30).length,
    few: nr.filter((r) => d(r) >= 3 && d(r) < 7).length,
    fresh: nr.filter((r) => d(r) < 3).length,
  };
}

/** The search presets offered under the query box. */
export const MAIL_PRESETS = [
  { label: 'Last 30 days', q: 'in:inbox newer_than:30d' },
  { label: 'Unread', q: 'in:inbox is:unread' },
  { label: 'Attachments', q: 'in:inbox has:attachment newer_than:60d' },
  { label: 'Notices', q: 'in:inbox newer_than:90d (notice OR hearing OR GST OR TDS)' },
];

export const MAIL_LIMITS = ['25', '50', '100', '200'];

export const DEFAULT_QUERY = 'in:inbox newer_than:30d';

/** "replied in 6h" / "replied in 3d", as the status cell puts it. */
export function responseText(hours?: number | null): string {
  if (hours === null || hours === undefined) return '';
  return hours < 48 ? `replied in ${hours}h` : `replied in ${Math.round(hours / 24)}d`;
}

export function fmtDate(d?: string): string {
  if (!d) return '—';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[3]} ${MN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}
