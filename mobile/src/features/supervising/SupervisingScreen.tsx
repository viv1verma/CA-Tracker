import React, { useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import ReminderSheet from '../assignments/ReminderSheet';
import DueDateRequestSheet from './DueDateRequestSheet';
import ReopenRequestSheet from './ReopenRequestSheet';
import SupervisingCard from './SupervisingCard';
import {
  SUP_TABS, SUP_TYPES, filterSupervised, myLatestRequest, supervisedPool,
  type SupTab, type SupType,
} from './logic';

/**
 * pg-supervising — work I oversee as reporting person. From here I can nudge the
 * assignee, ask an admin to move a due date, or ask to reopen a completed task.
 */
export default function SupervisingScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const {
    assignments, clientsById, dueDateRequests, loading, refreshing, error, reload,
  } = useData();

  const [type, setType] = useState<SupType>('onetime');
  const [tab, setTab] = useState<SupTab>('');
  const [search, setSearch] = useState('');
  const [remindFor, setRemindFor] = useState<Assignment | null>(null);
  const [ddrFor, setDdrFor] = useState<Assignment | null>(null);
  const [reopenFor, setReopenFor] = useState<Assignment | null>(null);

  const pool = useMemo(() => supervisedPool(assignments, user), [assignments, user]);
  const rows = useMemo(
    () => filterSupervised(pool, type, tab, search, clientsById),
    [pool, type, tab, search, clientsById],
  );

  if (loading) return <Loading label="Loading supervised work…" />;
  if (error && !assignments.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const header = (
    <View>
      <View style={styles.topRow}>
        <Text style={styles.count}>{rows.length} assignments</Text>
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
      </View>

      {/* One-Time / Recurring segmented control */}
      <View style={styles.segment}>
        {SUP_TYPES.map((t) => {
          const on = t.value === type;
          return (
            <Pressable
              key={t.value}
              onPress={() => setType(t.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.segBtn, on && styles.segBtnOn]}
            >
              <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {SUP_TABS.map((t) => {
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
    </View>
  );

  return (
    <View style={styles.flex}>
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
        ListEmptyComponent={<EmptyState icon="👁" title="No assignments to supervise" />}
        renderItem={({ item }) => (
          <SupervisingCard
            a={item}
            client={clientsById[item.clientId]}
            myRequest={myLatestRequest(dueDateRequests, item.id, user)}
            onPress={() => onOpen(item.id)}
            onRemind={() => setRemindFor(item)}
            onRequestDate={() => setDdrFor(item)}
            onRequestReopen={() => setReopenFor(item)}
          />
        )}
      />

      <ReminderSheet assignment={remindFor} visible={!!remindFor} onClose={() => setRemindFor(null)} />
      <DueDateRequestSheet assignment={ddrFor} visible={!!ddrFor} onClose={() => setDdrFor(null)} />
      <ReopenRequestSheet assignment={reopenFor} visible={!!reopenFor} onClose={() => setReopenFor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  count: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10,
  },
  searchIcon: { fontSize: 13, marginRight: 5 },
  search: { flex: 1, height: 40, fontSize: 13, color: colors.text },
  clear: { color: colors.muted, fontSize: 13, paddingHorizontal: 4 },
  segment: {
    flexDirection: 'row', gap: 6, backgroundColor: '#f3f4f6',
    borderRadius: radius.md, padding: 3, marginTop: spacing.md,
  },
  segBtn: { flex: 1, height: 40, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { ...font.small, color: colors.muted },
  segTextOn: { color: colors.white, fontWeight: '800' },
  tabs: { gap: spacing.xs, marginTop: spacing.md, paddingBottom: spacing.sm },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent', minHeight: 40 },
  tabText: { ...font.small },
});
