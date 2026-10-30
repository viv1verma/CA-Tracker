import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, BackHandler, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import ReminderSheet from '../assignments/ReminderSheet';
import { exportAssignmentsPdf } from '../assignments/exportPdf';
import { SORT_OPTIONS, filterAndSort, type SortKey } from '../assignments/logic';
import DashTaskCard from './DashTaskCard';
import { OverdueSheet, SubAssignmentsSection, WorkloadSection } from './DashSections';
import { exportOneTimeExcel } from './exportExcel';
import {
  DASH_TABS, DEFAULT_TAB, dashFilter, dashStats, oneTimePool, overdueTasks,
  subAssignments, workloadRows, type DashTab,
} from './logic';

/**
 * pg-dashboard — "One-Time Tasks" (admin). Recurring work is excluded here and
 * lives in the Recurring Tasks module, exactly as renderDashTable() decides.
 */
export default function OneTimeScreen({
  onOpen, onEdit, onNew,
}: {
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
}) {
  const { user } = useAuth();
  const {
    assignments, clients, users, clientsById, usersById,
    dueDateRequests, reopenRequests,
    loading, refreshing, error, reload, removeAssignments,
  } = useData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<DashTab>(DEFAULT_TAB);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('client');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [remindFor, setRemindFor] = useState<Assignment | null>(null);
  const [busyExport, setBusyExport] = useState<'' | 'xlsx' | 'pdf'>('');

  const isAdmin = user?.role === 'admin';
  const stats = useMemo(() => dashStats(assignments), [assignments]);
  const od = useMemo(() => overdueTasks(assignments), [assignments]);
  const workload = useMemo(() => workloadRows(assignments, users), [assignments, users]);
  const subs = useMemo(() => subAssignments(assignments), [assignments]);

  const rows = useMemo(() => {
    const filtered = dashFilter(assignments, tab, search, clientsById);
    // Reuse the shared sorter; the seven options are identical to the web's.
    return filterAndSort(filtered, { search: '', memberId: '', status: '', sort }, clientsById);
  }, [assignments, tab, search, sort, clientsById]);

  const pendingDDR = dueDateRequests.filter((r) => r.status === 'pending').length;
  const pendingReopen = reopenRequests.filter((r) => r.status === 'pending').length;

  const exitSelect = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);

  React.useEffect(() => {
    if (!selectMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { exitSelect(); return true; });
    return () => sub.remove();
  }, [selectMode, exitSelect]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  };

  const bulkDelete = () => {
    const ids = [...selected];
    if (!ids.length) return;
    Alert.alert('Delete assignments', `Delete ${ids.length} selected assignment${ids.length > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await api.post<{ deleted: number }>(endpoints.assignmentsBulkDelete, { ids });
            removeAssignments(ids);
            exitSelect();
            showToast(
              r.deleted === ids.length
                ? `${r.deleted} deleted`
                : `${r.deleted} of ${ids.length} deleted — the rest are not yours to delete`,
              r.deleted === ids.length ? 'success' : 'error',
            );
            if (r.deleted !== ids.length) void reload({ showSpinner: false });
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  const deleteOne = (a: Assignment) => {
    Alert.alert('Delete assignment', 'Delete this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.assignment(a.id));
            removeAssignments([a.id]);
            showToast('Deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  const doExcel = async () => {
    setBusyExport('xlsx');
    try { await exportOneTimeExcel(assignments, clients, users); }
    catch { showToast('Could not create the Excel file', 'error'); }
    finally { setBusyExport(''); }
  };

  const doPdf = async () => {
    setBusyExport('pdf');
    try { await exportAssignmentsPdf(oneTimePool(assignments), clientsById); }
    catch { showToast('Could not create the PDF', 'error'); }
    finally { setBusyExport(''); }
  };

  if (loading) return <Loading label="Loading one-time tasks…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const header = (
    <View>
      {/* Pending-request banners */}
      {pendingDDR > 0 && (
        <Banner
          tone="amber"
          text={`📅 ${pendingDDR} Due Date Request${pendingDDR > 1 ? 's' : ''} pending`}
          note="Review in Approvals"
        />
      )}
      {pendingReopen > 0 && (
        <Banner
          tone="violet"
          text={`🔁 ${pendingReopen} Reopen Request${pendingReopen > 1 ? 's' : ''} pending`}
          note="Review in Approvals"
        />
      )}

      {/* Stat strip — each card switches the tab, as the web's onclick does */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
        {stats.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => setTab(s.tab)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.stat, { borderLeftColor: s.color }, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Overdue alert */}
      {od.length > 0 && (
        <Pressable
          onPress={() => setOverdueOpen(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.odAlert, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.odText}>
            ⚠ {od.length} task{od.length > 1 ? 's' : ''} past due — tap to view
          </Text>
        </Pressable>
      )}

      {/* Section header + search + sort */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>One-Time Assignments</Text>
        <View style={styles.exportRow}>
          <Pressable onPress={doExcel} disabled={!!busyExport} hitSlop={6} accessibilityRole="button">
            <Text style={[styles.export, !!busyExport && { opacity: 0.5 }]}>
              {busyExport === 'xlsx' ? 'Preparing…' : '📥 Excel'}
            </Text>
          </Pressable>
          <Pressable onPress={doPdf} disabled={!!busyExport} hitSlop={6} accessibilityRole="button">
            <Text style={[styles.export, !!busyExport && { opacity: 0.5 }]}>
              {busyExport === 'pdf' ? 'Preparing…' : '📄 PDF'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            placeholderTextColor={colors.muted}
            style={styles.search}
            returnKeyType="search"
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          )}
        </View>
        <View style={{ width: 150 }}>
          <Select
            value={sort}
            placeholder="Sort"
            options={SORT_OPTIONS}
            onChange={(v) => setSort(v as SortKey)}
          />
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {DASH_TABS.map((t) => {
          const on = t.value === tab;
          const active = t.danger ? colors.red : colors.primary;
          return (
            <Pressable
              key={t.value || 'all'}
              onPress={() => setTab(t.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && { borderBottomColor: active }]}
            >
              <Text style={[styles.tabText, { color: on ? active : colors.muted }, on && { fontWeight: '800' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.count}>{rows.length} shown</Text>
    </View>
  );

  const footer = (
    <View style={{ marginTop: spacing.lg }}>
      <WorkloadSection rows={workload} />
      <SubAssignmentsSection subs={subs} usersById={usersById} onOpen={onOpen} />
    </View>
  );

  return (
    <View style={styles.flex}>
      {selectMode && (
        <View style={styles.selectBar}>
          <Pressable onPress={exitSelect} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selCancel}>✕</Text>
          </Pressable>
          <Text style={styles.selCount}>{selected.size} selected</Text>
          <Pressable onPress={() => setSelected(new Set(rows.map((r) => r.id)))} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selAll}>Select all</Text>
          </Pressable>
          <Pressable onPress={bulkDelete} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selDel}>🗑 Delete</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload({ showSpinner: false })}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState icon="📋" title="No assignments" />}
        renderItem={({ item }) => (
          <DashTaskCard
            a={item}
            client={clientsById[item.clientId]}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            isReporter={item.reportingPersonId === user?.id || isAdmin}
            isAdmin={isAdmin}
            onPress={() => onOpen(item.id)}
            onLongPress={() => { setSelectMode(true); toggle(item.id); }}
            onToggleSelect={() => toggle(item.id)}
            onEdit={() => onEdit(item.id)}
            onRemind={() => setRemindFor(item)}
            onDelete={() => deleteOne(item)}
          />
        )}
      />

      {!selectMode && (
        <Pressable onPress={onNew} accessibilityRole="button" accessibilityLabel="New assignment"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <OverdueSheet
        visible={overdueOpen}
        tasks={od}
        clientsById={clientsById}
        onClose={() => setOverdueOpen(false)}
        onOpen={onOpen}
      />
      <ReminderSheet assignment={remindFor} visible={!!remindFor} onClose={() => setRemindFor(null)} />
    </View>
  );
}

function Banner({ tone, text, note }: { tone: 'amber' | 'violet'; text: string; note: string }) {
  const bg = tone === 'amber' ? '#fef3c7' : '#ede9fe';
  const bar = tone === 'amber' ? '#f59e0b' : colors.purple;
  const fg = tone === 'amber' ? '#92400e' : '#5b21b6';
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderLeftColor: bar }]}>
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
      <Text style={[styles.bannerNote, { color: fg }]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  banner: { borderLeftWidth: 4, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  bannerText: { ...font.small },
  bannerNote: { ...font.tiny, fontWeight: '500', marginTop: 2, opacity: 0.85 },
  stats: { gap: spacing.sm, paddingVertical: spacing.sm },
  stat: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 4, paddingVertical: 10, paddingHorizontal: 14, minWidth: 82,
  },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  odAlert: {
    backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  odText: { ...font.small, color: colors.red },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: { ...font.h3, color: colors.text },
  exportRow: { flexDirection: 'row', gap: spacing.md },
  export: { ...font.small, color: colors.primary },
  controls: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 14, color: colors.text },
  clear: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  tabs: { gap: spacing.xs, marginTop: spacing.md },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent', minHeight: 40 },
  tabText: { ...font.small },
  count: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, paddingVertical: spacing.md },

  selectBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  selCancel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  selCount: { flex: 1, color: colors.white, ...font.h3 },
  selAll: { color: colors.white, ...font.small },
  selDel: { color: colors.white, ...font.small },

  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
