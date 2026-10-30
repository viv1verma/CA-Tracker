import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../../theme/theme';
import {
  compMoney, compRec, compStatusChip,
  type ComplianceDef, type ComplianceRecord,
} from './logic';

/**
 * One frequency section of renderCompliance()'s grid: period rows × obligation
 * columns. The web table is far wider than a phone, so it scrolls horizontally
 * with the period column pinned in place — no cell content is dropped.
 *
 * `editable` / `onCellPress` exist because the web serves the admin's per-client
 * editor from this same renderer. They are unused by the client self-view, which
 * the web renders read-only; they are the reusable half for PARITY row 10's
 * still-deferred admin editor.
 */
export default function ComplianceGrid({
  title, rowHead, defs, periods, records, gstin, editable, onCellPress,
}: {
  title: string;
  rowHead: string;
  defs: ComplianceDef[];
  periods: { period: string; label: string }[];
  records: ComplianceRecord[];
  gstin: string;
  editable?: boolean;
  onCellPress?: (obligation: string, period: string) => void;
}) {
  if (!defs.length) return null;

  const Cell = ({ def, period }: { def: ComplianceDef; period: string }) => {
    const r = compRec(records, defs, def.key, period, gstin);
    const chip = compStatusChip(r?.status);
    const body = (
      <View style={styles.cellInner}>
        {chip ? (
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.chipText, { color: chip.fg }]}>{chip.label}</Text>
          </View>
        ) : (
          <Text style={styles.plus}>+</Text>
        )}
        {!!(def.amt1 && r?.amount) && (
          <Text style={styles.amt1}>{compMoney(r.amount)}</Text>
        )}
        {!!(def.amt2 && r?.amount2) && (
          <Text style={styles.amt2}>ITC {compMoney(r.amount2)}</Text>
        )}
        {!!r?.lateFee && <Text style={styles.fee}>LF ₹{r.lateFee}</Text>}
      </View>
    );
    if (editable && onCellPress) {
      return (
        <Pressable accessibilityRole="button" style={styles.cell}
          onPress={() => onCellPress(def.key, period)}>
          {body}
        </Pressable>
      );
    }
    return <View style={styles.cell}>{body}</View>;
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.headRow}>
            <Text style={[styles.headCell, styles.periodCol]}>{rowHead}</Text>
            {defs.map((d) => (
              <Text key={d.key} style={[styles.headCell, styles.dataCol]} numberOfLines={2}>
                {d.label}
              </Text>
            ))}
          </View>
          {periods.map((p) => (
            <View key={p.period} style={styles.row}>
              <Text style={[styles.periodCell, styles.periodCol]} numberOfLines={1}>{p.label}</Text>
              {defs.map((d) => (
                <View key={d.key} style={styles.dataCol}>
                  <Cell def={d} period={p.period} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm,
  },
  cardTitle: {
    ...font.small, fontWeight: '800', color: colors.text,
    paddingVertical: 7, paddingHorizontal: 10,
    backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headRow: { flexDirection: 'row', backgroundColor: '#1e3a8a' },
  headCell: {
    ...font.tiny, color: colors.white, fontWeight: '800',
    paddingVertical: 6, paddingHorizontal: 7, textAlign: 'center',
  },
  periodCol: { width: 96, textAlign: 'left' },
  dataCol: { width: 104 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  periodCell: {
    ...font.small, fontWeight: '700', color: colors.text,
    paddingVertical: 8, paddingHorizontal: 8,
  },
  cell: { paddingVertical: 5, paddingHorizontal: 6, alignItems: 'center' },
  cellInner: { alignItems: 'center' },
  chip: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { ...font.tiny, fontWeight: '800' },
  plus: { ...font.small, color: '#cbd5e1' },
  amt1: { fontSize: 8.5, fontWeight: '700', color: '#1e3a8a', marginTop: 1 },
  amt2: { fontSize: 8.5, fontWeight: '700', color: '#7c3aed', marginTop: 1 },
  fee: { fontSize: 8, fontWeight: '700', color: '#b91c1c', marginTop: 1 },
});
