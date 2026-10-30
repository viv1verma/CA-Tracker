import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusPill } from '../../components/ui';
import type { Assignment, Client } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, fmtAny, isOD, sbg } from '../assignments/logic';
import { shortRemark } from './logic';

/**
 * One row of the pg-dashboard table. It carries the fields that table has and the
 * Assignments card does not: the member remark, the supervisor remark (with the
 * reporter's "+ Add remark" affordance) and the per-row edit / remind / delete
 * actions, which become an inline action strip on a phone.
 */
export default function DashTaskCard({
  a, client, selected, selectMode, isReporter, isAdmin,
  onPress, onLongPress, onToggleSelect, onEdit, onRemind, onDelete,
}: {
  a: Assignment;
  client?: Client;
  selected: boolean;
  selectMode: boolean;
  isReporter: boolean;
  isAdmin: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRemind: () => void;
  onDelete: () => void;
}) {
  const od = isOD(a);
  const [bg, fg] = sbg(a.status);
  const pct = a.completionPct || 0;
  const remark = shortRemark(a.remark, 30);
  const supRemark = shortRemark(a.supervisorRemark, 25);

  return (
    <Pressable
      onPress={selectMode ? onToggleSelect : onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.card,
        od && styles.cardOverdue,
        selected && styles.cardSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.top}>
        {selectMode && (
          <View style={[styles.box, selected && styles.boxOn]}>
            {selected && <Text style={styles.tick}>✓</Text>}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.client} numberOfLines={2}>{client?.name || '—'}</Text>
          <Text style={styles.work} numberOfLines={2}>{a.workType}</Text>
          {a.isSubAssignment && <Text style={styles.sub}>↳ SUB</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusPill
            label={od ? '⚠ OD' : a.status || 'Pending'}
            bg={od ? '#fee2e2' : bg}
            fg={od ? '#b91c1c' : fg}
          />
          <Text style={styles.pct}>{pct > 0 ? `${pct}%` : '—'}</Text>
        </View>
      </View>

      <Text style={styles.member} numberOfLines={1}>{a.memberName || '—'}</Text>

      {/* Remark column */}
      {!!remark && <Text style={styles.remark} numberOfLines={1}>💬 {remark}</Text>}
      {supRemark
        ? <Text style={styles.supRemark} numberOfLines={1}>👁 {supRemark}</Text>
        : isReporter
          ? <Text style={styles.addRemark}>+ Add remark</Text>
          : null}

      <View style={styles.dates}>
        <Meta label="Created" value={a.createdAt ? fmtAny(a.createdAt) : '—'} />
        <Meta label="Due" value={fmt(a.dueDate)} tone={od ? 'red' : undefined} />
        <Meta
          label="Completed"
          value={a.status === 'Completed' && a.completedAt ? `✓ ${fmtAny(a.completedAt)}` : '–'}
          tone={a.status === 'Completed' && a.completedAt ? 'green' : 'faint'}
        />
      </View>

      {!selectMode && (
        <View style={styles.actions}>
          <Act label="✏ Edit" onPress={onEdit} />
          <Act label="🔔 Remind" onPress={onRemind} tone="amber" />
          {isAdmin && <Act label="🗑 Delete" onPress={onDelete} tone="red" />}
        </View>
      )}
    </Pressable>
  );
}

function Act({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'amber' | 'red' }) {
  const border = tone === 'amber' ? '#fed7aa' : tone === 'red' ? '#fecaca' : colors.border;
  const bg = tone === 'amber' ? '#fff7ed' : tone === 'red' ? '#fef2f2' : colors.white;
  const fg = tone === 'red' ? colors.red : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [styles.act, { borderColor: border, backgroundColor: bg }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.actText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Meta({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' | 'faint' }) {
  const color = tone === 'red' ? colors.red : tone === 'green' ? colors.green : tone === 'faint' ? '#cbd5e1' : colors.text;
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardOverdue: { backgroundColor: '#fff8f8', borderColor: '#fecaca' },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 12, fontWeight: '900' },
  client: { ...font.h3, color: colors.text, lineHeight: 19 },
  work: { ...font.small, color: colors.muted, marginTop: 2, lineHeight: 16 },
  sub: { fontSize: 9, fontWeight: '800', color: '#6366f1', marginTop: 3 },
  pct: { ...font.small, color: colors.primary },
  member: { ...font.small, color: colors.text, marginTop: spacing.sm },
  remark: { ...font.small, color: colors.primaryDark, fontStyle: 'italic', fontWeight: '500', marginTop: 4 },
  supRemark: { ...font.tiny, color: colors.green, fontWeight: '600', marginTop: 2 },
  addRemark: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  dates: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  act: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, minHeight: 34, justifyContent: 'center' },
  actText: { ...font.tiny, fontWeight: '700' },
});
