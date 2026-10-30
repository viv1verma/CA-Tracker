import React, { useMemo, useState } from 'react';
import {
  Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { canManageTeam, isOthers } from '../../auth/permissions';
import { Select } from '../../components/form';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import EmployeeProfileSheet from './EmployeeProfileSheet';
import UserFormSheet from './UserFormSheet';
import {
  QUALIFICATIONS, TEAM_SORTS, avatarHue, filterTeam, initials, memberCounts,
  qualColor, teamStats, type Employee, type TeamSort,
} from './logic';

/**
 * pg-team — the staff roster. Admins are excluded from the list; each row shows
 * that member's live workload, and tapping opens the seven-tab profile.
 */
export default function TeamScreen() {
  const { user } = useAuth();
  const { users, assignments, loading, refreshing, error, reload } = useData();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [qual, setQual] = useState('');
  const [sort, setSort] = useState<TeamSort>('name');
  const [profileFor, setProfileFor] = useState<Employee | null>(null);
  const [formFor, setFormFor] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const staff = users as Employee[];
  const canManage = canManageTeam(user);

  const rows = useMemo(
    () => filterTeam(staff, search, branch, qual, sort, assignments),
    [staff, search, branch, qual, sort, assignments],
  );
  const stats = useMemo(() => teamStats(staff, rows.length), [staff, rows.length]);
  const branches = useMemo(
    () => [...new Set(staff.map((u) => u.branch).filter(Boolean))] as string[],
    [staff],
  );
  const total = staff.filter((u) => u.role !== 'admin').length;

  /** The web hides the whole page from the "Others" qualification. */
  if (isOthers(user)) {
    return (
      <EmptyState
        icon="🔒"
        title="Access Restricted"
        note="Team list is only visible to CA / CS members"
      />
    );
  }

  if (loading) return <Loading label="Loading team…" />;
  if (error && !users.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const remove = (m: Employee) => {
    Alert.alert(
      'Delete member',
      `Delete ${m.name}? This permanently removes the member and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.del(endpoints.user(m.id));
              await reload({ showSpinner: false });
              showToast(`${m.name} deleted`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
            }
          },
        },
      ],
    );
  };

  const header = (
    <View>
      <Text style={styles.sub}>{rows.length} of {total} employees</Text>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput value={search} onChangeText={setSearch}
          placeholder="Search name, role, branch…" placeholderTextColor={colors.muted}
          style={styles.search} returnKeyType="search" />
        {!!search && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.filters}>
        <View style={{ flex: 1 }}>
          <Select value={branch} placeholder="All Branches"
            options={[{ value: '', label: 'All Branches' },
              ...branches.map((b) => ({ value: b, label: b }))]}
            onChange={setBranch} />
        </View>
        <View style={{ flex: 1 }}>
          <Select value={qual} placeholder="All Quals"
            options={[{ value: '', label: 'All Quals' },
              ...QUALIFICATIONS.map((q) => ({ value: q, label: q }))]}
            onChange={setQual} />
        </View>
      </View>
      <View style={styles.filters}>
        <View style={{ flex: 1 }}>
          <Select value={sort} placeholder="Sort" options={TEAM_SORTS}
            onChange={(v) => setSort(v as TeamSort)} />
        </View>
      </View>

      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: s.bg }]}>
            <Text style={[styles.statValue, { color: s.color }]} numberOfLines={2}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <FlatList
        data={rows}
        keyExtractor={(u) => u.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void reload({ showSpinner: false })}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={<EmptyState icon="👥" title="No employees match filter" />}
        renderItem={({ item }) => {
          const c = memberCounts(item.id, assignments);
          const [qb, qc] = qualColor(item.qualification);
          return (
            <Pressable onPress={() => setProfileFor(item)} accessibilityRole="button"
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: avatarHue(item.name) }]}>
                  <Text style={styles.avatarText}>{initials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.contact}>{item.email || item.mobile || '—'}</Text>
                </View>
                <View style={[styles.qual, { backgroundColor: qb }]}>
                  <Text style={[styles.qualText, { color: qc }]}>{item.qualification || '—'}</Text>
                </View>
              </View>

              <View style={styles.meta}>
                <Meta label="Designation" value={item.designation || '—'} />
                <Meta label="Branch" value={item.branch || '—'} />
                <Meta label="Joined" value={item.joiningDate || '—'} />
              </View>

              <View style={styles.counts}>
                <Count label="Tasks" value={c.total} color={colors.primary} />
                <Count label="Pending" value={c.pending}
                  bg={c.pending ? '#fffbeb' : '#ecfdf5'} color={c.pending ? '#d97706' : '#16a34a'} />
                <Count label="Overdue" value={c.overdue}
                  bg={c.overdue ? '#fef2f2' : '#f3f4f6'} color={c.overdue ? '#dc2626' : '#374151'} />
              </View>

              <View style={styles.actions}>
                <Act label="Profile →" onPress={() => setProfileFor(item)} />
                {canManage && item.id !== user?.id && (
                  <Act label="🗑" onPress={() => remove(item)} danger />
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {canManage && (
        <Pressable onPress={() => { setFormFor(null); setFormOpen(true); }}
          accessibilityRole="button" accessibilityLabel="Add team member"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <EmployeeProfileSheet
        member={profileFor}
        visible={!!profileFor}
        onClose={() => setProfileFor(null)}
        onEdit={() => { const m = profileFor; setProfileFor(null); setFormFor(m); setFormOpen(true); }}
        onDeleted={() => void reload({ showSpinner: false })}
      />
      <UserFormSheet
        member={formFor}
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload({ showSpinner: false })}
      />
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Count({ label, value, color, bg }: { label: string; value: number; color: string; bg?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={[styles.countPill, bg ? { backgroundColor: bg } : null]}>
        <Text style={[styles.countValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function Act({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}
      style={({ pressed }) => [
        styles.act,
        danger && { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
        pressed && { opacity: 0.7 },
      ]}>
      <Text style={[styles.actText, danger && { color: colors.red }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  sub: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 14, color: colors.text },
  clear: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  stat: { flexGrow: 1, minWidth: '46%', borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 10 },
  statValue: { fontSize: 15, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#6b7280', marginTop: 3 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '900', color: colors.white },
  name: { ...font.h3, color: colors.text },
  contact: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  qual: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  qualText: { fontSize: 10, fontWeight: '700' },
  meta: { flexDirection: 'row', marginTop: spacing.md },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaValue: { ...font.tiny, color: colors.text, fontWeight: '600', marginTop: 2 },
  counts: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  countPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, minWidth: 34, alignItems: 'center' },
  countValue: { fontSize: 13, fontWeight: '800' },
  countLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 3 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  act: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, minHeight: 34, justifyContent: 'center',
  },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
