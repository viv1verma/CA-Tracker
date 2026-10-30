import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useData } from '../data/DataContext';
import { badgeText } from '../features/notifications/logic';
import { Button, Card } from '../components/ui';
import { API_BASE_URL } from '../config/env';
import { visibleModules, type ModuleDef, type ModuleId } from '../navigation/modules';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Every module this identity may reach, grouped the way the web drawer groups them.
 * Modules the user has no access to are absent — not greyed out.
 */
/** The firm's branches, as the web switcher always offers them. */
const BRANCH_OPTIONS = [
  { value: 'all', label: 'All branches' },
  { value: 'Greater Noida (HO)', label: 'Greater Noida (HO)' },
  { value: 'Pune (BO)', label: 'Pune (BO)' },
];

export default function MenuScreen({ onOpen }: { onOpen: (id: ModuleId, title: string) => void }) {
  const { user, signOut, branch, canSwitchBranch, setBranch } = useAuth();
  const { unreadNotifications } = useData();

  const groups = useMemo(() => {
    const list = visibleModules(user, branch);
    const order: ModuleDef['group'][] = ['Portal', 'Work', 'People', 'Finance', 'Firm', 'Account'];
    return order
      .map((g) => ({ group: g, items: list.filter((m) => m.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [user, branch]);

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={styles.who}>{user?.name?.replace('[TEST] ', '') ?? ''}</Text>
        <Text style={styles.note}>
          {[user?.designation, user?.role === 'admin' ? 'Administrator' : null, branch === 'all' ? 'All branches' : branch]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {canSwitchBranch && (
          <View style={styles.branchRow}>
            {BRANCH_OPTIONS.map((b) => {
              const on = branch === b.value;
              return (
                <Pressable
                  key={b.value}
                  onPress={() => setBranch(b.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{b.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {groups.map(({ group, items }) => (
        <View key={group} style={{ marginBottom: spacing.md }}>
          <Text style={styles.groupLabel}>{group}</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {items.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => onOpen(m.id, m.title)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && { backgroundColor: colors.primaryLight },
                ]}
              >
                <Text style={styles.rowIcon}>{m.icon}</Text>
                <Text style={styles.rowLabel}>{m.title}</Text>
                {/* The web's bell badge: the unread count, capped at 9+. */}
                {m.id === 'notifications' && !!badgeText(unreadNotifications) && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeText(unreadNotifications)}</Text>
                  </View>
                )}
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <Card style={{ marginTop: spacing.xs }}>
        <Text style={styles.cardTitle}>Connection</Text>
        <Text style={styles.note}>{API_BASE_URL}</Text>
        <Text style={[styles.note, { marginTop: 4 }]}>
          The server signs you out after 5 minutes of inactivity, and only one device may be
          signed in per account.
        </Text>
      </Card>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Sign out" onPress={confirmSignOut} variant="danger" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  groupLabel: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: spacing.xs, marginLeft: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13, paddingHorizontal: spacing.lg, minHeight: 48 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowIcon: { fontSize: 17, width: 24, textAlign: 'center' },
  rowLabel: { flex: 1, ...font.body, color: colors.text, fontWeight: '600' },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.red,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { ...font.tiny, color: colors.white, fontWeight: '800' },
  chev: { color: colors.muted, fontSize: 18 },
  who: { ...font.h3, color: colors.text },
  branchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  chip: {
    paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...font.tiny, color: colors.muted, fontWeight: '700' },
  chipTextOn: { color: colors.white },
  cardTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  note: { ...font.small, color: colors.muted, lineHeight: 18 },
});
