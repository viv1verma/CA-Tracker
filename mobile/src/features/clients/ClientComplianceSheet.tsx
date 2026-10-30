import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/permissions';
import { Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import type { Client } from '../../data/types';
import { readPickedAsBase64 } from '../../lib/files';
import { colors, font, radius, spacing } from '../../theme/theme';
import ComplianceGrid from '../clientcompliance/ComplianceGrid';
import {
  FREQ_SECTIONS, compFyList, compGstinList, compPeriodsFor, compStatusChip,
  complianceSummary, defaultCompFy,
  type ComplianceResponse,
} from '../clientcompliance/logic';
import ComplianceCellSheet from './ComplianceCellSheet';

/**
 * openComplianceEditor(clientId) → renderCompliance(clientId): the admin's
 * per-client compliance editor, opened from the client profile.
 *
 * The web serves this and the client self-view from one renderer; the difference
 * is `_compEditable = me.role==='admin' && !!_compClientId`, which turns on the
 * Upload Excel button and tap-to-edit cells and switches the endpoint to the
 * admin `/api/clients/:id/compliance`. The grid and the pure helpers are shared
 * with PARITY row 22c unchanged.
 */
export default function ClientComplianceSheet({
  client, visible, onClose,
}: {
  client: Client | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const admin = isAdmin(user);

  const [fy, setFy] = useState(defaultCompFy());
  const [gstin, setGstin] = useState('all');
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [importing, setImporting] = useState(false);
  const [cell, setCell] = useState<{ obligation: string; period: string } | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setState('loading');
    try {
      setData(await api.get<ComplianceResponse>(
        `${endpoints.clientComplianceAdmin(client.id)}?fy=${fy}`,
      ));
      setState('idle');
    } catch {
      setState('error');
    }
  }, [client?.id, fy]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (visible) void load(); }, [visible, load]);

  if (!client) return null;

  const defs = data?.defs || [];
  const records = data?.records || [];
  const statuses = data?.statuses || ['pending', 'filed', 'overdue', 'na'];
  const gstins = compGstinList(records);
  const { filed, pending, overdue, lateFee } = complianceSummary(records);

  /**
   * compEdit()'s guard: a GSTIN-wise obligation cannot be edited while the filter
   * is on "all" and GSTINs exist, because the record could not be addressed.
   */
  const openCell = (obligation: string, period: string) => {
    const def = defs.find((d) => d.key === obligation);
    if (def?.gstinWise && (gstin === 'all' || !gstin) && gstins.length > 0) {
      showToast(`Select a specific GSTIN above to edit ${def.label}`, 'error');
      return;
    }
    setCell({ obligation, period });
  };

  /** compImportExcel(): the file picker replaces <input type=file> + FileReader. */
  const importExcel = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    setImporting(true);
    showToast('Importing…');
    try {
      const b64 = await readPickedAsBase64(picked.assets[0].uri);
      const res = await api.post<{ imported?: number }>(
        endpoints.clientComplianceImport(client.id),
        { fileBase64: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}` },
        { timeoutMs: 60000 },
      );
      showToast(`Imported ${res?.imported || 0} compliance entries`);
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const kpis: [string, string | number, string][] = [
    ['Filed', filed, '#16a34a'],
    ['Pending', pending, '#854d0e'],
    ['Overdue', overdue, '#b91c1c'],
    ['Late Fee', `₹${lateFee.toLocaleString('en-IN')}`, '#1e3a8a'],
  ];

  return (
    <>
      <Sheet visible={visible && !cell} title={`Compliance · ${client.name}`} onClose={onClose}
        footer={<Button title="Close" onPress={onClose} />}>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Financial Year</Text>
          <Select value={fy} placeholder="FY" options={compFyList()} onChange={setFy} />
        </View>
        {!!gstins.length && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>GSTIN</Text>
            <Select value={gstin} placeholder="All GSTINs"
              options={[{ value: 'all', label: 'All GSTINs' },
                ...gstins.map((g) => ({ value: g, label: g }))]}
              onChange={setGstin} />
          </View>
        )}

        {admin && (
          <View style={{ marginBottom: spacing.sm }}>
            <Button title="⬆ Upload Excel" onPress={importExcel} loading={importing} />
          </View>
        )}
        <Text style={styles.hint}>
          {admin
            ? 'Tap any cell to edit · or upload the filled GARP template'
            : 'View only'}
        </Text>

        {state === 'loading' ? (
          <Text style={styles.msg}>Loading…</Text>
        ) : state === 'error' ? (
          <Text style={[styles.msg, { color: colors.red }]}>Could not load compliance.</Text>
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

            <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
              {FREQ_SECTIONS.map((sec) => (
                <ComplianceGrid
                  key={sec.freq}
                  title={sec.title}
                  rowHead={sec.rowHead}
                  defs={defs.filter((d) => d.freq === sec.freq)}
                  periods={compPeriodsFor(sec.freq, fy)}
                  records={records}
                  gstin={gstin}
                  editable={admin}
                  onCellPress={openCell}
                />
              ))}
            </ScrollView>

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
      </Sheet>

      <ComplianceCellSheet
        clientId={client.id}
        fy={fy}
        gstin={gstin}
        defs={defs}
        statuses={statuses}
        records={records}
        target={cell}
        onClose={() => setCell(null)}
        onSaved={() => void load()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.sm },
  fieldLabel: { ...font.tiny, color: colors.muted, marginBottom: 3 },
  hint: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },

  kpis: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  kpi: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center',
  },
  kpiValue: { fontSize: 18, fontWeight: '900' },
  kpiLabel: { ...font.tiny, color: colors.muted, textTransform: 'uppercase' },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: spacing.sm,
  },
  legendLabel: { ...font.tiny, fontWeight: '500', color: colors.muted },
  chip: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { ...font.tiny, fontWeight: '800' },

  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
});
