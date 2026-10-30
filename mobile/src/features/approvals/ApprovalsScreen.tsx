import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment, DueDateRequest, LeaveRequest, ReopenRequest } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';

/**
 * pg-approvals — every pending request in one place: completion approvals,
 * due-date changes, reopen requests and leave. All four PUTs are admin-only
 * server-side, which is why the module itself is admin-gated.
 */
export default function ApprovalsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const {
    assignments, clientsById, dueDateRequests, reopenRequests, leaveRequests,
    loading, refreshing, error, reload, upsertAssignment, setRequestStatus,
  } = useData();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Each section's pending set, exactly as renderApprovals() slices them.
  const completions = useMemo(
    () => assignments.filter((a) => a.status === 'Under Review'), [assignments],
  );
  const dd = useMemo(() => dueDateRequests.filter((r) => r.status === 'pending'), [dueDateRequests]);
  const ro = useMemo(() => reopenRequests.filter((r) => r.status === 'pending'), [reopenRequests]);
  const lv = useMemo(() => leaveRequests.filter((r) => r.status === 'pending'), [leaveRequests]);
  const total = completions.length + dd.length + ro.length + lv.length;

  /**
   * apvComplete(): the web approves through PUT /assignments/:id rather than the
   * approve-completion route, so this does the same and gets the same result.
   */
  const actComplete = async (a: Assignment, ok: boolean) => {
    setBusy(a.id);
    try {
      const updated = await api.put<Assignment>(
        endpoints.assignment(a.id),
        ok ? { status: 'Completed', completionPct: 100 } : { status: 'In Progress' },
      );
      upsertAssignment(updated);
      showToast(ok ? 'Approved ✓' : 'Sent back');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    } finally {
      setBusy(null);
    }
  };

  const actRequest = async (
    kind: 'dueDate' | 'reopen' | 'leave', id: string, ok: boolean,
  ) => {
    const path = kind === 'dueDate'
      ? endpoints.dueDateRequest(id)
      : kind === 'reopen' ? endpoints.reopenRequest(id) : endpoints.leaveRequest(id);
    const status = ok ? 'approved' : 'rejected';
    setBusy(id);
    try {
      await api.put(path, { status });
      setRequestStatus(kind, id, status);
      // Approving a due-date change or reopen alters the task itself.
      if (kind !== 'leave' && ok) await reload({ showSpinner: false });
      showToast(
        kind === 'leave'
          ? (ok ? 'Leave approved ✓' : 'Leave rejected')
          : (ok ? 'Approved ✓' : 'Rejected'),
      );
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading label="Loading approvals…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  return (
    <ScrollView
      style={styles.flex}
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
      <Text style={styles.sub}>Review and action all pending requests</Text>

      {total === 0 && (
        <View style={styles.allClear}>
          <Text style={styles.allClearText}>🎉 All caught up — no pending approvals.</Text>
        </View>
      )}

      {/* ── Completion approvals ── */}
      <SectionHead icon="✔️" title="Assignment Completion Approvals" n={completions.length} color={colors.green} />
      {completions.length === 0
        ? <Empty text="No completions awaiting approval." />
        : completions.map((a) => (
          <Card key={a.id} onPress={() => onOpen(a.id)}>
            <Text style={styles.title}>
              {clientsById[a.clientId]?.name || '—'} — {a.workType}
            </Text>
            <Text style={styles.meta}>
              By {a.memberName || '—'} · Due {fmt(a.dueDate)} · {a.completionPct || 0}% done
            </Text>
            <Actions
              busy={busy === a.id}
              approveLabel="✓ Approve"
              rejectLabel="↩ Send Back"
              onApprove={() => actComplete(a, true)}
              onReject={() => actComplete(a, false)}
            />
          </Card>
        ))}

      {/* ── Due-date change requests ── */}
      <SectionHead icon="📅" title="Due Date Change Requests" n={dd.length} color={colors.amber} />
      {dd.length === 0
        ? <Empty text="No due-date requests." />
        : dd.map((r: DueDateRequest) => (
          <Card key={r.id}>
            <Text style={styles.title}>{r.clientName || '—'} — {r.workType || ''}</Text>
            <Text style={styles.meta}>
              By {r.requestedByName || r.memberName || '—'} · {fmt(r.currentDueDate)} →{' '}
              <Text style={styles.bold}>{fmt(r.requestedDueDate)}</Text>
            </Text>
            {!!r.reason && <Text style={styles.reason}>“{r.reason}”</Text>}
            <Actions
              busy={busy === r.id}
              onApprove={() => actRequest('dueDate', r.id, true)}
              onReject={() => actRequest('dueDate', r.id, false)}
            />
          </Card>
        ))}

      {/* ── Reopen requests ── */}
      <SectionHead icon="🔁" title="Reopen Requests" n={ro.length} color={colors.purple} />
      {ro.length === 0
        ? <Empty text="No reopen requests." />
        : ro.map((r: ReopenRequest) => (
          <Card key={r.id}>
            <Text style={styles.title}>{r.clientName || '—'} — {r.workType || ''}</Text>
            <Text style={styles.meta}>
              Requested by {r.requestedByName || '—'} · for {r.memberName || '—'}
            </Text>
            {!!r.reason && <Text style={styles.reason}>“{r.reason}”</Text>}
            <Actions
              busy={busy === r.id}
              onApprove={() => actRequest('reopen', r.id, true)}
              onReject={() => actRequest('reopen', r.id, false)}
            />
          </Card>
        ))}

      {/* ── Leave approvals ── */}
      <SectionHead icon="🌴" title="Leave Approvals" n={lv.length} color={colors.teal} />
      {lv.length === 0
        ? <Empty text="No leave requests." />
        : lv.map((r: LeaveRequest) => (
          <Card key={r.id}>
            <Text style={styles.title}>
              {r.memberName || '—'} · {r.type} Leave ({r.days} day{r.days > 1 ? 's' : ''})
            </Text>
            <Text style={styles.meta}>{fmt(r.fromDate)} → {fmt(r.toDate)}</Text>
            {!!r.reason && <Text style={styles.reason}>“{r.reason}”</Text>}
            <Actions
              busy={busy === r.id}
              onApprove={() => actRequest('leave', r.id, true)}
              onReject={() => actRequest('leave', r.id, false)}
            />
          </Card>
        ))}
    </ScrollView>
  );
}

