/**
 * pg-bizdev ("Business Development"). Two halves under one page: private-company
 * leads, and government tenders with their eligibility, overdue and report views.
 */

// ── Leads ───────────────────────────────────────────────────────────────────

export interface LeadEvent {
  date: string;
  status?: string;
  note?: string;
  byName?: string;
  type?: string;
}

export interface Lead {
  id: string;
  name: string;
  poc?: string;
  pocDesignation?: string;
  status: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  events?: LeadEvent[];
}

/** BD_STATUS_COLOR — the lead pipeline, in order. */
export const BD_STATUS_COLOR: Record<string, [string, string]> = {
  'Generated POC': ['#f1f5f9', '#475569'],
  'Contacted POC': ['#dbeafe', '#1e40af'],
  'Fixed Meeting with POC': ['#fef3c7', '#92400e'],
  'Met with POC': ['#e0e7ff', '#4338ca'],
  'Got the Assignment': ['#dcfce7', '#15803d'],
  'Lost the Assignment': ['#fee2e2', '#991b1b'],
};

export const leadColor = (s?: string) => BD_STATUS_COLOR[s || ''] || ['#f3f4f6', '#6b7280'];

/** The newest event on a lead, which the list shows as "latest event". */
export function latestEvent(l: Lead): LeadEvent | null {
  const evs = l.events || [];
  return evs.length ? evs[evs.length - 1] : null;
}

export function eventText(ev: LeadEvent): string {
  return ev.note || (ev.type === 'status' ? `Moved to ${ev.status}` : ev.status || '');
}

// ── Tenders ─────────────────────────────────────────────────────────────────

export interface TenderEvent {
  date: string;
  status?: string;
  note?: string;
  byName?: string;
}

export interface Tender {
  id: string;
  category: 'psu_company' | 'psu_bank' | string;
  psuName: string;
  tenderRef?: string;
  natureOfWork?: string;
  location?: string;
  applicationDate?: string;
  dueDate?: string;
  tenderValue?: number;
  quotationValue?: number;
  emdAmount?: number;
  emdStatus?: string;
  tenderFee?: number;
  bidOpeningDate?: string;
  l1Value?: number;
  source?: string;
  partnerId?: string;
  partnerName?: string;
  status: string;
  events?: TenderEvent[];
  eligibility?: { verdict?: string; reasons?: string[]; blockers?: string[] };
  eligibilityOverride?: { verdict?: string; byName?: string; reason?: string };
}

export const TD_STATUS_COLOR: Record<string, [string, string]> = {
  'Identified': ['#eef2ff', '#4338ca'],
  'Bid Submitted': ['#e0f2fe', '#0369a1'],
  'Technical Evaluation': ['#fef9c3', '#854d0e'],
  'Financial Bid Opened': ['#f3e8ff', '#7e22ce'],
  'Under Evaluation': ['#ffedd5', '#c2410c'],
  'Awarded': ['#dcfce7', '#15803d'],
  'Lost': ['#fee2e2', '#b91c1c'],
  'Cancelled / Retendered': ['#f3f4f6', '#6b7280'],
};

export const tenderColor = (s?: string) => TD_STATUS_COLOR[s || ''] || ['#f3f4f6', '#6b7280'];

export const ELIG_COLOR: Record<string, [string, string]> = {
  'Eligible': ['#dcfce7', '#15803d'],
  'Not Eligible': ['#fee2e2', '#b91c1c'],
  'Needs Review': ['#fef3c7', '#92400e'],
};

/** A manual override wins over the auto-checked verdict. */
export const eligVerdict = (t: Tender) =>
  t.eligibilityOverride?.verdict || t.eligibility?.verdict || '';

export const TENDER_CATEGORIES = [
  { value: 'psu_company', label: '🏭 PSU Companies' },
  { value: 'psu_bank', label: '🏦 PSU Banks' },
];

export const ELIG_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Eligible', label: 'Eligible' },
  { value: 'Not Eligible', label: 'Not Eligible' },
  { value: 'Needs Review', label: 'Needs Review' },
  { value: 'unread', label: 'Not read yet' },
];

