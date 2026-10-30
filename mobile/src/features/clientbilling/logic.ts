import type { AuthUser } from '../../api/types';

/**
 * pg-clientbilling — "Billing & Payments" for a client login.
 *
 * The page has one reachable view. `cbDashboard` starts as 'overview' and the
 * only two assignments in the whole file (applyClientDashAccess / cbSwitch) set
 * it back to 'overview', so navTo('clientbilling') always lands in
 * renderCbOverview(). drawCbDashboard() and renderDebtorDashboard() — and with
 * them billingBars, cashLineChart, groupedBarChart, singleBarChart and
 * estVsActualChart — are unreachable dead code on this page. The chart that
 * actually renders is cbMiniBars(), reproduced here.
 *
 * This is not Row 10's admin invoice register and not Row 22a's task list: it
 * reads its own five /api/client/* endpoints with their own shapes.
 */

// ── Response shapes ─────────────────────────────────────────────────────────

/** GET /api/client/invoice-dashboard */
export interface InvoiceDashboard {
  hasData?: boolean;
  totals: { billed: number; received: number; pending: number; count: number };
  recovery?: {
    customer: string; avgDays: number | null; paidInvoices: number;
    outstanding: number; totalBilled: number; received: number;
  }[];
}

/** GET /api/client/invoice-filters */
export interface InvoiceFilters { customers: string[]; gstins: string[] }

/** One bucket of GET /api/client/billing-series */
export interface SeriesPoint {
  label: string;
  billed: number; received: number; pending: number;
  estimatedInflow: number; actualInflow: number;
}
export interface BillingSeries {
  hasData: boolean;
  fyList: { value: string; label: string }[];
  series: SeriesPoint[];
}

/** GET /api/client/billing-pivot */
export interface PivotCell {
  billed?: number; received?: number; pending?: number;
  estimated?: number; actual?: number; fy?: string;
}
export interface BillingPivot {
  hasData: boolean;
  fyCols: { startYear: number; label: string }[];
  rows: { label: string; cells: PivotCell[] }[];
  granularity?: string;
}

/** GET /api/client/pivot-cell */
export interface PivotInvoice {
  invoiceDate?: string; invoiceNo?: string; customerName?: string;
  taxableValue?: number; netReceivable?: number; actualDate?: string | null;
}

export type PivotMetric = 'billed' | 'pending' | 'actual' | 'estimated';

export const METRIC_LABEL: Record<PivotMetric, string> = {
  billed: 'Invoices Billed',
  pending: 'Pending Invoices',
  actual: 'Payments Received',
  estimated: 'Estimated Inflow',
};

/** Billing metrics show Taxable Value; cash-flow metrics show Net Received. */
export const isBillingMetric = (m: PivotMetric) => m === 'billed' || m === 'pending';
export const drillValueOf = (iv: PivotInvoice, m: PivotMetric) =>
  (isBillingMetric(m) ? iv.taxableValue : iv.netReceivable) || 0;

// ── Formatting ──────────────────────────────────────────────────────────────

/** lakh(): ₹ to lakhs, 2dp — the unit the whole page is denominated in. */
export const lakh = (n?: number) => (Math.round((n || 0) / 1000) / 100).toFixed(2);

/** The pivot prints '·' for an empty cell rather than 0.00. */
export const cellText = (v?: number) => (v ? lakh(v) : '·');

export const GRAN_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'half', label: 'Half-Yearly' },
  { value: 'annual', label: 'Annually' },
];

// ── Overview computation, mirroring renderCbOverview() ──────────────────────

/** The FY list comes from the series; the pivot's fyCols is the fallback. */
export function resolveFyList(
  seriesAll: BillingSeries | null, pivot: BillingPivot | null,
): { value: string; label: string }[] {
  const fromSeries = seriesAll?.fyList || [];
  if (fromSeries.length) return fromSeries;
  const cols = pivot?.fyCols || [];
  return cols.map((c) => ({ value: String(c.startYear), label: c.label }));
}

/** Default to the latest FY when none is chosen or the chosen one has gone. */
export function defaultFy(fyList: { value: string }[], current: string): string {
  if (current && current !== 'all' && fyList.some((f) => String(f.value) === String(current))) {
    return current;
  }
  return fyList.length ? String(fyList[fyList.length - 1].value) : 'all';
}

