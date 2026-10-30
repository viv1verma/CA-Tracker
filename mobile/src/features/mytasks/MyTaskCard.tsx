import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressBar, StatusPill } from '../../components/ui';
import type { Assignment, Client } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { daysOld, fmt, fmtAny, isOD, sbg } from '../assignments/logic';
import { canUpdate } from './logic';

/**
 * One row of the pg-myassign table. The row's own "Update ✎" button is the
 * page's primary action; a completed task shows "✓ Done" instead, exactly as
 * renderMemberView() decides.
 */
export default function MyTaskCard({
  a, client, selected, selectMode, onPress, onLongPress, onToggleSelect, onUpdate,
}: {
  a: Assignment;
  client?: Client;
  selected: boolean;
  selectMode: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  onUpdate: () => void;
}) {
  const od = isOD(a);
  const [bg, fg] = sbg(a.status);
  const pct = a.completionPct || 0;
  const done = a.status === 'Completed';

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
          <Text style={styles.work} numberOfLines={2}>
            {a.workType}{a.assignmentType === 'recurring' ? ' 🔄' : ''}
          </Text>
          {a.isSubAssignment && <Text style={styles.sub}>↳ sub</Text>}
        </View>
        <StatusPill
          label={od ? '⚠ OD' : a.status || 'Pending'}
          bg={od ? '#fee2e2' : bg}
          fg={od ? '#b91c1c' : fg}
        />
      </View>

      {pct > 0 && (
        <View style={styles.progRow}>
          <ProgressBar pct={pct} />
          <Text style={styles.pct}>{pct}%</Text>
        </View>
      )}

      <View style={styles.foot}>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>Due</Text>
          <Text style={[styles.metaValue, od && { color: colors.red }]}>{fmt(a.dueDate)}</Text>
          {done && !!a.completedAt && (
            <Text style={styles.completed}>✓ {fmtAny(a.completedAt)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>Days</Text>
          <Text style={styles.metaValue}>{daysOld(a)}d</Text>
        </View>
        {!selectMode && (
          canUpdate(a) ? (
            <Pressable
              onPress={onUpdate}
              accessibilityRole="button"
              style={({ pressed }) => [styles.update, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.updateText}>Update ✎</Text>
            </Pressable>
          ) : (
            <Text style={styles.doneTag}>✓ Done</Text>
          )
        )}
      </View>
    </Pressable>
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
  progRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pct: { ...font.small, color: colors.primary, width: 38, textAlign: 'right' },
  foot: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 2 },
  completed: { fontSize: 10, fontWeight: '700', color: colors.green, marginTop: 1 },
  update: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 9, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center',
  },
  updateText: { ...font.small, color: colors.white },
  doneTag: { ...font.small, color: colors.green },
});
