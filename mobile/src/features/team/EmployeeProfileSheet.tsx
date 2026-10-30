import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin, isHrAdmin } from '../../auth/permissions';
import { Sheet } from '../../components/form';
import { Button, ProgressBar, StatusPill } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { LeaveRequest } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, isOD, sbg } from '../assignments/logic';
import { attColor } from '../attendance/logic';
import type { AttendanceRecord, LeaveBalance } from '../attendance/types';
import {
  PROFILE_TABS, avatarHue, initials, memberCounts, qualColor, rupees,
  type Employee, type ProfileTab,
} from './logic';

/**
 * showEmpProfile() — the seven-tab employee panel. Overview, Personal and Work
 * read the user record; Attendance, Leaves and Salary fetch on demand.
 */
export default function EmployeeProfileSheet({
  member, visible, onClose, onEdit, onDeleted,
}: {
  member: Employee | null;
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const { user } = useAuth();
  const { assignments, clientsById } = useData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<ProfileTab>('overview');
  const [attendance, setAttendance] = useState<AttendanceRecord[] | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[] | null>(null);
  const [busy, setBusy] = useState('');

  /** The web shows Edit to admins, HR admins, or the member viewing themselves. */
  const canEdit = isAdmin(user) || isHrAdmin(user) || member?.id === user?.id;
  const canDelete = (isAdmin(user) || isHrAdmin(user)) && member?.id !== user?.id;

  const loadTab = useCallback(async (t: ProfileTab, id: string) => {
    if (t === 'attendance' && attendance === null) {
      const r = await api.get<AttendanceRecord[]>(endpoints.attendanceMember(id)).catch(() => []);
      setAttendance(Array.isArray(r) ? r : []);
    }
    if (t === 'leaves' && leaves === null) {
      const [b, l] = await Promise.all([
        api.get<LeaveBalance>(`${endpoints.leaveBalance}?userId=${id}`).catch(() => null),
        api.get<LeaveRequest[]>(`${endpoints.leaveRequests}?userId=${id}`).catch(() => []),
      ]);
      setBalance(b);
      setLeaves(Array.isArray(l) ? l : []);
    }
  }, [attendance, leaves]);

  useEffect(() => {
    if (!visible || !member) return;
    setTab('overview');
    setAttendance(null);
    setBalance(null);
    setLeaves(null);
  }, [visible, member?.id]);

  useEffect(() => {
    if (visible && member) void loadTab(tab, member.id);
  }, [tab, visible, member, loadTab]);

  if (!member) return null;

  const counts = memberCounts(member.id, assignments);
  const mine = assignments.filter((a) => a.memberId === member.id);
  const [qb, qc] = qualColor(member.qualification);

  const remove = () => {
    Alert.alert(
      'Delete member',
      `Delete ${member.name}? This permanently removes the member and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await api.del(endpoints.user(member.id));
              onDeleted(member.id);
              onClose();
              showToast(`${member.name} deleted`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
            } finally { setBusy(''); }
          },
        },
      ],
    );
  };

  return (
    <Sheet visible={visible} title={member.name} onClose={onClose}>
      {/* Header */}
      <View style={[styles.head, { backgroundColor: avatarHue(member.name) }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(member.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.desig}>
            {member.designation || ''}{member.branch ? ` · ${member.branch}` : ''}
          </Text>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{member.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {!!member.qualification && (
              <View style={[styles.badge, { backgroundColor: qb }]}>
                <Text style={[styles.badgeText, { color: qc }]}>{member.qualification}</Text>
              </View>
            )}
            {!!member.mobile && (
              <View style={styles.badge}><Text style={styles.badgeText}>{member.mobile}</Text></View>
            )}
          </View>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {PROFILE_TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button"
              accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
        {tab === 'overview' && (
          <>
            <View style={styles.counts}>
              <Count label="Tasks" value={counts.total} color={colors.primary} />
              <Count label="Pending" value={counts.pending} color={colors.amber} />
              <Count label="Done" value={counts.done} color={colors.green} />
              <Count label="Overdue" value={counts.overdue} color={colors.red} />
            </View>
            <Row icon="🏷" label="Designation" value={member.designation} />
            <Row icon="🎓" label="Qualification" value={member.qualification} />
            <Row icon="🏢" label="Branch" value={member.branch} />
            <Row icon="📅" label="Joined" value={fmt(member.joiningDate)} />
          </>
        )}

        {tab === 'personal' && (
          <>
            <Row icon="👤" label="Username" value={member.username} />
            <Row icon="✉️" label="Email" value={member.email} />
            <Row icon="📞" label="Mobile" value={member.mobile} />
            <Row icon="🎂" label="Date of Birth" value={fmt(member.dob)} />
            <Row icon="💍" label="Anniversary" value={fmt(member.anniversary)} />
            <Row icon="📍" label="Address" value={member.address} />
            <Row icon="🆘" label="Emergency Contact" value={member.emergencyContact} />
          </>
        )}

        {tab === 'work' && (
          <>
            <Row icon="📅" label="Joining Date" value={fmt(member.joiningDate)} />
            <Row icon="🏢" label="Branch" value={member.branch} />
            <Row icon="🎓" label="Qualification" value={member.qualification} />
            <Row icon="🏷" label="Designation" value={member.designation} />
            <Row icon="⭐" label="Firm Partner" value={member.isFirmPartner ? 'Yes' : 'No'} />
            <Row icon="🧾" label="ITR Admin" value={member.itrAdmin ? 'Yes' : 'No'} />
            <Row icon="👥" label="HR Admin" value={member.hrAdmin ? 'Yes' : 'No'} />
            <Row icon="💰" label="Payroll Access" value={member.payrollAccess ? 'Yes' : 'No'} />
          </>
        )}

        {tab === 'attendance' && (
          attendance === null ? <Text style={styles.loading}>Loading…</Text>
            : attendance.length === 0 ? <Text style={styles.loading}>No attendance records.</Text>
              : attendance.slice(0, 40).map((a) => {
                const c = attColor(a.status);
                return (
                  <View key={a.id || a.date} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowValue}>{fmt(a.date)}</Text>
                      <Text style={styles.rowLabel}>
                        {a.punchIn || '—'} → {a.punchOut || '—'}{a.workHours ? ` · ${a.workHours}h` : ''}
                      </Text>
                    </View>
                    <StatusPill label={a.status || '—'} bg={c.bg} fg={c.fg} />
                  </View>
                );
              })
        )}

        {tab === 'leaves' && (
          leaves === null ? <Text style={styles.loading}>Loading…</Text> : (
            <>
              {!!balance && (
                <View style={styles.counts}>
                  <Count label="Accrued" value={balance.accrued} color={colors.primary} />
                  <Count label="Used" value={balance.used} color={colors.amber} />
                  <Count label="Remaining" value={balance.remaining} color={colors.green} />
                </View>
              )}
              {leaves.length === 0 ? <Text style={styles.loading}>No leave requests.</Text>
                : leaves.map((r) => (
                  <View key={r.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowValue}>{r.type} · {r.days} day{r.days > 1 ? 's' : ''}</Text>
                      <Text style={styles.rowLabel}>{fmt(r.fromDate)} → {fmt(r.toDate)}</Text>
                    </View>
                    <Text style={styles.leaveStatus}>{r.status}</Text>
                  </View>
                ))}
            </>
          )
        )}

        {tab === 'tasks' && (
          mine.length === 0 ? <Text style={styles.loading}>No tasks assigned.</Text>
            : mine.slice(0, 40).map((a) => {
              const od = isOD(a);
              const [bg, fg] = sbg(a.status);
              return (
                <View key={a.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {clientsById[a.clientId]?.name || '—'}
                    </Text>
                    <Text style={styles.rowLabel} numberOfLines={1}>{a.workType}</Text>
                    {!!a.completionPct && (
                      <View style={styles.progRow}>
                        <ProgressBar pct={a.completionPct} />
                        <Text style={styles.pct}>{a.completionPct}%</Text>
                      </View>
                    )}
                  </View>
                  <StatusPill
                    label={od ? '⚠ OD' : a.status || 'Pending'}
                    bg={od ? '#fee2e2' : bg}
                    fg={od ? '#b91c1c' : fg}
                  />
                </View>
              );
            })
        )}

        {tab === 'salary' && (
          <>
            <Row icon="💵" label="Basic" value={rupees(member.basicSalary)} />
            <Row icon="🏠" label="HRA" value={rupees(member.hra)} />
            <Row icon="🚗" label="Conveyance" value={rupees(member.conveyance)} />
            <Row icon="➕" label="Other Allowance" value={rupees(member.otherAllowance)} />
            <Row
              icon="🧮"
              label="Gross / month"
              value={rupees(
                (member.basicSalary || 0) + (member.hra || 0)
                + (member.conveyance || 0) + (member.otherAllowance || 0),
              )}
            />
          </>
        )}
      </ScrollView>

      {(canEdit || canDelete) && (
        <View style={styles.footer}>
          {canEdit && (
            <View style={{ flex: 1 }}><Button title="✏ Edit" onPress={onEdit} variant="outline" /></View>
          )}
          {canDelete && (
            <View style={{ flex: 1 }}>
              <Button title="🗑 Delete" onPress={remove} loading={busy === 'delete'} variant="danger" />
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '900', color: colors.white },
  name: { ...font.h3, color: colors.white },
  desig: { ...font.tiny, color: 'rgba(255,255,255,.85)', fontWeight: '600', marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  badge: { backgroundColor: 'rgba(255,255,255,.22)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
  tabs: { gap: 6, paddingVertical: 3, marginBottom: spacing.sm },
  tab: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm,
    backgroundColor: '#f3f4f6', minHeight: 34, justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.primary },
  tabText: { ...font.tiny, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: colors.white },
  counts: {
    flexDirection: 'row', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginBottom: spacing.sm,
  },
  countValue: { fontSize: 18, fontWeight: '900' },
  countLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  rowIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  rowLabel: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },
  rowValue: { ...font.small, color: colors.text, marginTop: 2 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb',
  },
  leaveStatus: { ...font.tiny, color: colors.muted, fontWeight: '700' },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  pct: { ...font.tiny, color: colors.primary, width: 34, textAlign: 'right' },
  loading: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  footer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
