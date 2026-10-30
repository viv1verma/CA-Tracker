import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import DrillSheet from './DrillSheet';
import MiniBars from './MiniBars';
import {
  BILL_COLORS, CASH_COLORS, GRAN_OPTIONS, METRIC_LABEL, PANEL,
  billTrendRows, cashTrendRows, cellText, collectRate, companyOptions, defaultFy,
  filterQS, lakh, pivotValue, resolveFyList, topDebtors, trendWindow, trimPivotToFy,
  type BillingPivot, type BillingSeries, type InvoiceDashboard, type InvoiceFilters,
  type PivotInvoice, type PivotMetric,
} from './logic';

/**
 * pg-clientbilling — "Billing & Payments". The single combined overview the web
 * always renders: filter bar, four KPIs, a Billing panel and a Cash Flow panel
 * (each a month × FY pivot with a drill-down plus a trend chart), and Top Debtors.
 *
 * Reads only. Five GETs, all on the client-scoped /api/client/* family; the
 * server rejects any role but `client` and resolves which client's invoices are
 * visible itself, so nothing here can widen access.
 */
export default function ClientBillingScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState('all');
  const [customer, setCustomer] = useState('all');
  const [gstin, setGstin] = useState('all');
  const [fy, setFy] = useState('all');
  const [gran, setGran] = useState('month');

  const [opts, setOpts] = useState<InvoiceFilters>({ customers: [], gstins: [] });
  const [fyList, setFyList] = useState<{ value: string; label: string }[]>([]);
  const [dash, setDash] = useState<InvoiceDashboard | null>(null);
  const [pivot, setPivot] = useState<BillingPivot | null>(null);
  const [series, setSeries] = useState<BillingSeries | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'empty' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const [drill, setDrill] = useState<{
    open: boolean; title: string; metric: PivotMetric; rows: PivotInvoice[] | null; loading: boolean;
  }>({ open: false, title: '', metric: 'billed', rows: null, loading: false });

  const load = useCallback(async (o?: { refresh?: boolean }) => {
    if (o?.refresh) setRefreshing(true); else setState('loading');
    const fq = filterQS(company, customer, gstin);
    try {
      // Filter options once per company context, as the web caches _cbFilterOpts.
      try {
        setOpts(await api.get<InvoiceFilters>(
          `${endpoints.clientInvoiceFilters}${fq ? `?${fq.slice(1)}` : ''}`, { background: true },
        ));
      } catch { setOpts({ customers: [], gstins: [] }); }

      const [seriesAll, pv] = await Promise.all([
        api.get<BillingSeries>(`${endpoints.clientBillingSeries}?fy=all&gran=month${fq}`).catch(() => null),
        api.get<BillingPivot>(`${endpoints.clientBillingPivot}?gran=${gran}${fq}`).catch(() => null),
      ]);

      const list = resolveFyList(seriesAll, pv);
      setFyList(list);
      if (!list.length) { setPivot(null); setDash(null); setSeries(null); setState('empty'); return; }

      const chosen = defaultFy(list, fy);
      if (chosen !== fy) setFy(chosen);

      const [d, s] = await Promise.all([
        api.get<InvoiceDashboard>(
          `${endpoints.clientInvoiceDashboard}?fy=${encodeURIComponent(chosen)}${fq}`),
        api.get<BillingSeries>(
          `${endpoints.clientBillingSeries}?fy=${encodeURIComponent(chosen)}&gran=month${fq}`),
      ]);
      setDash(d?.totals ? d : { totals: { billed: 0, received: 0, pending: 0, count: 0 }, recovery: [] });
      setSeries(s);
      setPivot(pv);
      setState('idle');
    } catch (e) {
      setState('error');
      if (o?.refresh) showToast(e instanceof ApiError ? e.message : 'Could not load', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [company, customer, gstin, fy, gran]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const openDrill = async (rowLabel: string, fyLabel: string, metric: PivotMetric) => {
    setDrill({ open: true, title: `${rowLabel} ${fyLabel} — ${METRIC_LABEL[metric]}`, metric, rows: null, loading: true });
    const fq = filterQS(company, customer, gstin);
    try {
      const rows = await api.get<PivotInvoice[]>(
        `${endpoints.clientPivotCell}?gran=${gran}&row=${encodeURIComponent(rowLabel)}`
        + `&fy=${encodeURIComponent(fyLabel)}&metric=${metric}${fq}`,
      );
      setDrill((p) => ({ ...p, rows: rows || [], loading: false }));
    } catch (e) {
      setDrill((p) => ({ ...p, open: false, loading: false }));
      showToast(e instanceof ApiError ? e.message : 'Could not load invoices', 'error');
    }
  };

  const companies = companyOptions(user);
  const selLabel = fyList.find((f) => String(f.value) === String(fy))?.label || '';
  const pv = trimPivotToFy(pivot, selLabel);
  const t = dash?.totals || { billed: 0, received: 0, pending: 0, count: 0 };
  const { debtors, top, totalOut } = topDebtors(dash);
  const window = trendWindow(series?.series || []);
  const hasFilter = customer !== 'all' || gstin !== 'all' || company !== 'all';

  const Panel = ({ kind }: { kind: 'billing' | 'cash' }) => {
    const p = PANEL[kind];
    const rows = pv.rows || [];
    const cols = pv.fyCols || [];
    const totA = rows.reduce((s, r) => s + pivotValue(r.cells[0] || {}, kind, 'a'), 0);
    const totB = rows.reduce((s, r) => s + pivotValue(r.cells[0] || {}, kind, 'b'), 0);
    return (
      <View style={styles.panel}>
        <Text style={styles.panelHead}>
          {kind === 'billing' ? '📊 Billing · ₹L' : '💰 Cash Flow · ₹L'}
        </Text>

        {!cols.length || !rows.length ? (
          <Text style={styles.noData}>No data</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, styles.thMonth]}>Month</Text>
              <Text style={[styles.th, styles.thNum]}>{p.subA}</Text>
              <Text style={[styles.th, styles.thNum]}>{p.subB}</Text>
            </View>
            {rows.map((r, ri) => {
              const c = r.cells[0] || {};
              const a = pivotValue(c, kind, 'a');
              const b = pivotValue(c, kind, 'b');
              const fyl = c.fy || selLabel;
              return (
                <View key={r.label} style={[styles.tr, ri % 2 === 1 && { backgroundColor: '#fafafa' }]}>
                  <Text style={[styles.td, styles.thMonth, { fontWeight: '700' }]}>{r.label}</Text>
                  <Pressable style={styles.thNum} accessibilityRole="button"
                    onPress={() => void openDrill(r.label, fyl, p.metA)}>
                    <Text style={[styles.tdNum, { color: p.colA, fontWeight: '700' }]}>{cellText(a)}</Text>
                  </Pressable>
                  <Pressable style={styles.thNum} accessibilityRole="button"
                    onPress={() => void openDrill(r.label, fyl, p.metB)}>
                    <Text style={[styles.tdNum, { color: b ? p.colB : '#cbd5e1' }]}>{cellText(b)}</Text>
                  </Pressable>
                </View>
              );
            })}
            <View style={styles.tfRow}>
              <Text style={[styles.tf, styles.thMonth]}>Tot</Text>
              <Text style={[styles.tf, styles.thNum, { color: p.colA, textAlign: 'right' }]}>{lakh(totA)}</Text>
              <Text style={[styles.tf, styles.thNum, { color: p.colB, textAlign: 'right' }]}>{lakh(totB)}</Text>
            </View>
          </View>
        )}

        <View style={styles.trendHead}>
          <Text style={styles.trendLabel}>TREND</Text>
          <Text style={styles.legend}>
            <Text style={{ color: p.colA, fontWeight: '700' }}>■ {kind === 'billing' ? 'Billed' : 'Actual'}</Text>
            {'  '}
            <Text style={{ color: p.colB, fontWeight: '700' }}>■ {kind === 'billing' ? 'Pending' : 'Estimated'}</Text>
          </Text>
        </View>
        <MiniBars rows={kind === 'billing' ? billTrendRows(window) : cashTrendRows(window)} />
      </View>
    );
  };

  if (state === 'loading') return <Loading label="Loading…" />;

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />}>

        {/* cbOverviewFilterBar */}
        {!!companies && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Company</Text>
            <Select value={company} placeholder="All Companies" options={companies}
              onChange={(v) => { setCompany(v); setCustomer('all'); setGstin('all'); }} />
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Customer</Text>
          <Select value={customer} placeholder="All Customers" searchable
            options={[{ value: 'all', label: 'All Customers' },
              ...(opts.customers || []).map((c) => ({ value: c, label: c }))]}
            onChange={setCustomer} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>GSTIN</Text>
          <Select value={gstin} placeholder="All GSTIN"
            options={[{ value: 'all', label: 'All GSTIN' },
              ...(opts.gstins || []).map((g) => ({ value: g, label: g }))]}
            onChange={setGstin} />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Year</Text>
            <Select value={fy} placeholder="Year" options={fyList} onChange={setFy} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Period</Text>
            <Select value={gran} placeholder="Monthly" options={GRAN_OPTIONS} onChange={setGran} />
          </View>
        </View>
        {(customer !== 'all' || gstin !== 'all') && (
          <Pressable onPress={() => { setCustomer('all'); setGstin('all'); }}
            accessibilityRole="button" style={styles.clearBtn}>
            <Text style={styles.clearText}>✕ Clear</Text>
          </Pressable>
        )}

        {state === 'error' ? (
          <Text style={styles.msg}>Could not load.</Text>
        ) : state === 'empty' ? (
          <Text style={styles.msg}>
            {hasFilter ? 'No data for the selected filter.' : 'No invoice register uploaded yet.'}
          </Text>
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Billed</Text>
                <Text style={[styles.kpiValue, { color: '#1e3a8a' }]}>₹{lakh(t.billed)}L</Text>
                <Text style={styles.kpiSub}>{t.count || 0} inv</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Collected</Text>
                <Text style={[styles.kpiValue, { color: '#16a34a' }]}>₹{lakh(t.received)}L</Text>
                <Text style={styles.kpiSub}>{collectRate(t)}% of billed</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Pending</Text>
                <Text style={[styles.kpiValue, { color: '#dc2626' }]}>₹{lakh(t.pending)}L</Text>
                <Text style={styles.kpiSub}>outstanding</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Top debtor</Text>
                <Text style={[styles.kpiValue, { color: '#d97706' }]}>
                  ₹{lakh(top ? top.outstanding : 0)}L
                </Text>
                <Text style={styles.kpiSub} numberOfLines={1}>{top ? top.customer : '—'}</Text>
              </View>
            </View>

            <Panel kind="billing" />
            <Panel kind="cash" />

            {/* Top Debtors */}
            <View style={styles.panel}>
              <View style={styles.debtHead}>
                <Text style={styles.panelTitle}>⏱ Top Debtors</Text>
                <Text style={styles.kpiSub}>₹{lakh(totalOut)}L</Text>
              </View>
              {!debtors.length ? (
                <Text style={styles.noData}>No outstanding dues 🎉</Text>
              ) : debtors.map((d) => {
                const pct = totalOut ? Math.round((d.outstanding / totalOut) * 100) : 0;
                return (
                  <View key={d.customer} style={{ marginBottom: 8 }}>
                    <View style={styles.debtRow}>
                      <Text style={styles.debtName} numberOfLines={1}>{d.customer || '—'}</Text>
                      <Text style={styles.debtAmt}>₹{lakh(d.outstanding)}L</Text>
                    </View>
                    <View style={styles.debtTrack}>
                      <View style={[styles.debtFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={styles.footNote}>
              All ₹ Lakhs · Bill/Pend = taxable · Act/Est = cash · use the filters above to change
              period or customer
            </Text>
          </>
        )}
      </ScrollView>

      <DrillSheet visible={drill.open} title={drill.title} metric={drill.metric}
        invoices={drill.rows} loading={drill.loading}
        onClose={() => setDrill((p) => ({ ...p, open: false }))} />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  field: { marginBottom: spacing.sm },
  fieldLabel: { ...font.tiny, color: colors.muted, marginBottom: 3 },
  row: { flexDirection: 'row', gap: spacing.sm },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: spacing.sm },
  clearText: { ...font.small, fontWeight: '600', color: colors.muted },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  kpi: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 11,
  },
  kpiLabel: { ...font.tiny, color: colors.muted, textTransform: 'uppercase' },
  kpiValue: { fontSize: 19, fontWeight: '900', marginTop: 1 },
  kpiSub: { ...font.tiny, fontWeight: '500', color: colors.muted },

  panel: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  panelHead: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  panelTitle: { ...font.h3, color: colors.text },
  noData: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.md },

  table: { marginBottom: spacing.md },
  thRow: { flexDirection: 'row', backgroundColor: '#1e3a8a' },
  th: { ...font.tiny, color: colors.white, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 6 },
  thMonth: { flex: 1.4, textAlign: 'left' },
  thNum: { flex: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  td: { ...font.small, color: colors.text, paddingVertical: 5, paddingHorizontal: 6 },
  tdNum: { ...font.small, textAlign: 'right', paddingVertical: 5, paddingHorizontal: 6 },
  tfRow: { flexDirection: 'row', backgroundColor: '#eef2ff' },
  tf: { ...font.small, fontWeight: '800', paddingVertical: 5, paddingHorizontal: 6, color: colors.text },

  trendHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  trendLabel: { ...font.tiny, fontWeight: '800', color: colors.muted },
  legend: { ...font.tiny },

  debtHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  debtRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  debtName: { ...font.small, fontWeight: '700', color: colors.text, flexShrink: 1 },
  debtAmt: { ...font.small, fontWeight: '800', color: '#dc2626' },
  debtTrack: { height: 5, backgroundColor: '#f1f5f9', borderRadius: 3, marginTop: 2, overflow: 'hidden' },
  debtFill: { height: '100%', backgroundColor: '#dc2626' },

  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
  footNote: { ...font.tiny, fontWeight: '500', color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});
