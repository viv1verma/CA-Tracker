import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/ui';
import { moduleById, type ModuleId } from '../navigation/modules';
import { colors, font, spacing } from '../theme/theme';

/**
 * Phase A shell. Navigation, gating and routing are real; the module's own
 * screens arrive in Phase B and replace this component one module at a time.
 */
export default function ModuleScreen({ moduleId }: { moduleId: ModuleId }) {
  const { user } = useAuth();
  const mod = moduleById(moduleId);
  if (!mod) return null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.head}>
          <Text style={styles.icon}>{mod.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{mod.title}</Text>
            <Text style={styles.web}>Reproduces {mod.webPage}</Text>
          </View>
        </View>
        <Text style={styles.note}>
          Navigation, role gating and the API client are in place. This module's screens are
          built in Phase B against the existing GARP endpoints — no new business logic.
        </Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.cardTitle}>Access</Text>
        <Row k="Signed in as" v={user?.name?.replace('[TEST] ', '') ?? '—'} />
        <Row k="Role" v={user?.role ?? '—'} />
        {!!user?.designation && <Row k="Designation" v={user.designation} />}
        {!!user?.branch && <Row k="Branch" v={user.branch} />}
        <Row k="Reached via" v="role-gated navigation" />
      </Card>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  icon: { fontSize: 26 },
  title: { ...font.h2, color: colors.text },
  web: { ...font.small, color: colors.muted, marginTop: 2 },
  note: { ...font.small, color: colors.muted, lineHeight: 19 },
  cardTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rowKey: { flex: 1, ...font.small, color: colors.muted },
  rowVal: { ...font.small, color: colors.text, fontWeight: '700' },
});
