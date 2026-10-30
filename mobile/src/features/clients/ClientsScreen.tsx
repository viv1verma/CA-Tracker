import React, { useMemo, useState } from 'react';
import {
  Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Client } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import ClientComplianceSheet from './ClientComplianceSheet';
import ClientProfileSheet from './ClientProfileSheet';
import ClientSheet from './ClientSheet';
import GroupsSheet from './GroupsSheet';
import {
  CLIENT_SORTS, canManageClients, clientCounts, clientsRestricted, filterClients,
  type ClientSort,
} from './logic';

/**
 * pg-clients — the client list with per-client task counters. Tapping a name
 * opens the profile; admins and ITR admins can also add, edit and delete.
 */
export default function ClientsScreen() {
  const { user } = useAuth();
  const { clients, assignments, loading, refreshing, error, reload } = useData();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClientSort>('name');
  const [sheetEditId, setSheetEditId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [profileFor, setProfileFor] = useState<Client | null>(null);
  // openComplianceEditor(): the editor replaces the profile panel, as on the web.
  const [complianceFor, setComplianceFor] = useState<Client | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);

  const canManage = canManageClients(user);
  const rows = useMemo(
    () => filterClients(clients, search, sort, assignments),
    [clients, search, sort, assignments],
  );

  /** The "Others" qualification cannot see the client list at all. */
  if (clientsRestricted(user)) {
    return (
      <EmptyState
        icon="🔒"
        title="Access Restricted"
        note="Clients list is only visible to CA / CS members"
      />
    );
  }

  if (loading) return <Loading label="Loading clients…" />;
  if (error && !clients.length) {
    return <ErrorState message={error} onRetry={() => void reload({ showSpinner: true })} />;
  }

  const remove = (c: Client) => {
    Alert.alert('Delete client', `Delete ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.client(c.id));
            await reload({ showSpinner: false });
            showToast('Deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  const header = (
    <View>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {rows.length}{search ? ' results' : ' clients'}
        </Text>
        <Pressable onPress={() => setGroupsOpen(true)} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>👥 Groups</Text>
        </Pressable>
      </View>

      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, PAN, GST, address…"
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
        <View style={{ width: 140 }}>
          <Select value={sort} placeholder="Sort" options={CLIENT_SORTS}
            onChange={(v) => setSort(v as ClientSort)} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void reload({ showSpinner: false })}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState icon="🏢" title={search ? 'No clients found' : 'No clients yet'} />
        }
        renderItem={({ item }) => {
          const c = clientCounts(item.id, assignments);
          return (
            <Pressable
              onPress={() => setProfileFor(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {!!item.contact && <Text style={styles.contact}>{item.contact}</Text>}
                </View>
                <View style={styles.typePill}>
                  <Text style={styles.typeText}>{item.type || '—'}</Text>
                </View>
              </View>

              <View style={styles.ids}>
                <Field label="PAN" value={item.pan || '—'} strong />
                <Field label="GSTIN" value={item.gst || '—'} />
              </View>
              {!!item.address && <Text style={styles.address} numberOfLines={1}>📍 {item.address}</Text>}

              <View style={styles.counts}>
                <Count label="Tasks" value={c.total} color={colors.primary} always />
                <Count label="Pend" value={c.pending} color={colors.amber} />
                <Count label="WIP" value={c.wip} color={colors.purple} />
                <Count label="Done" value={c.done} color={colors.green} />
              </View>

              {canManage ? (
                <View style={styles.actions}>
                  <Act label="✏ Edit" onPress={() => { setSheetEditId(item.id); setSheetOpen(true); }} />
                  <Act label="🗑 Delete" onPress={() => remove(item)} danger />
                </View>
              ) : (
                <Text style={styles.viewOnly}>View</Text>
              )}
            </Pressable>
          );
        }}
      />

      {canManage && (
        <Pressable
          onPress={() => { setSheetEditId(null); setSheetOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel="Add client"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <ClientSheet
        editId={sheetEditId}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={() => void reload({ showSpinner: false })}
      />
      <ClientProfileSheet
        client={profileFor}
        visible={!!profileFor && !complianceFor}
        onClose={() => setProfileFor(null)}
        onChanged={() => void reload({ showSpinner: false })}
        onOpenCompliance={() => setComplianceFor(profileFor)}
      />
      <ClientComplianceSheet
        client={complianceFor}
        visible={!!complianceFor}
        onClose={() => setComplianceFor(null)}
      />
      <GroupsSheet
        visible={groupsOpen}
        onClose={() => setGroupsOpen(false)}
        onChanged={() => void reload({ showSpinner: false })}
      />
    </View>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, strong && { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Count({ label, value, color, always }: { label: string; value: number; color: string; always?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[styles.countValue, { color }]}>{value || (always ? 0 : '—')}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function Act({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={4}
      style={({ pressed }) => [
        styles.act,
        danger && { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.actText, danger && { color: colors.red }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 96 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  link: { ...font.small, color: colors.primary },
  controls: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 14, color: colors.text },
  clear: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { ...font.h3, color: colors.primary, textDecorationLine: 'underline' },
  contact: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  typePill: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  ids: { flexDirection: 'row', marginTop: spacing.sm },
  fieldLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  fieldValue: { ...font.tiny, color: colors.muted, fontWeight: '600', marginTop: 2 },
  address: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 6 },
  counts: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  countValue: { fontSize: 15, fontWeight: '900' },
  countLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  act: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, minHeight: 34, justifyContent: 'center',
  },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  viewOnly: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.sm },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#101828', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.white, fontSize: 30, marginTop: -3, fontWeight: '400' },
});
