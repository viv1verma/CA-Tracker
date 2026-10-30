import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { ClientGroup } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';

/**
 * openGroupsSheet(). A group is one portal login covering several companies:
 * create a group, add companies to it, remove them, or delete the group.
 */
export default function GroupsSheet({
  visible, onClose, onChanged,
}: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const { clients } = useData();
  const { showToast } = useToast();

  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await api.get<ClientGroup[]>(endpoints.groups);
      setGroups(g || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setName(''); setUsername(''); setPassword(''); setStatus('');
    void load();
  }, [visible, load]);

  const sortedClients = useMemo(
    () => clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [clients],
  );

  const createGroup = async () => {
    if (!name.trim() || !username.trim() || !password) {
      setStatus('All three fields are required');
      return;
    }
    setCreating(true);
    try {
      await api.post(endpoints.groups, {
        name: name.trim(), groupUsername: username.trim(), groupPassword: password,
      });
      setName(''); setUsername(''); setPassword('');
      setStatus('✓ Group created');
      await load();
      onChanged();
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : 'Failed');
    } finally {
      setCreating(false);
    }
  };

  /** assignCompany(): an empty groupId detaches the company. */
  const assignCompany = async (companyId: string, groupId: string) => {
    try {
      await api.put(endpoints.clientGroup(companyId), { groupId });
      await load();
      onChanged();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const deleteGroup = (g: ClientGroup) => {
    Alert.alert('Delete group', `Delete the group "${g.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.group(g.id));
            await load();
            onChanged();
            showToast('Group deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} title="👥 Client Groups" onClose={onClose}>
      <Text style={styles.intro}>
        A group gives one portal login access to several companies.
      </Text>

      <Field label="Group name">
        <Input value={name} onChangeText={setName} placeholder="e.g. Sharma Group" />
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Login username"><Input value={username} onChangeText={setUsername} placeholder="username" /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Password"><Input value={password} onChangeText={setPassword} placeholder="password" /></Field>
        </View>
      </View>
      <Button title="Create group" onPress={createGroup} loading={creating} variant="outline" />
      {!!status && (
        <Text style={[styles.status, status.startsWith('✓') && { color: colors.green }]}>{status}</Text>
      )}

      <View style={styles.divider} />

      {loading && <Text style={styles.empty}>Loading…</Text>}
      {!loading && groups.length === 0 && <Text style={styles.empty}>No groups yet.</Text>}

      <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
        {groups.map((g) => {
          const members = g.companies || [];
          const memberIds = members.map((m) => m.id);
          const addable = sortedClients.filter((c) => !memberIds.includes(c.id));
          return (
            <View key={g.id} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupLogin}>login: {g.groupUsername || '—'}</Text>
                </View>
                <Pressable onPress={() => deleteGroup(g)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              </View>
              <Text style={styles.count}>
                {members.length} compan{members.length === 1 ? 'y' : 'ies'}
              </Text>
              <View style={styles.chips}>
                {members.length === 0 && <Text style={styles.none}>none yet</Text>}
                {members.map((m) => (
                  <View key={m.id} style={styles.chip}>
                    <Text style={styles.chipText}>{m.name}</Text>
                    <Pressable onPress={() => assignCompany(m.id, '')} accessibilityRole="button" hitSlop={8}>
                      <Text style={styles.chipX}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Select
                value=""
                placeholder="+ Add a company…"
                options={addable.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(v) => { if (v) void assignCompany(v, g.id); }}
                searchable
              />
            </View>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { ...font.small, color: colors.muted, marginBottom: spacing.lg, lineHeight: 18 },
  pair: { flexDirection: 'row', gap: spacing.md },
  status: { ...font.small, color: colors.red, marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  group: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupName: { ...font.h3, color: colors.text },
  groupLogin: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 1 },
  delete: { ...font.small, color: colors.red },
  count: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 4, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2e8',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  chipText: { ...font.tiny, color: colors.text, fontWeight: '600' },
  chipX: { color: colors.red, fontWeight: '800', fontSize: 13 },
  none: { ...font.tiny, color: colors.muted, fontWeight: '500' },
});
