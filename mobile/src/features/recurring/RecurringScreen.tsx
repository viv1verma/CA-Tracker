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
import type { Assignment, RecurringTemplate } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import ReminderSheet from '../assignments/ReminderSheet';
import { SORT_OPTIONS, filterAndSort, fmtAny, type SortKey } from '../assignments/logic';
import RecurringTaskCard from './RecurringTaskCard';
import RecurringTemplateSheet from './RecurringTemplateSheet';
import { REC_TABS, freqPill, recFilter, recStats, type RecTab } from './logic';

type Pane = 'tasks' | 'setup';

/**
 * pg-recdash — Recurring Tasks. The "Tasks" pane lists the generated recurring
 * assignments; the "Setup" pane manages the templates that generate them.
 */
export default function RecurringScreen({
  onOpen, onEdit,
}: { onOpen: (id: string) => void; onEdit: (id: string) => void }) {
  const { user } = useAuth();
  const {
    assignments, clientsById, recurringTemplates,
    loading, refreshing, error, reload, removeAssignments, removeTemplates,
  } = useData();
  const { showToast } = useToast();

  const [pane, setPane] = useState<Pane>('tasks');
  const [tab, setTab] = useState<RecTab>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('client');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [tplSelected, setTplSelected] = useState<Set<string>>(new Set());
  const [remindFor, setRemindFor] = useState<Assignment | null>(null);
  const [sheetEditId, setSheetEditId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const isAdmin = user?.role === 'admin';
  const stats = useMemo(() => recStats(assignments), [assignments]);
  const rows = useMemo(() => {
    const filtered = recFilter(assignments, tab, search, clientsById);
    return filterAndSort(filtered, { search: '', memberId: '', status: '', sort }, clientsById);
  }, [assignments, tab, search, sort, clientsById]);

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

  const bulkDeleteTasks = () => {
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

  const deleteOneTask = (a: Assignment) => {
    Alert.alert('Delete assignment', 'Delete this?', [
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

  /** rdDeleteOne / rdBulkDelete — deleting a template drops its pending tasks. */
  const deleteTemplates = (ids: string[]) => {
    if (!ids.length) return;
    const many = ids.length > 1;
    Alert.alert(
      many ? 'Delete templates' : 'Delete template',
      many
        ? `Delete ${ids.length} recurring template(s)? Their pending tasks will be removed; completed history is kept.`
        : 'Delete this recurring template? Its pending tasks will be removed (completed history kept).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const id of ids) await api.del(endpoints.recurringTemplate(id));
              removeTemplates(ids);
              setTplSelected(new Set());
              await reload({ showSpinner: false });
              showToast(many ? `${ids.length} deleted` : 'Deleted');
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
            }
          },
        },
      ],
    );
  };

  /** recCleanupMismatches(): preview, confirm, then delete. Admin-only server-side. */
  const cleanupMismatches = async () => {
    setCleaning(true);
    try {
      const list = await api.get<{ clientName?: string; workType?: string; period?: string; frequency?: string }[]>(
        endpoints.recurringCleanup,
      );
      if (!list || !list.length) { showToast('No frequency mismatches found 👍'); return; }
      const sample = list.slice(0, 6)
        .map((x) => `• ${x.clientName} — ${x.workType} (${x.period}) [${x.frequency}]`).join('\n');
      const more = list.length > 6 ? `\n…and ${list.length - 6} more` : '';
      Alert.alert(
        'Clean up mismatches',
        `Found ${list.length} pending recurring task(s) whose period doesn't match the template frequency:\n\n${sample}${more}\n\nDelete these? Completed tasks are never touched.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const r = await api.post<{ removed: number }>(endpoints.recurringCleanup, {});
                await reload({ showSpinner: false });
                showToast(`Removed ${r.removed} mismatched task(s)`);
              } catch (e) {
                showToast(e instanceof ApiError ? e.message : 'Cleanup failed', 'error');
              }
            },
          },
        ],
      );
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Cleanup failed', 'error');
    } finally {
      setCleaning(false);
    }
  };

  const openSheet = (id: string | null) => { setSheetEditId(id); setSheetOpen(true); };

  if (loading) return <Loading label="Loading recurring tasks…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const paneSwitch = (
    <View style={styles.paneRow}>
      {(['tasks', 'setup'] as Pane[]).map((p) => {
        const on = p === pane;
        return (
          <Pressable
            key={p}
            onPress={() => setPane(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.paneBtn, on && styles.paneBtnOn]}
          >
            <Text style={[styles.paneText, on && styles.paneTextOn]}>{p === 'tasks' ? 'Tasks' : 'Setup'}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ── Setup pane ────────────────────────────────────────────────────────────
  if (pane === 'setup') {
    const tplIds = [...tplSelected];
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
          {paneSwitch}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recurring Templates</Text>
            <Pressable onPress={() => openSheet(null)} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.addLink}>+ Add</Text>
            </Pressable>
          </View>

          {tplIds.length > 0 && (
            <View style={styles.bulkBar}>
              <Text style={styles.bulkCount}>{tplIds.length} selected</Text>
              <Pressable onPress={() => deleteTemplates(tplIds)} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.bulkDel}>🗑 Delete selected</Text>
              </Pressable>
            </View>
          )}

          {recurringTemplates.length === 0 ? (
            <Text style={styles.noTemplates}>No templates yet.</Text>
          ) : (
            recurringTemplates.map((t: RecurringTemplate) => {
              const on = tplSelected.has(t.id);
              const f = freqPill(t.frequency);
              return (
                <Pressable
                  key={t.id}
                  onLongPress={() => setTplSelected(new Set([...tplSelected, t.id]))}
                  onPress={() => {
                    if (tplIds.length) {
                      const next = new Set(tplSelected);
                      if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                      setTplSelected(next);
                    } else openSheet(t.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.tpl, on && styles.tplOn, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.tplTop}>
                    {tplIds.length > 0 && (
                      <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tplClient} numberOfLines={2}>
                        {clientsById[t.clientId]?.name || t.clientName || '—'}
                      </Text>
                      <Text style={styles.tplWork} numberOfLines={2}>{t.workType}</Text>
                    </View>
                    <View style={[styles.freq, { backgroundColor: f.bg }]}>
                      <Text style={[styles.freqText, { color: f.fg }]}>{f.label}</Text>
                    </View>
                  </View>

                  <View style={styles.tplMeta}>
                    <Meta label="Member" value={t.memberName || '—'} />
                    <Meta label="Due" value={`${t.dueDayOfMonth ?? '—'}th`} />
                    <Meta label="Created" value={t.createdAt ? fmtAny(t.createdAt) : '—'} />
                    <Meta label="Status" value={t.active === false ? 'Paused' : 'Active'} />
                  </View>

                  <View style={styles.tplActions}>
                    <Pressable
                      onPress={() => openSheet(t.id)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.act, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={styles.actText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteTemplates([t.id])}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.act, styles.actDel, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={[styles.actText, { color: colors.red }]}>Del</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <RecurringTemplateSheet
          editId={sheetEditId}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      </View>
    );
  }

  // ── Tasks pane ────────────────────────────────────────────────────────────
  const header = (
    <View>
      {paneSwitch}

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

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Recurring Assignments</Text>
        {isAdmin && (
          <Pressable onPress={cleanupMismatches} disabled={cleaning} accessibilityRole="button" hitSlop={6}>
            <Text style={[styles.addLink, cleaning && { opacity: 0.5 }]}>
              {cleaning ? 'Checking…' : '🧹 Clean Up'}
            </Text>
          </Pressable>
        )}
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
          <Select value={sort} placeholder="Sort" options={SORT_OPTIONS} onChange={(v) => setSort(v as SortKey)} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {REC_TABS.map((t) => {
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
          <Pressable onPress={bulkDeleteTasks} hitSlop={8} accessibilityRole="button">
            <Text style={styles.selDel}>🗑 Delete</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload({ showSpinner: false })}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState icon="🔄" title="No recurring assignments" />}
        renderItem={({ item }) => (
          <RecurringTaskCard
            a={item}
            client={clientsById[item.clientId]}
            selected={selected.has(item.id)}
            selectMode={selectMode}
            isAdmin={isAdmin}
            onPress={() => onOpen(item.id)}
            onLongPress={() => { setSelectMode(true); toggle(item.id); }}
            onToggleSelect={() => toggle(item.id)}
            onRemind={() => setRemindFor(item)}
            onEdit={() => onEdit(item.id)}
            onDelete={() => deleteOneTask(item)}
          />
        )}
      />

      <ReminderSheet assignment={remindFor} visible={!!remindFor} onClose={() => setRemindFor(null)} />
      <RecurringTemplateSheet editId={sheetEditId} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  paneRow: {
    flexDirection: 'row', gap: 6, backgroundColor: '#f3f4f6',
    borderRadius: radius.md, padding: 3, marginBottom: spacing.md,
  },
  paneBtn: { flex: 1, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  paneBtnOn: { backgroundColor: colors.primary },
  paneText: { ...font.small, color: colors.muted },
  paneTextOn: { color: colors.white, fontWeight: '800' },
  stats: { gap: spacing.sm, paddingVertical: spacing.xs },
  stat: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 4, paddingVertical: 10, paddingHorizontal: 14, minWidth: 82,
  },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  sectionTitle: { ...font.h3, color: colors.text },
  addLink: { ...font.small, color: colors.primary },
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

  noTemplates: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
  bulkBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.md,
  },
  bulkCount: { ...font.small, color: '#991b1b' },
  bulkDel: { ...font.small, color: colors.red },
  tpl: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginTop: spacing.md,
  },
  tplOn: { borderColor: colors.primary, borderWidth: 2 },
  tplTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tplClient: { ...font.h3, color: colors.text, lineHeight: 19 },
  tplWork: { ...font.small, color: colors.muted, marginTop: 2 },
  freq: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  freqText: { fontSize: 10, fontWeight: '800' },
  tplMeta: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 2 },
  tplActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  act: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, minHeight: 34, justifyContent: 'center',
  },
  actDel: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },

  selectBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.purple, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  selCancel: { color: colors.white, fontSize: 16, fontWeight: '800' },
  selCount: { flex: 1, color: colors.white, ...font.h3 },
  selAll: { color: colors.white, ...font.small },
  selDel: { color: colors.white, ...font.small },
});
