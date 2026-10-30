import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressBar, StatusPill } from '../../components/ui';
import type { Assignment, Client, TeamUser } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { daysOld, fmt, fmtAny, isOD, sbg } from './logic';

/**
 * One assignment. The web renders a wide table row; a phone gets the same fields
 * stacked into a card — client, work, member + designation, status, progress,
 * created, due, completed and age all survive.
 */
export default function AssignmentCard({
  a, client, member, selected, selectMode, onPress, onLongPress, onToggleSelect,
}: {
  a: Assignment;
  client?: Client;
  member?: TeamUser;
  selected: boolean;
  selectMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
}) {
  const od = isOD(a);
  const [bg, fg] = sbg(a.status);
  const pct = a.completionPct || 0;
  const completed = a.status === 'Completed' && !!a.completedAt;

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
      <View style={styles.topRow}>
        {selectMode && (
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Text style={styles.checkMark}>✓</Text>}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.client} numberOfLines={2}>{client?.name || '—'}</Text>
          <Text style={styles.work} numberOfLines={2}>
            {a.workType}
            {a.assignmentType === 'recurring' ? '  🔄' : ''}
          </Text>
        </View>
        <StatusPill label={od ? '⚠ OD' : a.status || 'Pending'} bg={od ? '#fee2e2' : bg} fg={od ? '#b91c1c' : fg} />
      </View>

      {a.isSubAssignment && <Text style={styles.subTag}>↳ SUB{a.subAssignedByName ? ` · from ${a.subAssignedByName}` : ''}</Text>}

      <View style={styles.metaRow}>
        <Text style={styles.member} numberOfLines={1}>
          {a.memberName || '—'}
          {member?.designation ? <Text style={styles.designation}>{`  ${member.designation}`}</Text> : null}
        </Text>
      </View>

      {pct > 0 && (
        <View style={styles.progRow}>
          <ProgressBar pct={pct} />
          <Text style={styles.pctText}>{pct}%</Text>
        </View>
      )}

      <View style={styles.dates}>
        <Meta label="Created" value={fmtAny(a.createdAt)} />
        <Meta label="Due" value={fmt(a.dueDate)} tone={od ? 'red' : undefined} />
        <Meta
          label="Completed"
          value={completed ? `✓ ${fmtAny(a.completedAt)}` : '–'}
          tone={completed ? 'green' : 'faint'}
        />
        <Meta label="Age" value={`${daysOld(a)}d`} />
      </View>
    </Pressable>
  );
}

function Meta({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' | 'faint' }) {
  const color = tone === 'red' ? colors.red : tone === 'green' ? colors.green : tone === 'faint' ? '#cbd5e1' : colors.text;
  return (
    <View style={styles.meta}>
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
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.white, fontSize: 12, fontWeight: '900' },
  client: { ...font.h3, color: colors.text, lineHeight: 19 },
  work: { ...font.small, color: colors.muted, marginTop: 2, lineHeight: 16 },
  subTag: { fontSize: 9, fontWeight: '800', color: '#6366f1', marginTop: 4 },
  metaRow: { marginTop: spacing.sm },
  member: { ...font.small, color: colors.text },
  designation: { color: colors.muted, fontWeight: '500' },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pctText: { ...font.small, color: colors.primary, width: 38, textAlign: 'right' },
  dates: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  meta: { flex: 1 },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
