import React, { useState } from 'react';
import {
  Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, EmptyState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Notification } from '../../data/types';
import type { ModuleId } from '../../navigation/modules';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';
import { opensAssignment, sortNotifications, targetModule } from './logic';

/**
 * The web's slide-over bell panel. On a phone it is a pushed screen instead of a
 * drawer, with the same header actions (Clear All) and the same row content:
 * who it came from, the task, the message and when.
 *
 * Nothing is written when the list is shown. Tapping a row marks it read and
 * routes to the page the notification belongs to, exactly as openNotif() does.
 */
export default function NotificationsScreen({
  onNavigate,
}: {
  onNavigate?: (id: ModuleId, title: string, assignmentId?: string) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    notifications, loading, refreshing, reload, markNotificationRead, clearNotifications,
  } = useData();
  const [clearing, setClearing] = useState(false);

  const rows = sortNotifications(notifications);

  const open = async (n: Notification) => {
    // markNotifRead(): the web ignores a failure here and routes anyway.
    try {
      await api.put(endpoints.notificationRead(n.id), {});
      markNotificationRead(n.id);
    } catch { /* routing matters more than the flag */ }

    const target = targetModule(n, user);
    onNavigate?.(target, moduleTitle(target),
      opensAssignment(n, target) ? n.assignmentId : undefined);
  };

  const clearAll = () => {
    Alert.alert('Clear all', 'Remove every notification from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            await api.del(endpoints.notificationsClear);
            clearNotifications();
            showToast('Cleared');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not clear', 'error');
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Loading notifications…" />;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void reload({ background: true })} />
      }
    >
      {!!rows.length && (
        <View style={styles.actions}>
          <Text style={styles.count}>
            {rows.filter((n) => !n.read).length} unread of {rows.length}
          </Text>
          <Button title="Clear All" onPress={clearAll} variant="outline" loading={clearing} />
        </View>
      )}

      {!rows.length ? (
        <EmptyState icon="🔔" title="No notifications" />
      ) : rows.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => void open(n)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.item, !n.read && styles.unread, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.from}>From: {n.fromName || '—'}</Text>
          {!!(n.clientName || n.workType) && (
            <Text style={styles.task}>📁 {n.clientName || '—'} — {n.workType || '—'}</Text>
          )}
          <Text style={styles.msg}>{n.message}</Text>
          <Text style={styles.time}>{fmtDT(n.createdAt)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The destination's title, so the pushed screen carries the right header. */
function moduleTitle(id: ModuleId): string {
  const map: Partial<Record<ModuleId, string>> = {
    assignments: 'Assignments', myassign: 'My Tasks',
    approvals: 'Approvals', clientportal: 'My Tasks',
  };
  return map[id] || 'GARP';
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  actions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, marginBottom: spacing.md,
  },
  count: { ...font.small, fontWeight: '700', color: colors.muted },

  item: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },
  // .notif-item.unread — the web marks it with a tinted ground and a left rule.
  unread: { backgroundColor: '#eff6ff', borderLeftWidth: 3, borderLeftColor: colors.primary },
  from: { ...font.tiny, fontWeight: '700', color: colors.muted },
  task: { ...font.small, fontWeight: '800', color: colors.text, marginTop: 2 },
  msg: { ...font.small, fontWeight: '500', color: colors.text, marginTop: 4 },
  time: { ...font.tiny, fontWeight: '500', color: '#94a3b8', marginTop: 4 },
});
