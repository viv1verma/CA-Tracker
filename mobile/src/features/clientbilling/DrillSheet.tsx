import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { colors, font, spacing } from '../../theme/theme';
import { fmtCli } from '../clientportal/logic';
import {
  METRIC_LABEL, drillValueOf, isBillingMetric,
  type PivotInvoice, type PivotMetric,
} from './logic';

/**
 * cbCellDrill() — the invoices behind one pivot cell. Billing metrics list the
 * taxable value, cash-flow metrics the net received, with a total row; a wide
 * five-column table becomes one card per invoice on a phone.
 */
export default function DrillSheet({
  visible, title, metric, invoices, loading, onClose,
}: {
  visible: boolean;
  title: string;
  metric: PivotMetric;
  invoices: PivotInvoice[] | null;
  loading: boolean;
  onClose: () => void;
}) {
  const amtHeader = isBillingMetric(metric) ? 'TAXABLE VALUE' : 'NET RECEIVED';
  const list = invoices || [];
  const total = list.reduce((s, iv) => s + drillValueOf(iv, metric), 0);

  return (
    <Sheet visible={visible} title={title || METRIC_LABEL[metric]} onClose={onClose}
      footer={<Button title="Close" onPress={onClose} />}>
      {loading ? (
        <Loading label="Loading invoices…" />
      ) : !list.length ? (
        <Text style={styles.empty}>No invoices</Text>
      ) : (
        <>
          <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
            {list.map((iv, i) => (
              <View key={`${iv.invoiceNo}-${i}`} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.inv}>{iv.invoiceNo || '—'}</Text>
                  <Text style={styles.amt}>
                    ₹{drillValueOf(iv, metric).toLocaleString('en-IN')}
                  </Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>{iv.customerName || '—'}</Text>
                <Text style={styles.meta}>
                  Inv {fmtCli(iv.invoiceDate)} · Paid {iv.actualDate ? fmtCli(iv.actualDate) : 'unpaid'}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total ({list.length})</Text>
            <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
          <Text style={styles.note}>{amtHeader}</Text>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  inv: { ...font.small, fontWeight: '800', color: colors.text, flexShrink: 1 },
  amt: { ...font.small, fontWeight: '800', color: colors.text },
  meta: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 8, marginTop: 4,
  },
  totalLabel: { ...font.small, fontWeight: '800', color: colors.text },
  totalValue: { ...font.small, fontWeight: '800', color: colors.text },
  note: { ...font.tiny, fontWeight: '600', color: colors.muted, textAlign: 'right', marginTop: 2 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
});
