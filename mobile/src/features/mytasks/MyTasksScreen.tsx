import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, BackHandler, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
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
import ProgressSheet from '../assignments/ProgressSheet';
import MyTaskCard from './MyTaskCard';
import {
  MY_TABS, filterMyTasks, myStats, myTasks, periodOptions, type MyTab,
} from './logic';

/**
 * pg-myassign — "My Tasks" (member). Shows only what is assigned to me; the work
 * I supervise lives in the Supervising module, and what I delegated in My Team.
 */
export default function MyTasksScreen({
  onOpen, onNew,
}: { onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const {
    assignments, clientsById, loading, refreshing, error, reload, removeAssignments,
  } = useData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<MyTab>('');
  const [period, setPeriod] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [updateFor, setUpdateFor] = useState<Assignment | null>(null);

  const mine = useMemo(() => myTasks(assignments, user), [assignments, user]);
  const stats = useMemo(() => myStats(mine), [mine]);
  const periods = useMemo(() => periodOptions(mine), [mine]);
  const rows = useMemo(
    () => filterMyTasks(mine, tab, period, clientsById),
    [mine, tab, period, clientsById],
  );

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
    Alert.alert('Delete tasks', `Delete ${ids.length} assignment${ids.length > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await api.post<{ deleted: number }>(endpoints.assignmentsBulkDelete, { ids });
            removeAssignments(ids);
            exitSelect();
            // The server only deletes rows you created; report what it actually did.
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

  if (loading) return <Loading label="Loading your tasks…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const firstName = (user?.name || '').replace('[TEST] ', '').split(' ')[0];

  const header = (
    <View>
      <Text style={styles.greeting}>Hello, {firstName}! 👋</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.stat, { borderLeftColor: s.color }]}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          </View>
        ))}
      </ScrollView>

      {periods.length > 1 && (
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>Period:</Text>
          <View style={{ flex: 1 }}>
            <Select value={period} placeholder="All Periods" options={periods} onChange={setPeriod} />
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {MY_TABS.map((t) => {
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
        ListEmptyComponent={
          <EmptyState icon="📋" title={tab ? 'No tasks with this filter' : 'No tasks yet'} />
        }
        renderItem={({ item }) => (
          <MyTaskCard
            a={item}
            client={clientsById[item.clientId]}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            onPress={() => onOpen(item.id)}
            onLongPress={() => { setSelectMode(true); toggle(item.id); }}
            onToggleSelect={() => toggle(item.id)}
            onUpdate={() => setUpdateFor(item)}
          />
        )}
      />

      {!selectMode && (
        <Pressable onPress={onNew} accessibilityRole="button" accessibilityLabel="New assignment"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <ProgressSheet
        assignment={updateFor}
        visible={!!updateFor}
        onClose={() => setUpdateFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  greeting: { ...font.h2, color: colors.text, marginBottom: spacing.sm },
  stats: { gap: spacing.sm, paddingVertical: spacing.xs },
  stat: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 4, paddingVertical: 10, paddingHorizontal: 14, minWidth: 80,
  },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  periodLabel: { ...font.small, color: colors.muted },
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
