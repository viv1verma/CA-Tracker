import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ChipRow, Select } from '../../components/form';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { AssignmentStatus } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import AssignmentCard from './AssignmentCard';
import { exportAssignmentsPdf } from './exportPdf';
import {
  SORT_OPTIONS, STATUS_FILTERS, assignmentPool, filterAndSort, memberUsers,
  type ListFilters, type SortKey,
} from './logic';

/**
 * pg-assignments. Search, member filter, status chips and sort behave exactly as
 * renderAssignments() does; the table's checkbox column becomes a long-press
 * selection mode, which is how a phone does multi-select.
 */
export default function AssignmentsScreen({
  onOpen, onNew,
}: { onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const {
    assignments, clients, users, clientsById, usersById,
    loading, refreshing, error, reload, removeAssignments,
  } = useData();
  const { showToast } = useToast();

  const [filters, setFilters] = useState<ListFilters>({
    search: '', memberId: '', status: '', sort: 'client',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [exporting, setExporting] = useState(false);

  const pool = useMemo(() => assignmentPool(assignments, user), [assignments, user]);
  const rows = useMemo(() => filterAndSort(pool, filters, clientsById), [pool, filters, clientsById]);

  const memberOptions = useMemo(
    () => [
      { value: '', label: 'All Members' },
      ...memberUsers(users).map((u) => ({ value: u.id, label: u.name, sub: u.designation })),
    ],
    [users],
  );

  const exitSelect = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);

  // Android back closes selection mode before it leaves the screen.
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
    Alert.alert(
      'Delete assignments',
      `Delete ${ids.length} assignment${ids.length > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const r = await api.post<{ deleted: number }>(endpoints.assignmentsBulkDelete, { ids });
              removeAssignments(ids);
              exitSelect();
              // The server silently skips rows the user may not delete, so report its count.
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
      ],
    );
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportAssignmentsPdf(rows, clientsById);
    } catch {
      showToast('Could not create the PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <Loading label="Loading assignments…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const header = (
    <View>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={filters.search}
            onChangeText={(t) => setFilters((f) => ({ ...f, search: t }))}
            placeholder="Search client, member or work…"
            placeholderTextColor={colors.muted}
            style={styles.search}
            returnKeyType="search"
          />
          {!!filters.search && (
            <Pressable onPress={() => setFilters((f) => ({ ...f, search: '' }))} hitSlop={8}>
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.selectsRow}>
        <View style={{ flex: 1 }}>
          <Select
            value={filters.memberId}
            placeholder="All Members"
            options={memberOptions}
            onChange={(v) => setFilters((f) => ({ ...f, memberId: v }))}
            searchable
          />
        </View>
        <View style={{ flex: 1 }}>
          <Select
            value={filters.sort}
            placeholder="Sort"
            options={SORT_OPTIONS}
            onChange={(v) => setFilters((f) => ({ ...f, sort: v as SortKey }))}
          />
        </View>
      </View>

      <ChipRow
        options={STATUS_FILTERS.map((s) => ({ value: s.value, label: s.label }))}
        value={filters.status}
        onChange={(v) => setFilters((f) => ({ ...f, status: v as '' | AssignmentStatus }))}
      />

      <View style={styles.countRow}>
        <Text style={styles.count}>
          {rows.length} of {pool.length} assignment{pool.length === 1 ? '' : 's'}
        </Text>
        <Pressable onPress={doExport} disabled={exporting} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.export, exporting && { opacity: 0.5 }]}>
            {exporting ? 'Preparing…' : '📄 Export PDF'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      {selectMode && (
        <View style={styles.selectBar}>
          <Pressable onPress={exitSelect} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selectCancel}>✕</Text>
          </Pressable>
          <Text style={styles.selectCount}>{selected.size} selected</Text>
          <Pressable
            onPress={() => setSelected(new Set(rows.map((r) => r.id)))}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.selectAll}>Select all</Text>
          </Pressable>
          <Pressable onPress={bulkDelete} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selectDelete}>🗑 Delete</Text>
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
          <EmptyState
            icon="📭"
            title="No assignments found"
            note={
              pool.length
                ? 'Nothing matches the current search and filters.'
                : 'Nothing has been assigned to you yet.'
            }
          />
        }
        renderItem={({ item }) => (
          <AssignmentCard
            a={item}
            client={clientsById[item.clientId]}
            member={usersById[item.memberId]}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            onPress={() => onOpen(item.id)}
            onLongPress={() => { setSelectMode(true); toggle(item.id); }}
            onToggleSelect={() => toggle(item.id)}
          />
        )}
      />

      {!selectMode && (
        <Pressable onPress={onNew} accessibilityRole="button" accessibilityLabel="New assignment"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  toolbar: { marginBottom: spacing.sm },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 14, color: colors.text },
  clear: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  selectsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  count: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  export: { ...font.small, color: colors.primary },

  selectBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  selectCancel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  selectCount: { flex: 1, color: colors.white, ...font.h3 },
  selectAll: { color: colors.white, ...font.small },
  selectDelete: { color: colors.white, ...font.small },

  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
