import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../../components/form';
import { ProgressBar, StatusPill } from '../../components/ui';
import type { Assignment, Client, TeamUser } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, sbg } from '../assignments/logic';
import { workloadColor, type WorkloadRow } from './logic';

/** Team Workload — the same seven columns, laid out for a phone. */
export function WorkloadSection({ rows }: { rows: WorkloadRow[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardHead}>Team Workload</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No data yet</Text>
      ) : (
        rows.map((m, i) => (
          <View key={m.id} style={[styles.wRow, i > 0 && styles.divider]}>
            <View style={styles.wHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wName}>{m.name}</Text>
                {!!m.designation && <Text style={styles.wDesig}>{m.designation}</Text>}
              </View>
              <Text style={styles.wTot}>{m.tot}</Text>
            </View>
            <View style={styles.wCounts}>
              <Count label="Pend" value={m.pend} color={colors.amber} />
              <Count label="WIP" value={m.inp} color={colors.purple} />
              <Count label="Done" value={m.comp} color={colors.green} />
              <Count label="OD" value={m.ov} color={m.ov > 0 ? colors.red : colors.muted} />
            </View>
            <View style={styles.wBar}>
              <View style={styles.barWrap}>
                <View style={[styles.barFill, { width: `${m.p}%`, backgroundColor: workloadColor(m.p) }]} />
              </View>
              <Text style={styles.wPct}>{m.p}%</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countValue, { color }]}>{value || '—'}</Text>
    </View>
  );
}

/** The 👥 Sub-Assignments summary card. */
export function SubAssignmentsSection({
  subs, usersById, onOpen,
}: {
  subs: Assignment[];
  usersById: Record<string, TeamUser>;
  onOpen: (id: string) => void;
}) {
  if (!subs.length) return null;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={styles.cardHead}>👥 Sub-Assignments</Text>
        <Text style={styles.subTotal}>{subs.length} total</Text>
      </View>
      {subs.map((a, i) => {
        const by = a.subAssignedBy ? usersById[a.subAssignedBy] : undefined;
        const [bg, fg] = sbg(a.status);
        return (
          <Pressable
            key={a.id}
            onPress={() => onOpen(a.id)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.sRow, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.sWork} numberOfLines={1}>{a.workType}</Text>
              <Text style={styles.sMeta} numberOfLines={1}>
                {by?.name || a.subAssignedByName || '—'} → {a.memberName || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <StatusPill label={a.status || 'Pending'} bg={bg} fg={fg} />
              <Text style={styles.sPct}>{(a.completionPct || 0) > 0 ? `${a.completionPct}%` : '—'}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** showOverduePopup() / showOverdueDetail() — the overdue task sheet. */
export function OverdueSheet({
  visible, tasks, clientsById, onClose, onOpen,
}: {
  visible: boolean;
  tasks: Assignment[];
  clientsById: Record<string, Client>;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Sheet visible={visible} title={`⚠ Overdue (${tasks.length})`} onClose={onClose}>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>Nothing is past due.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 380 }}>
          {tasks.map((a, i) => (
            <Pressable
              key={a.id}
              onPress={() => { onClose(); onOpen(a.id); }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.oRow, i > 0 && styles.divider, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.oTitle} numberOfLines={2}>
                {clientsById[a.clientId]?.name || '—'} — {a.workType}
              </Text>
              <Text style={styles.oMeta}>Due: {fmt(a.dueDate)} · {a.memberName || '—'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  cardHead: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subTotal: { ...font.small, color: '#6366f1', marginBottom: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  divider: { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: spacing.sm, paddingTop: spacing.sm },

  wRow: {},
  wHead: { flexDirection: 'row', alignItems: 'center' },
  wName: { ...font.small, color: colors.text },
  wDesig: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 1 },
  wTot: { fontSize: 18, fontWeight: '900', color: colors.primary },
  wCounts: { flexDirection: 'row', marginTop: 6 },
  count: { flex: 1 },
  countLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  countValue: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  wBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 8 },
  barWrap: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  wPct: { ...font.small, color: colors.muted, width: 38, textAlign: 'right' },

  sRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  sWork: { ...font.small, color: colors.text },
  sMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  sPct: { ...font.tiny, color: colors.primary },

  oRow: { paddingVertical: 10, minHeight: 48 },
  oTitle: { ...font.small, color: colors.text },
  oMeta: { ...font.small, color: colors.red, fontWeight: '600', marginTop: 3 },
});
