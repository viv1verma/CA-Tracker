/**
 * pg-clientcompliance — the client's own per-client compliance grid.
 *
 * NOT PARITY row 11 (`pg-compcal`), which is the staff statutory due-date
 * calendar off /api/statutory/calendar. This module reads the client's own
 * filed/pending/overdue records off /api/client/compliance.
 *
 * The web serves both this page and the admin's per-client editor from ONE
 * renderer, renderCompliance(clientId): passing a clientId makes it editable and
 * reads /api/clients/:id/compliance; the client self-view passes none, reads
 * /api/client/compliance and is strictly read-only ("View only" — no Upload
 * Excel button and no editable cells). Everything below is therefore written to
 * serve both contexts, but only the read-only client context is wired up here;
 * the admin editor stays PARITY row 10's documented gap.
 */

export interface ComplianceDef {
  key: string;
  label: string;
  group: string;
  freq: 'monthly' | 'quarterly' | 'annual';
  amt1?: string;
  amt2?: string;
  gstinWise?: boolean;
}

export interface ComplianceRecord {
  id: string;
  fy: string;
  period: string;
  obligation: string;
  gstin?: string;
  status?: string;
  dueDate?: string;
  filedDate?: string;
  lateFee?: number;
  amount?: number;
  amount2?: number;
  note?: string;
}

/** GET /api/client/compliance?fy= */
export interface ComplianceResponse {
  defs: ComplianceDef[];
  statuses: string[];
  records: ComplianceRecord[];
}

/** compFyList(): the current FY plus one ahead and three back. */
export function compFyList(): { value: string; label: string }[] {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: { value: string; label: string }[] = [];
  for (let s = y + 1; s >= y - 3; s--) {
    out.push({ value: String(s), label: `FY${String(s).slice(2)}-${String(s + 1).slice(2)}` });
  }
  return out;
}

/** The web defaults to fys[1] — the current FY, since fys[0] is next year. */
export const defaultCompFy = () => {
  const l = compFyList();
  return (l[1] || l[0]).value;
};

export const COMP_MONTHS: [string, string][] = [
  ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'], ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'],
  ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'], ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'],
];

/** compPeriodsFor(): Apr..Dec of the FY start year, then Jan..Mar of the next. */
export function compPeriodsFor(freq: ComplianceDef['freq'], fy: string) {
  const y = parseInt(fy, 10);
  if (freq === 'annual') return [{ period: 'FY', label: 'Annual' }];
  if (freq === 'quarterly') {
    return [
      { period: `${fy}-Q1`, label: 'Q1 (Apr-Jun)' },
      { period: `${fy}-Q2`, label: 'Q2 (Jul-Sep)' },
      { period: `${fy}-Q3`, label: 'Q3 (Oct-Dec)' },
      { period: `${fy}-Q4`, label: 'Q4 (Jan-Mar)' },
    ];
  }
  return COMP_MONTHS.map(([mm, lbl], i) => ({ period: `${i < 9 ? y : y + 1}-${mm}`, label: lbl }));
}

/**
 * compRec(): a GSTIN-wise obligation matches on GSTIN when one is selected;
 * everything else takes the first record for that obligation and period.
 */
export function compRec(
  records: ComplianceRecord[], defs: ComplianceDef[],
  obligation: string, period: string, gstin: string,
): ComplianceRecord | undefined {
  const def = defs.find((d) => d.key === obligation);
  return records.find((r) => {
    if (r.obligation !== obligation || String(r.period) !== String(period)) return false;
    if (def?.gstinWise && gstin !== 'all') return String(r.gstin || '') === String(gstin);
    return true;
  });
}

/** compGstinList(): every GSTIN present in the loaded records. */
export function compGstinList(records: ComplianceRecord[]): string[] {
  const set = new Set<string>();
  records.forEach((r) => { if (r.gstin) set.add(r.gstin); });
  return [...set];
}

/** compStatusChip(): the four states, with the web's exact colours and labels. */
export function compStatusChip(st?: string): { bg: string; fg: string; label: string } | null {
  const m: Record<string, [string, string, string]> = {
    filed: ['#dcfce7', '#15803d', 'Filed'],
    pending: ['#fef9c3', '#854d0e', 'Pending'],
    overdue: ['#fee2e2', '#b91c1c', 'Overdue'],
    na: ['#f1f5f9', '#94a3b8', 'N/A'],
  };
  if (!st) return null;
  const c = m[st] || ['#f1f5f9', '#cbd5e1', '—'];
  return { bg: c[0], fg: c[1], label: c[2] };
}

/** compMoney(): Cr / L / K abbreviation, blank for zero. */
export function compMoney(n?: number): string {
  const v = Number(n) || 0;
  if (!v) return '';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

/** The four KPI counters, computed over every loaded record. */
export function complianceSummary(records: ComplianceRecord[]) {
  let filed = 0, pending = 0, overdue = 0, lateFee = 0;
  records.forEach((r) => {
    if (r.status === 'filed') filed++;
    else if (r.status === 'overdue') overdue++;
    else if (r.status === 'pending') pending++;
    lateFee += Number(r.lateFee) || 0;
  });
  return { filed, pending, overdue, lateFee };
}

/** The three frequency sections the grid is split into, in the web's order. */
export const FREQ_SECTIONS: { freq: ComplianceDef['freq']; title: string; rowHead: string }[] = [
  { freq: 'monthly', title: '📅 Monthly', rowHead: 'Month' },
  { freq: 'quarterly', title: '🗓 Quarterly', rowHead: 'Quarter' },
  { freq: 'annual', title: '📌 Annual', rowHead: '' },
];
