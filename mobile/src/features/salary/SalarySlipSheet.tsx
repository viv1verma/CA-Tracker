import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import { MONTH_NAMES, inr, type SalaryRecord } from './logic';
import { printSalarySlip } from './slip';

/**
 * salSlipSheet — openSalarySlip()'s printable slip, with the same Email and
 * Print actions in the header. Email hits POST /salary/:id/:y/:m/email, which
 * really sends mail, so it is confirmed first exactly as the web confirms.
 */
export default function SalarySlipSheet({
  record, visible, onClose,
}: {
  record: SalaryRecord | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!record) return null;
  const s = record;

  const meta: [string, string][] = [
    ['Employee', s.userName],
    ['Designation', s.designation || '—'],
    ['Department', s.branch || '—'],
    ['Joining', s.joiningDate ? fmt(s.joiningDate) : '—'],
    ['Working Days', String(s.workingDays)],
    ['Present Days', String(s.presentDays)],
    ['Absent', String(s.absentDays)],
    ['Leave Balance', `${s.leaveBalance?.remaining ?? 0} days`],
  ];

  const earnings: [string, number][] = [
    ['Basic Salary', s.basic],
    ['HRA', s.hra],
    ['Conveyance', s.conveyance],
    ['Other Allowance', s.otherAllowance],
  ];
  const deductions: [string, number][] = [
    ['Absence Deduction', s.absenceDeduction],
    ['PF (12%)', s.pf],
    ['ESI (0.75%)', s.esi],
  ];

  const print = async () => {
    setBusy(true);
    try {
      await printSalarySlip(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not build the slip', 'error');
    } finally {
      setBusy(false);
    }
  };

  const email = () => {
    Alert.alert(
      'Email salary slip',
      `Email the ${s.userName} salary slip for ${MONTH_NAMES[s.month - 1]} ${s.year}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await api.post<{ ok: boolean; sentTo?: string }>(
                endpoints.salaryEmail(s.userId, s.year, s.month), {},
              );
              showToast(`Slip emailed to ${r?.sentTo || 'employee'}`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not send email', 'error');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Sheet
      visible={visible}
      title="💰 Salary Slip"
      onClose={onClose}
      footer={<Button title="Close" onPress={onClose} />}
    >
      <View style={styles.actions}>
        <Pressable onPress={email} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
          <Text style={styles.actionText}>📧 Email</Text>
        </Pressable>
        <Pressable onPress={print} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.actionText, { color: colors.white }]}>🖨 Print</Text>
        </Pressable>
      </View>

      <View style={styles.slipHead}>
        <Text style={styles.logo}>G A R P</Text>
        <Text style={styles.firm}>&amp; Associates — {s.branch || ''}</Text>
        <Text style={styles.slipTitle}>
          SALARY SLIP — {MONTH_NAMES[s.month - 1]} {s.year}
        </Text>
      </View>

      <View style={styles.metaGrid}>
        {meta.map(([l, v]) => (
          <View key={l} style={styles.metaCell}>
            <Text style={styles.metaLabel}>{l}:</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionHead}>EARNINGS</Text>
      {earnings.map(([l, v]) => (
        <View key={l} style={styles.line}>
          <Text style={styles.lineLabel}>{l}</Text>
          <Text style={styles.lineValue}>{inr(v)}</Text>
        </View>
      ))}
      <View style={[styles.line, styles.subtotal]}>
        <Text style={styles.subtotalLabel}>GROSS SALARY</Text>
        <Text style={styles.subtotalValue}>{inr(s.grossSalary)}</Text>
      </View>

      <Text style={styles.sectionHead}>DEDUCTIONS</Text>
      {deductions.map(([l, v]) => (
        <View key={l} style={styles.line}>
          <Text style={styles.lineLabel}>{l}</Text>
          <Text style={[styles.lineValue, { color: colors.red }]}>{inr(v)}</Text>
        </View>
      ))}
      <View style={[styles.line, styles.subtotal]}>
        <Text style={styles.subtotalLabel}>TOTAL DEDUCTIONS</Text>
        <Text style={[styles.subtotalValue, { color: colors.red }]}>{inr(s.totalDeduction)}</Text>
      </View>

      <View style={styles.netRow}>
        <Text style={styles.netLabel}>NET PAY</Text>
        <Text style={styles.netValue}>{inr(s.netPay)}</Text>
      </View>

      <Text style={styles.disclaimer}>
        This is a computer generated salary slip. | G A R P &amp; Associates
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  action: {
    flex: 1, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { ...font.tiny, fontWeight: '800', color: colors.text },

  slipHead: {
    alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.primary,
    paddingBottom: spacing.md, marginBottom: spacing.md,
  },
  logo: { fontSize: 24, fontWeight: '900', color: colors.primary, letterSpacing: 2 },
  firm: { ...font.small, color: colors.muted },
  slipTitle: { ...font.h3, fontWeight: '800', marginTop: 6, color: colors.text },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  metaCell: { width: '50%', flexDirection: 'row', gap: 4, paddingVertical: 3 },
  metaLabel: { ...font.small, fontWeight: '500', color: colors.muted },
  metaValue: { ...font.small, fontWeight: '800', color: colors.text, flexShrink: 1 },

  sectionHead: {
    backgroundColor: colors.primary, color: colors.white, ...font.tiny, fontWeight: '800',
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, marginTop: spacing.sm,
  },
  line: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  lineLabel: { ...font.small, fontWeight: '500', color: colors.text },
  lineValue: { ...font.small, fontWeight: '700', color: colors.text },
  subtotal: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, borderBottomWidth: 0 },
  subtotalLabel: { ...font.small, fontWeight: '900', color: colors.text },
  subtotalValue: { ...font.small, fontWeight: '900', color: colors.text },

  netRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 12, paddingHorizontal: 12, marginTop: spacing.md,
  },
  netLabel: { ...font.h3, fontWeight: '900', color: colors.white },
  netValue: { fontSize: 18, fontWeight: '900', color: colors.white },

  disclaimer: {
    fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },
});
