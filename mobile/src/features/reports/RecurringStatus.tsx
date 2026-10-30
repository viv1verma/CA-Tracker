import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Select } from '../../components/form';
import { Button } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme/theme';
import { recStatusStyle, type RecurringReport } from './logic';

/**
 * rpRecurring() + renderRecReport() — the client × month grid of recurring-task
 * status, with the same 3/6/12-month window and Excel/PDF downloads. This is the
 * one report a non-admin (e.g. a partner) can open.
 */
const MONTH_OPTIONS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
];

export default function RecurringStatus({
  report, months, onMonths, onExcel, onPdf, busy,
}: {
  report: RecurringReport | null;
  months: string;
  onMonths: (v: string) => void;
  onExcel: () => void;
  onPdf: () => void;
  busy: 'excel' | 'pdf' | null;
}) {
  return (
    <>
      <Text style={styles.title}>📅 Monthly Recurring Status</Text>
      <View style={{ marginBottom: spacing.sm }}>
        <Select value={months} placeholder="Last 6 months" options={MONTH_OPTIONS} onChange={onMonths} />
      </View>
      <View style={styles.btnRow}>
        <View style={{ flex: 1 }}>
          <Button title="⬇ Excel" onPress={onExcel} variant="outline" loading={busy === 'excel'} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="⬇ PDF" onPress={onPdf} variant="outline" loading={busy === 'pdf'} />
        </View>
      </View>

      {!report ? null : !report.rows.length ? (
        <Text style={styles.empty}>No recurring tasks found.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.headRow}>
                  <Text style={[styles.headCell, { width: 160 }]}>CLIENT NAME</Text>
                  <Text style={[styles.headCell, { width: 130 }]}>WORK TYPE</Text>
                  {report.months.map((m) => (
                    <Text key={m.key} style={[styles.headCell, { width: 96, textAlign: 'center' }]}>
                      {m.label}
                    </Text>
                  ))}
                </View>
                {report.rows.map((r, i) => (
                  <View key={`${r.clientName}-${r.workType}-${i}`}
                    style={[styles.row, i % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                    <Text style={[styles.cell, styles.clientCell, { width: 160 }]}>{r.clientName}</Text>
                    <Text style={[styles.cell, { width: 130 }]}>{r.workType}</Text>
                    {r.cells.map((c, ci) => {
                      const st = recStatusStyle(c?.status);
                      return (
                        <View key={ci} style={[styles.statusCell, { width: 96 }]}>
                          {c ? (
                            <View style={[styles.badge, { backgroundColor: st.bg }]}>
                              <Text style={[styles.badgeText, { color: st.fg }]} numberOfLines={1}>
                                {st.icon} {c.status}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.dash}>–</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          <Text style={styles.legend}>
            ✓ Completed · ⏳ Under Review · ▶ In Progress · ○ Pending · – not scheduled
          </Text>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden',
  },
  headRow: { flexDirection: 'row', backgroundColor: '#1e3a8a' },
  headCell: {
    ...font.small, color: colors.white, fontWeight: '800',
    paddingVertical: 10, paddingHorizontal: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cell: { ...font.small, color: colors.text, paddingVertical: 9, paddingHorizontal: 12 },
  clientCell: { fontWeight: '700' },
  statusCell: { paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { ...font.tiny, fontWeight: '800' },
  dash: { ...font.small, color: '#cbd5e1' },

  legend: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
