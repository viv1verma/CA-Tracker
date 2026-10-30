import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Select } from '../../components/form';
import { Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import ComplianceGrid from './ComplianceGrid';
import {
  FREQ_SECTIONS, compFyList, compGstinList, compPeriodsFor, compStatusChip,
  complianceSummary, defaultCompFy,
  type ComplianceResponse,
} from './logic';

/**
 * pg-clientcompliance — "Compliance Calendar" as the client sees it: their own
 * month-wise statutory filing status.
 *
 * Read-only, exactly as the web renders it for a client: renderCompliance() sets
 * `_compEditable = me.role==='admin' && !!_compClientId`, and a client passes no
 * clientId, so the page shows "View only" with no Upload Excel button and no
 * editable cells. There is no write action of any kind on this page.
 */
export default function ClientComplianceScreen() {
  const { showToast } = useToast();
  const [fy, setFy] = useState(defaultCompFy());
  const [gstin, setGstin] = useState('all');
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (o?: { refresh?: boolean }) => {
    if (o?.refresh) setRefreshing(true); else setState('loading');
    try {
      const r = await api.get<ComplianceResponse>(`${endpoints.clientCompliance}?fy=${fy}`);
      setData(r);
      setState('idle');
    } catch (e) {
      setState('error');
      if (o?.refresh) showToast(e instanceof ApiError ? e.message : 'Could not load compliance', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [fy]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <Loading label="Loading…" />;

  const defs = data?.defs || [];
  const records = data?.records || [];
  const gstins = compGstinList(records);
  const { filed, pending, overdue, lateFee } = complianceSummary(records);

  const kpis: [string, string | number, string][] = [
    ['Filed', filed, '#16a34a'],
    ['Pending', pending, '#854d0e'],
    ['Overdue', overdue, '#b91c1c'],
    ['Late Fee', `₹${lateFee.toLocaleString('en-IN')}`, '#1e3a8a'],
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />}>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Financial Year</Text>
        <Select value={fy} placeholder="FY" options={compFyList()} onChange={setFy} />
      </View>
      {/* The GSTIN filter appears only when the records carry GSTINs, as on web */}
      {!!gstins.length && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>GSTIN</Text>
          <Select value={gstin} placeholder="All GSTINs"
            options={[{ value: 'all', label: 'All GSTINs' },
              ...gstins.map((g) => ({ value: g, label: g }))]}
            onChange={setGstin} />
        </View>
      )}
      <Text style={styles.viewOnly}>View only</Text>

      {state === 'error' ? (
        <Text style={styles.msg}>Could not load compliance.</Text>
      ) : (
        <>
          <View style={styles.kpis}>
            {kpis.map(([l, v, c]) => (
              <View key={l} style={styles.kpi}>
                <Text style={[styles.kpiValue, { color: c }]}>{v}</Text>
                <Text style={styles.kpiLabel}>{l}</Text>
              </View>
            ))}
          </View>

          {FREQ_SECTIONS.map((sec) => (
            <ComplianceGrid
              key={sec.freq}
              title={sec.title}
              rowHead={sec.rowHead}
              defs={defs.filter((d) => d.freq === sec.freq)}
              periods={compPeriodsFor(sec.freq, fy)}
              records={records}
              gstin={gstin}
            />
          ))}

          <View style={styles.legend}>
            <Text style={styles.legendLabel}>Legend:</Text>
            {['filed', 'pending', 'overdue', 'na'].map((s) => {
              const c = compStatusChip(s)!;
              return (
                <View key={s} style={[styles.chip, { backgroundColor: c.bg }]}>
                  <Text style={[styles.chipText, { color: c.fg }]}>{c.label}</Text>
                </View>
              );
            })}
            <Text style={styles.legendLabel}>· ₹ = late fee</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  field: { marginBottom: spacing.sm },
  fieldLabel: { ...font.tiny, color: colors.muted, marginBottom: 3 },
  viewOnly: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },

  kpis: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  kpi: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center',
  },
  kpiValue: { fontSize: 20, fontWeight: '900' },
  kpiLabel: { ...font.tiny, color: colors.muted, textTransform: 'uppercase' },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: spacing.sm,
  },
  legendLabel: { ...font.tiny, fontWeight: '500', color: colors.muted },
  chip: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { ...font.tiny, fontWeight: '800' },

  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
