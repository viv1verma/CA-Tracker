/**
 * pg-compcal ("Compliance Calendar"). The statutory catalogue projected onto a
 * month, one entry per obligation falling due. Ported from initCompCalPage() and
 * renderCompCal().
 */

/** One obligation due on a given day. */
export interface CalendarItem {
  code: string;
  name: string;
  category: string;
  freq?: string;
  note?: string;
  period?: string;
}

/** GET /api/statutory/calendar?month=YYYY-MM */
export interface CalendarMonth {
  month: string;
  year: number;
  monthNo: number;
  lastDay: number;
  /** JS weekday of the 1st, 0 = Sunday. */
  firstWeekday: number;
  today: string;
  categories: string[];
  days: Record<string, CalendarItem[]>;
}

/** Category colours, from CC_CATCOL. */
export const CC_CATCOL: Record<string, string> = {
  'GST': '#2a78d6',
  'TDS': '#7f77dd',
  'Income Tax': '#1d9e75',
  'ROC': '#eda100',
  'PF/ESI': '#d85a30',
};

export const catColor = (c: string) => CC_CATCOL[c] || '#64748b';

export const CC_MON = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type UrgencyKey = 'past' | 'soon' | 'week' | 'later';

/**
 * ccUrgency(): how close a due date is, which drives the day's colour.
 * Past is grey, ≤3 days red, ≤7 days amber, anything further green.
 */
export function ccUrgency(dateStr: string, todayStr: string): { k: UrgencyKey; col: string } {
  const d = Math.round(
    (+new Date(`${dateStr}T00:00:00`) - +new Date(`${todayStr}T00:00:00`)) / 864e5,
  );
  if (d < 0) return { k: 'past', col: '#cbd5e1' };
  if (d <= 3) return { k: 'soon', col: '#dc2626' };
  if (d <= 7) return { k: 'week', col: '#f59e0b' };
  return { k: 'later', col: '#16a34a' };
}

export const LEGEND: { label: string; col: string }[] = [
  { label: 'DUE ≤ 3 DAYS', col: '#dc2626' },
  { label: '≤ 7 DAYS', col: '#f59e0b' },
  { label: 'LATER', col: '#16a34a' },
  { label: 'PAST', col: '#cbd5e1' },
];

/** The day key for a day number within the loaded month. */
export const dayKey = (month: string, d: number) => `${month}-${String(d).padStart(2, '0')}`;

/** Items on a day, filtered to the categories currently switched on. */
export function itemsOn(
  cal: CalendarMonth | null,
  key: string,
  cats: Set<string>,
): CalendarItem[] {
  return ((cal && cal.days[key]) || []).filter((o) => cats.has(o.category));
}

/** Step the month by ±1, keeping the YYYY-MM shape. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const currentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

export const todayKey = () => new Date().toISOString().slice(0, 10);

/** Everything still ahead this month — the default view when no day is picked. */
export function upcoming(cal: CalendarMonth | null, cats: Set<string>) {
  if (!cal) return [];
  const out: { key: string; o: CalendarItem }[] = [];
  for (let d = 1; d <= cal.lastDay; d++) {
    const key = dayKey(cal.month, d);
    if (key < cal.today) continue;
    itemsOn(cal, key, cats).forEach((o) => out.push({ key, o }));
  }
  return out;
}

/** "05 Sep 2026" — the list's due-date format. */
export function fmtDay(key: string): string {
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${m[3]} ${MN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

/** The caveat the web prints under every list. */
export const CALENDAR_CAVEAT =
  'Generic statutory dates. Extensions, state variations and client-specific facts still need checking.';
