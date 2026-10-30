import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressBar, StatusPill } from '../../components/ui';
import type { Assignment, Client, DueDateRequest } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, fmtAny, isOD, sbg } from '../assignments/logic';
import { cut } from './logic';

/** One row of the pg-supervising table, stacked for a phone. */
export default function SupervisingCard({
  a, client, myRequest, onPress, onRemind, onRequestDate, onRequestReopen,
}: {
  a: Assignment;
  client?: Client;
  myRequest?: DueDateRequest;
  onPress: () => void;
  onRemind: () => void;
  onRequestDate: () => void;
  onRequestReopen: () => void;
}) {
  const od = isOD(a);
  const [bg, fg] = sbg(a.status);
  const pct = a.completionPct || 0;
  const remark = cut(a.remark, 30);
  const supRemark = cut(a.supervisorRemark, 22);
  const done = a.status === 'Completed';

  const reqColor = myRequest?.status === 'pending'
    ? colors.amber
    : myRequest?.status === 'approved' ? colors.green : colors.red;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, od && styles.cardOverdue, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.client} numberOfLines={2}>{client?.name || '—'}</Text>
          <Text style={styles.work} numberOfLines={2}>
            {a.workType}{a.assignmentType === 'recurring' ? ' 🔄' : ''}
          </Text>
        </View>
        <StatusPill
          label={od ? '⚠ OD' : a.status || 'Pending'}
          bg={od ? '#fee2e2' : bg}
          fg={od ? '#b91c1c' : fg}
        />
      </View>

      <Text style={styles.member} numberOfLines={1}>{a.memberName || '—'}</Text>

      {pct > 0 && (
        <View style={styles.progRow}>
          <ProgressBar pct={pct} />
          <Text style={styles.pct}>{pct}%</Text>
        </View>
      )}

      {/* Remark column: member remark, supervisor remark, my DDR status */}
      {remark
        ? <Text style={styles.remark} numberOfLines={1}>💬 {remark}</Text>
        : <Text style={styles.noUpdate}>No update yet</Text>}
      {!!supRemark && <Text style={styles.supRemark} numberOfLines={1}>👁 {supRemark}</Text>}
      {!!myRequest && (
        <Text style={[styles.ddr, { color: reqColor }]}>
          📅 DDR: {String(myRequest.status).toUpperCase()}
        </Text>
      )}

      <View style={styles.foot}>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>Due</Text>
          <Text style={[styles.metaValue, od && { color: colors.red }]}>{fmt(a.dueDate)}</Text>
          {done && !!a.completedAt && <Text style={styles.doneTag}>✓ {fmtAny(a.completedAt)}</Text>}
        </View>
        <View style={styles.actions}>
          <Act label="🔔 Remind" onPress={onRemind} tone="amber" />
          {done
            ? <Act label="🔓 Reopen" onPress={onRequestReopen} tone="red" />
            : <Act label="📅 Due date" onPress={onRequestDate} tone="blue" />}
        </View>
      </View>
    </Pressable>
  );
}

function Act({ label, onPress, tone }: { label: string; onPress: () => void; tone: 'amber' | 'red' | 'blue' }) {
  const map = {
    amber: { border: '#fed7aa', bg: '#fff7ed', fg: colors.amber },
    red: { border: '#fecaca', bg: '#fef2f2', fg: colors.red },
    blue: { border: '#bfdbfe', bg: colors.primaryLight, fg: colors.primary },
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [
        styles.act,
        { borderColor: map.border, backgroundColor: map.bg },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.actText, { color: map.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardOverdue: { backgroundColor: '#fff8f8', borderColor: '#fecaca' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  client: { ...font.h3, color: colors.text, lineHeight: 19 },
  work: { ...font.small, color: colors.muted, marginTop: 2, lineHeight: 16 },
  member: { ...font.small, color: colors.text, marginTop: spacing.sm },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pct: { ...font.small, color: colors.primary, width: 38, textAlign: 'right' },
  remark: { ...font.small, color: colors.primaryDark, fontStyle: 'italic', fontWeight: '500', marginTop: 6 },
  noUpdate: { ...font.tiny, color: colors.muted, fontStyle: 'italic', fontWeight: '500', marginTop: 6 },
  supRemark: { ...font.tiny, color: colors.green, fontWeight: '600', marginTop: 2 },
  ddr: { ...font.tiny, marginTop: 3 },
  foot: {
    flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 2 },
  doneTag: { fontSize: 10, fontWeight: '700', color: colors.green, marginTop: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  act: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  actText: { ...font.tiny, fontWeight: '700' },
});
