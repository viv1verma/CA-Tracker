import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { LeaveRequest } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import {
  MY_LEAVE_TYPES, compOffColor, leaveDayCount, leaveStatus,
  type CompOff, type CompOffBalance,
} from './logic';

/**
 * pg-myleave — "My Leave". Comp-off balance and the holiday work that earned it,
 * then every leave application this member has made, newest first.
 */
export default function LeaveScreen() {
  const { leaveRequests, reload } = useData();
  const { showToast } = useToast();

  const [compOffs, setCompOffs] = useState<CompOff[]>([]);
  const [balance, setBalance] = useState<CompOffBalance>({ earned: 0, used: 0, available: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async (opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    await Promise.all([
      api.get<{ compOffs: CompOff[]; balance: CompOffBalance | null }>(endpoints.compOffs)
        .then((r) => {
          setCompOffs(r?.compOffs || []);
          setBalance(r?.balance || { earned: 0, used: 0, available: 0 });
        })
        .catch(() => {}),
      reload({ showSpinner: false }),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [reload]);

  useEffect(() => { void load({ spinner: true }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /** GET /leave-requests already scopes to the caller for non-admins. */
  const mine = useMemo(
    () => leaveRequests.slice().sort(
      (a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0),
    ),
    [leaveRequests],
  );

  if (loading) return <Loading label="Loading your leave…" />;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load()}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sub}>Apply for leave and track approvals</Text>

        {/* ── Compensatory off ── */}
        <View style={styles.compCard}>
          <Text style={styles.compTitle}>🔄 Compensatory Off</Text>
          <View style={styles.compStats}>
            <Stat value={balance.available} label="AVAILABLE" color={colors.green} />
            <Stat value={balance.earned} label="EARNED" color={colors.primary} />
            <Stat value={balance.used} label="USED" color={colors.muted} />
          </View>

          {compOffs.length > 0 ? (
            <>
              <Text style={styles.compSub}>EARNED FROM HOLIDAY WORK</Text>
              {compOffs.slice(0, 6).map((c) => (
                <View key={c.id} style={styles.compRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.compDate}>{fmt(c.earnedDate)}</Text>
                    <Text style={styles.compReason}>Worked on {c.reason || 'holiday'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.compDays}>{c.days} day</Text>
                    <Text style={[styles.compStatus, { color: compOffColor(c.status) }]}>
                      {(c.status || '').toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.compNote}>
              Work on a holiday or weekly off and a comp-off is credited automatically.
            </Text>
          )}
        </View>

        {/* ── Leave applications ── */}
        {mine.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No leave applications yet. Tap "Apply Leave".</Text>
          </View>
        ) : (
          mine.map((r: LeaveRequest) => {
            const s = leaveStatus(r.status);
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>
                    {r.type} Leave · {r.days} day{r.days > 1 ? 's' : ''}
                  </Text>
                  <View style={[styles.pill, { backgroundColor: s.bg }]}>
                    <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{fmt(r.fromDate)} → {fmt(r.toDate)}</Text>
                {!!r.reason && <Text style={styles.cardMeta}>“{r.reason}”</Text>}
                {!!r.adminNote && <Text style={styles.adminNote}>Admin: {r.adminNote}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable
        onPress={() => setFormOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Apply for leave"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <LeaveFormSheet
        visible={formOpen}
        available={balance.available}
        onClose={() => setFormOpen(false)}
        onApplied={() => void load()}
      />
    </View>
  );
}

/** openLeaveForm() / submitLeave(). */
function LeaveFormSheet({
  visible, available, onClose, onApplied,
}: {
  visible: boolean;
  available: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [type, setType] = useState('Casual');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFrom(today); setTo(today); setType('Casual'); setReason('');
  }, [visible]);   // eslint-disable-line react-hooks/exhaustive-deps

  const days = from && to ? leaveDayCount(from, to) : null;

  const save = async () => {
    // submitLeave() validates dates only; the reason is optional on this form.
    if (!from || !to) { showToast('Pick dates', 'error'); return; }
    if (new Date(to) < new Date(from)) { showToast('To date is before From date', 'error'); return; }
    setSaving(true);
    try {
      await api.post<LeaveRequest>(endpoints.leaveRequests, {
        fromDate: from, toDate: to, type, reason: reason.trim(),
      });
      onApplied();
      onClose();
      showToast('Leave applied ✓');
    } catch (e) {
      // The server refuses Comp Off beyond the available balance; show its message.
      showToast(e instanceof ApiError ? e.message : 'Could not apply', 'error');
    } finally {
      setSaving(false);
    }
  };

  const options = MY_LEAVE_TYPES.map((t) =>
    t.value === 'Comp Off' ? { ...t, label: `Comp Off (${available} available)` } : t);

  return (
    <Sheet
      visible={visible}
      title="🌴 Apply for Leave"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title="Submit Application" onPress={save} loading={saving} />
          </View>
        </>
      }
    >
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="From"><DateField value={from} onChange={setFrom} /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="To"><DateField value={to} onChange={setTo} /></Field>
        </View>
      </View>
      {days !== null && (
        <Text style={styles.days}>{days} day{days > 1 ? 's' : ''} of leave</Text>
      )}
      <Field label="Type">
        <Select value={type} placeholder="Leave type" options={options} onChange={setType} />
      </Field>
      <Field label="Reason">
        <Input value={reason} onChangeText={setReason} placeholder="Reason for leave…" multiline />
      </Field>
    </Sheet>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 96 },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  compCard: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  compTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  compStats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 10, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 2 },
  compSub: { ...font.tiny, color: colors.muted, marginTop: spacing.md, marginBottom: 4 },
  compRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  compDate: { ...font.small, color: colors.text },
  compReason: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 1 },
  compDays: { ...font.small, color: colors.text },
  compStatus: { fontSize: 9, fontWeight: '800', marginTop: 1 },
  compNote: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.sm, lineHeight: 16 },
  emptyCard: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center',
  },
  emptyText: { ...font.small, color: colors.muted, fontWeight: '500', textAlign: 'center' },
  card: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...font.small, color: colors.text, flex: 1 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  cardMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3 },
  adminNote: { ...font.tiny, color: colors.primaryDark, fontWeight: '600', marginTop: 3 },
  pair: { flexDirection: 'row', gap: spacing.md },
  days: { ...font.small, color: colors.primary, marginTop: -spacing.sm, marginBottom: spacing.md },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
