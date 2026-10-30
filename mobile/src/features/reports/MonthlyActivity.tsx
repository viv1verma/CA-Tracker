import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, fmtDT } from '../assignments/logic';
import { barColor, type MonthlyActivity as MonthlyActivityData } from './logic';

/**
 * renderMonthlyReport() — one card per member who logged activity this month,
 * each assignment showing its progress and a collapsible update log. The web's
 * <details> element becomes a tap-to-expand row.
 */
export default function MonthlyActivity({ data }: { data: MonthlyActivityData }) {
  // The web drops members with no assignments at all.
  const members = data.report.filter((m) => m.assignments.length > 0);
  if (!members.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyTitle}>No activity this month</Text>
      </View>
    );
  }

  return (
    <>
      {members.map((m) => (
        <View key={m.memberId} style={styles.card}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headName}>{m.memberName}</Text>
              <Text style={styles.headSub}>
                {m.designation} · {m.totalUpdatesThisMonth} updates
              </Text>
            </View>
            <View style={[styles.badge, {
              backgroundColor: m.totalBackwardUpdates ? '#fee2e2' : '#dcfce7',
            }]}>
              <Text style={[styles.badgeText, {
                color: m.totalBackwardUpdates ? colors.red : colors.green,
              }]}>
                {m.totalBackwardUpdates ? `⚠ ${m.totalBackwardUpdates} backward` : '✓ Clean'}
              </Text>
            </View>
          </View>

          <View style={{ padding: spacing.md }}>
            {m.assignments.map((a) => (
              <AssignmentBlock key={a.assignmentId} a={a} />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function AssignmentBlock({ a }: { a: MonthlyActivityData['report'][0]['assignments'][0] }) {
  const [open, setOpen] = useState(false);
  const pc = barColor(a.currentPct);

  return (
    <View style={[styles.assignment, a.backwardUpdates > 0 && { borderLeftColor: colors.red }]}>
      <View style={styles.assignHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.assignTitle}>{a.clientName} — {a.workType}</Text>
          <Text style={styles.assignMeta}>
            ⏱ {a.daysSinceAssigned}d old · Due {fmt(a.dueDate)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.pct, { color: pc }]}>{a.currentPct}%</Text>
          {a.backwardUpdates > 0 && (
            <Text style={styles.backwardTag}>⚠ {a.backwardUpdates} backward</Text>
          )}
        </View>
      </View>

      <View style={{ marginBottom: spacing.sm }}>
        <ProgressBar pct={a.currentPct} />
      </View>

      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        <Text style={styles.summary}>
          {a.activityLog.length} updates this month {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: spacing.sm }}>
          {a.activityLog.length === 0 ? (
            <Text style={styles.noUpdates}>No updates this month</Text>
          ) : a.activityLog.map((l, i) => (
            <View key={i} style={styles.logRow}>
              <View style={[styles.dot, {
                backgroundColor: l.isBackward ? colors.red : colors.green,
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.logMain, l.isBackward && { color: colors.red }]}>
                  {l.prevPct}% → {l.completionPct}%{l.isBackward ? '  ⚠ BACKWARD' : ''}
                </Text>
                <Text style={styles.logMeta}>
                  {fmtDT(l.date)}{l.updatedByName ? ` · ${l.updatedByName}` : ''}
                </Text>
                {!!l.remark && <Text style={styles.logRemark}>💬 {l.remark}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1,
    borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, padding: spacing.md,
  },
  headName: { ...font.h3, fontSize: 15, color: colors.white },
  headSub: { ...font.small, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { ...font.small, fontWeight: '800' },

  assignment: {
    backgroundColor: '#f9fafb', borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.border,
  },
  assignHead: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  assignTitle: { ...font.small, fontWeight: '800', color: colors.text },
  assignMeta: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 },
  pct: { fontSize: 20, fontWeight: '900' },
  backwardTag: { ...font.tiny, color: colors.red, fontWeight: '800' },

  summary: { ...font.small, fontWeight: '700', color: colors.muted },
  noUpdates: { ...font.small, fontWeight: '500', color: colors.muted, paddingVertical: 6 },

  logRow: {
    flexDirection: 'row', gap: spacing.sm, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  logMain: { ...font.small, fontWeight: '700', color: colors.text },
  logMeta: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 },
  logRemark: { ...font.small, fontWeight: '500', color: '#1e40af', fontStyle: 'italic', marginTop: 2 },

  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { ...font.h3, color: colors.muted },
});
