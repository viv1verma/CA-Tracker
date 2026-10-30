import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import AccountTab from './AccountTab';
import DoaTab from './DoaTab';
import OfficeTab from './OfficeTab';
import RulesTab from './RulesTab';
import { visibleSettingsTabs, type SettingsTab } from './logic';

/**
 * pg-password — "Settings". Four tabs; Office and Delegation of Authority are
 * admin-only, matching initSettingsPage()'s tab hiding and the server's
 * adminOnly guards. setSettingsTab('account') is the landing tab for everyone.
 *
 * Nothing is written when the page or any tab opens — each tab issues GETs only.
 */
export default function SettingsScreen() {
  const { user } = useAuth();
  const tabs = visibleSettingsTabs(user);
  const [tab, setTab] = useState<SettingsTab>('account');
  const isAdmin = user?.role === 'admin';

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}
        contentContainerStyle={{ gap: 3 }}>
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="button"
              style={[styles.tab, on && { backgroundColor: colors.primary }]}>
              <Text style={[styles.tabText, on && { color: colors.white, fontWeight: '800' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'account' && <AccountTab />}
      {tab === 'rules' && <RulesTab isAdmin={!!isAdmin} />}
      {tab === 'office' && isAdmin && <OfficeTab />}
      {tab === 'doa' && isAdmin && <DoaTab />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    backgroundColor: '#f3f4f6', borderRadius: radius.md, padding: 3, marginBottom: spacing.md,
  },
  tab: {
    height: 36, paddingHorizontal: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  tabText: { ...font.small, fontWeight: '700', color: colors.muted },
});