export const EMD_STATUSES = ['', 'Not Applicable', 'To Be Paid', 'Paid', 'Refunded', 'Forfeited'];

/** A tender is "open" until it is decided. */
export const tdIsOpen = (s?: string) =>
  s !== 'Awarded' && s !== 'Lost' && s !== 'Cancelled / Retendered';

/** Applying settles a tender — an application date, or any status past Identified. */
export const tdIsActioned = (t: Tender) =>
  !!t.applicationDate || String(t.status || 'Identified') !== 'Identified';

export function tdDaysOverdue(t: Tender): number | null {
  if (!t.dueDate) return null;
  const d = new Date(`${t.dueDate}T00:00:00`);
  if (isNaN(+d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((+today - +d) / 864e5);
}

/** Overdue = due date passed AND we never bid. */
export function tdIsOverdue(t: Tender): boolean {
  if (tdIsActioned(t)) return false;
  const d = tdDaysOverdue(t);
  return d !== null && d > 0;
}

/** The due-date cell: red once overdue, amber inside a week, only while open. */
export function dueDisplay(t: Tender): { text: string; color: string; tag: string } {
  if (!t.dueDate) return { text: '—', color: '#cbd5e1', tag: '' };
  const d = new Date(`${t.dueDate}T00:00:00`);
  if (isNaN(+d)) return { text: t.dueDate, color: '#6b7280', tag: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((+d - +today) / 86400000);
  let color = '#6b7280';
  let tag = '';
  if (tdIsOpen(t.status)) {
    if (days < 0) { color = '#dc2626'; tag = '⚠ OVERDUE'; }
    else if (days <= 7) { color = '#d97706'; tag = `${days}d left`; }
  }
  return { text: fmtDate(t.dueDate), color, tag };
}

/** The tenders list: category, not overdue, then status / eligibility / search. */
export function filterTenders(
  tenders: Tender[], cat: string, status: string, elig: string, search: string,
): Tender[] {
  let list = tenders.filter((t) => t.category === cat && !tdIsOverdue(t));
  if (status !== 'all') list = list.filter((t) => t.status === status);
  if (elig === 'unread') list = list.filter((t) => !t.eligibility?.verdict);
  else if (elig !== 'all') list = list.filter((t) => eligVerdict(t) === elig);
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((t) =>
      [t.psuName, t.tenderRef, t.natureOfWork, t.location, t.partnerName, t.status, t.source]
        .map((x) => (x || '').toString().toLowerCase()).join(' ').includes(q));
  }
  return list;
}

export const overdueList = (tenders: Tender[], cat: string) =>
  tenders.filter((t) => tdIsOverdue(t) && (cat === 'all' || t.category === cat));

/** ₹ with Indian grouping, or an em dash for nothing. */
export function fmtMoney(v?: number): string {
  const n = Number(v) || 0;
  if (!n) return '—';
  try { return `₹${n.toLocaleString('en-IN')}`; } catch { return `₹${n}`; }
}

export function fmtDate(d?: string): string {
  if (!d) return '—';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[3]} ${MN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

/** The ineligibility report's scope selector. */
export const REPORT_SCOPES = [
  { value: 'blocked', label: 'Not Eligible only' },
  { value: 'review', label: 'Not Eligible + Needs Review' },
  { value: 'all', label: 'All tenders' },
];

export function reportRows(tenders: Tender[], scope: string): Tender[] {
  if (scope === 'all') return tenders;
  if (scope === 'review') {
    return tenders.filter((t) => ['Not Eligible', 'Needs Review'].includes(eligVerdict(t)));
  }
  return tenders.filter((t) => eligVerdict(t) === 'Not Eligible');
}

/** Blocker reasons across the shown tenders, most common first. */
export function blockerCounts(rows: Tender[]): { reason: string; count: number }[] {
  const out: Record<string, number> = {};
  rows.forEach((t) => {
    (t.eligibility?.blockers || t.eligibility?.reasons || []).forEach((b) => {
      const k = String(b).trim();
      if (k) out[k] = (out[k] || 0) + 1;
    });
  });
  return Object.entries(out).map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