function SectionHead({ icon, title, n, color }: { icon: string; title: string; n: number; color: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headIcon}>{icon}</Text>
      <Text style={styles.headTitle}>{title}</Text>
      <View style={[styles.badge, { backgroundColor: n ? color : '#e5e7eb' }]}>
        <Text style={[styles.badgeText, { color: n ? colors.white : '#9ca3af' }]}>{n}</Text>
      </View>
    </View>
  );
}

function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function Actions({
  busy, onApprove, onReject, approveLabel = '✓ Approve', rejectLabel = '✗ Reject',
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={onApprove}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, styles.approve, (pressed || busy) && { opacity: 0.7 }]}
      >
        <Text style={styles.approveText}>{approveLabel}</Text>
      </Pressable>
      <Pressable
        onPress={onReject}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, styles.reject, (pressed || busy) && { opacity: 0.7 }]}
      >
        <Text style={styles.rejectText}>{rejectLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted },
  allClear: {
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.sm, alignItems: 'center',
  },
  allClearText: { ...font.small, color: '#15803d' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  headIcon: { fontSize: 15 },
  headTitle: { ...font.h3, color: colors.text, flexShrink: 1 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 1, minWidth: 26, alignItems: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  card: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  title: { ...font.small, color: colors.text, lineHeight: 18 },
  bold: { fontWeight: '800' },
  meta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3, lineHeight: 16 },
  reason: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 4, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  approve: { backgroundColor: colors.green },
  approveText: { ...font.small, color: colors.white },
  reject: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  rejectText: { ...font.small, color: colors.red },
  empty: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    borderRadius: radius.md, padding: spacing.lg, alignItems: 'center',
  },
  emptyText: { ...font.small, color: colors.muted, fontWeight: '500' },
});