/** The dashboard shows one year at a time: keep only the selected FY column. */
export function trimPivotToFy(pivot: BillingPivot | null, fyLabel: string): BillingPivot {
  const pv = pivot?.hasData ? pivot : { hasData: false, fyCols: [], rows: [] };
  const cols = pv.fyCols || [];
  if (!cols.length) return { hasData: false, fyCols: [], rows: [] };
  const keep = cols.findIndex((c) => c.label === fyLabel);
  if (keep < 0) return pv;
  return {
    hasData: true,
    fyCols: [cols[keep]],
    rows: (pv.rows || [])
      .map((r) => ({ label: r.label, cells: [r.cells[keep]] }))
      .filter((r) => r.cells[0]),
  };
}

/** The trend charts use the last 6 buckets that carry any value at all. */
export function trendWindow(series: SeriesPoint[]): SeriesPoint[] {
  const nonEmpty = series.filter(
    (d) => d.billed || d.pending || d.actualInflow || d.estimatedInflow,
  );
  return (nonEmpty.length ? nonEmpty : series).slice(-6);
}

export const BILL_COLORS = { a: '#2563eb', b: '#dc2626' };   // Billed / Pending
export const CASH_COLORS = { a: '#16a34a', b: '#d97706' };   // Actual / Estimated

export interface BarRow { label: string; bars: [string, number][] }

export const billTrendRows = (w: SeriesPoint[]): BarRow[] => w.map((d) => ({
  label: d.label, bars: [[BILL_COLORS.a, d.billed || 0], [BILL_COLORS.b, d.pending || 0]],
}));
export const cashTrendRows = (w: SeriesPoint[]): BarRow[] => w.map((d) => ({
  label: d.label, bars: [[CASH_COLORS.a, d.actualInflow || 0], [CASH_COLORS.b, d.estimatedInflow || 0]],
}));

/** Top Debtors: positive outstanding only, largest first, at most 12 shown. */
export function topDebtors(dash: InvoiceDashboard | null) {
  const rec = dash?.recovery || [];
  const list = rec.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  const totalOut = rec.reduce((s, r) => s + (r.outstanding > 0 ? r.outstanding : 0), 0);
  return { debtors: list.slice(0, 12), top: list[0] || null, totalOut };
}

/** Collected as a percentage of billed — the Collected KPI's sub-line. */
export const collectRate = (t: InvoiceDashboard['totals']) =>
  t.billed ? Math.round((t.received / t.billed) * 100) : 0;

/** The pivot's two sub-columns per FY, per panel. */
export const PANEL = {
  billing: { subA: 'Bill', subB: 'Pend', metA: 'billed' as PivotMetric, metB: 'pending' as PivotMetric,
    colA: BILL_COLORS.a, colB: BILL_COLORS.b },
  cash: { subA: 'Act', subB: 'Est', metA: 'actual' as PivotMetric, metB: 'estimated' as PivotMetric,
    colA: CASH_COLORS.a, colB: CASH_COLORS.b },
};

export const pivotValue = (c: PivotCell, kind: 'billing' | 'cash', which: 'a' | 'b') => {
  if (kind === 'billing') return (which === 'a' ? c.billed : c.pending) || 0;
  return (which === 'a' ? c.actual : c.estimated) || 0;
};

/** cbFilterQS(): company, customer and GSTIN ride on every request. */
export function filterQS(company: string, customer: string, gstin: string): string {
  let qs = '';
  if (company && company !== 'all') qs += `&company=${encodeURIComponent(company)}`;
  if (customer && customer !== 'all') qs += `&customer=${encodeURIComponent(customer)}`;
  if (gstin && gstin !== 'all') qs += `&gstin=${encodeURIComponent(gstin)}`;
  return qs;
}

/** The Company field appears only for a group login, as in cbOverviewFilterBar(). */
export function companyOptions(u: AuthUser | null) {
  if (!u?.isGroup || !Array.isArray(u.companies)) return null;
  return [{ value: 'all', label: '🏢 All Companies' },
    ...u.companies.map((c) => ({ value: c.id, name: c.name, label: c.name }))];
}
