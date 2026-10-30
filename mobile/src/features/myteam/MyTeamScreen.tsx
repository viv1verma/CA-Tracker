import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { canSubAssign } from '../../auth/permissions';
import { EmptyState, ErrorState, Loading, ProgressBar, StatusPill } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import ProgressSheet from '../assignments/ProgressSheet';
import ReminderSheet from '../assignments/ReminderSheet';
import SubAssignSheet from '../assignments/SubAssignSheet';
import { daysOld, fmt, fmtAny, sbg } from '../assignments/logic';
import { groupDelegated, myDelegated } from './logic';

/**
 * pg-submanage — "My Team" (member). Shows the work I delegated to juniors,
 * grouped under the parent task it came from, with Update and Remind on each.
 */
export default function MyTeamScreen() {
  const { user } = useAuth();
  const { assignments, clientsById, loading, refreshing, error, reload } = useData();
  const { showToast } = useToast();

  const [updateFor, setUpdateFor] = useState<Assignment | null>(null);
  const [remindFor, setRemindFor] = useState<Assignment | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const delegated = useMemo(() => myDelegated(assignments, user), [assignments, user]);
  const groups = useMemo(
    () => groupDelegated(delegated, assignments, clientsById),
    [delegated, assignments, clientsById],
  );

  /** openSubSheet() refuses for anyone who is not CA/CS (or admin). */
  const openAssign = () => {
    if (!canSubAssign(user)) {
      showToast('Only CA / CS members can sub-assign tasks', 'error');
      return;
    }
    setAssignOpen(true);
  };

  if (loading) return <Loading label="Loading your team's work…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload({ showSpinner: false })}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.sub}>Work delegated to juniors</Text>

        {groups.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No sub-assignments yet"
            note="Tap + to delegate work to junior team members"
          />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle} numberOfLines={2}>{g.title}</Text>
              </View>
              <View style={styles.groupBody}>
                {g.items.map((a) => {
                  const [bg, fg] = sbg(a.status);
                  const pct = a.completionPct || 0;
                  const done = a.status === 'Completed' && !!a.completedAt;
                  return (
                    <View key={a.id} style={styles.sub_}>
                      <View style={styles.subTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.workType}>{a.workType}</Text>
                          <Text style={styles.subMeta}>
                            → {a.memberName || '—'} · ⏱ {daysOld(a)}d old
                          </Text>
                        </View>
                        <StatusPill label={a.status || 'Pending'} bg={bg} fg={fg} />
                      </View>

                      {pct > 0 && (
                        <View style={styles.progBlock}>
                          <View style={styles.progTop}>
                            <Text style={styles.progLabel}>Progress</Text>
                            <Text style={styles.progPct}>{pct}%</Text>
                          </View>
                          <ProgressBar pct={pct} />
                        </View>
                      )}

                      {!!a.remark && (
                        <View style={styles.remarkBox}>
                          <Text style={styles.remarkText}>💬 {a.remark}</Text>
                        </View>
                      )}

                      <Text style={styles.due}>
                        📅 Due: {fmt(a.dueDate)}
                        {done && (
                          <Text style={styles.doneTag}> · ✓ Done {fmtAny(a.completedAt)}</Text>
                        )}
                      </Text>

                      <View style={styles.actions}>
                        <Pressable
                          onPress={() => setUpdateFor(a)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.btnPrimaryText}>✏ Update</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setRemindFor(a)}
                          accessibilityRole="button"
                          style={({ pressed }) => [styles.btn, styles.btnRemind, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.btnRemindText}>🔔 Remind</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={openAssign}
        accessibilityRole="button"
        accessibilityLabel="Assign work to a junior"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      <ProgressSheet assignment={updateFor} visible={!!updateFor} onClose={() => setUpdateFor(null)} />
      <ReminderSheet assignment={remindFor} visible={!!remindFor} onClose={() => setRemindFor(null)} />
      {/* The web's "+ Assign" opens the sub sheet with no parent — a standalone sub-assignment. */}
      <SubAssignSheet parent={null} visible={assignOpen} onClose={() => setAssignOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 96 },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  group: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg, overflow: 'hidden',
  },
  groupHead: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: spacing.lg },
  groupTitle: { ...font.small, color: colors.white, lineHeight: 18 },
  groupBody: { padding: spacing.md, gap: spacing.md },
  sub_: {
    backgroundColor: '#f9fafb', borderRadius: 12, padding: spacing.md,
    borderLeftWidth: 3, borderLeftColor: '#6366f1',
  },
  subTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  workType: { ...font.h3, color: colors.text },
  subMeta: { ...font.small, color: colors.muted, fontWeight: '500', marginTop: 2 },
  progBlock: { marginBottom: spacing.sm },
  progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  progLabel: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  progPct: { fontSize: 14, fontWeight: '900', color: colors.primary },
  remarkBox: { backgroundColor: colors.primaryLight, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: spacing.sm },
  remarkText: { ...font.small, color: colors.primaryDark, fontStyle: 'italic', fontWeight: '500' },
  due: { ...font.small, color: colors.muted, fontWeight: '500', marginBottom: spacing.sm },
  doneTag: { color: colors.green, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...font.small, color: colors.white },
  btnRemind: { backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#fed7aa' },
  btnRemindText: { ...font.small, color: colors.amber },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
