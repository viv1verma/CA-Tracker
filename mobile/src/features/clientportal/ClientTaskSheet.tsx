import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Input, Sheet } from '../../components/form';
import { Button, ProgressBar } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';
import { commentAuthor, fmtCli, periodLabel, sbg, type ClientTask } from './logic';

/**
 * openClientTask() + renderClientThread() + postClientComment(): the task detail,
 * the team's remark history, and the two-way comment thread.
 *
 * A client can only read and comment here — there is no status, progress or date
 * control, matching the web and the server, which lets a client write nothing but
 * a comment on a task belonging to them.
 */
export default function ClientTaskSheet({
  task, visible, onClose, onPosted,
}: {
  task: ClientTask | null;
  visible: boolean;
  onClose: () => void;
  onPosted: (taskId: string, comment: NonNullable<ClientTask['comments']>[number]) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [isReminder, setIsReminder] = useState(false);
  const [sending, setSending] = useState(false);

  if (!task) return null;
  const t = task;
  const [bg, fg] = sbg(t.status);

  const post = async () => {
    const body = text.trim();
    if (!body) { showToast('Type a message first', 'error'); return; }
    setSending(true);
    try {
      const c = await api.post<{ authorName: string; role: string; text: string; date: string }>(
        endpoints.assignmentComments(t.id), { text: body, isReminder },
      );
      onPosted(t.id, { author: c.authorName, role: c.role, text: c.text, date: c.date });
      setText(''); setIsReminder(false);
      showToast(isReminder ? 'Reminder sent ✓' : 'Comment sent ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  const comments = t.comments || [];

  return (
    <Sheet
      visible={visible}
      title={t.workType}
      onClose={onClose}
      footer={
        <View>
          <Input value={text} onChangeText={setText} multiline placeholder="Write a message…" />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isReminder }}
            onPress={() => setIsReminder((v) => !v)} style={styles.checkRow}>
            <Text style={styles.checkBox}>{isReminder ? '☑' : '☐'}</Text>
            <Text style={styles.checkLabel}>Send as a reminder ⏰</Text>
          </Pressable>
          <Button title="Send" onPress={post} loading={sending} />
        </View>
      }
    >
      <View style={styles.pills}>
        <View style={[styles.pill, { backgroundColor: bg }]}>
          <Text style={[styles.pillText, { color: fg }]}>{t.status}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: '#f3f4f6' }]}>
          <Text style={[styles.pillText, { color: colors.text }]}>{t.completionPct || 0}% done</Text>
        </View>
      </View>
      <View style={{ marginBottom: spacing.md }}>
        <ProgressBar pct={t.completionPct || 0} />
      </View>

      {!!t.companyName && !!user?.isGroup && (
        <Text style={styles.meta}>🏢 Company: <Text style={styles.metaB}>{t.companyName}</Text></Text>
      )}
      {!!t.period && (
        <Text style={styles.meta}>🗓 Period: <Text style={styles.metaB}>{periodLabel(t.period)}</Text></Text>
      )}
      <Text style={styles.meta}>👤 Handled by: <Text style={styles.metaB}>{t.memberName || '—'}</Text></Text>
      {!!t.reportingPersonName && t.reportingPersonName !== '—' && (
        <Text style={styles.meta}>
          🧑‍💼 Reporting: <Text style={styles.metaB}>{t.reportingPersonName}</Text>
        </Text>
      )}
      <Text style={styles.meta}>📅 Due: <Text style={styles.metaB}>{fmtCli(t.dueDate)}</Text></Text>
      {t.status === 'Completed' && !!t.completedAt && (
        <Text style={styles.meta}>
          ✅ Completed on: <Text style={[styles.metaB, { color: colors.green }]}>{fmtCli(t.completedAt)}</Text>
        </Text>
      )}

      {/* Team Remarks — newest first, as the web reverses the history */}
      {t.remarkHistory?.length ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionTitle}>📝 Team Remarks</Text>
          {[...t.remarkHistory].reverse().map((r, i) => (
            <View key={i} style={styles.remark}>
              <Text style={styles.remarkText}>{r.remark}</Text>
              <Text style={styles.remarkMeta}>
                {r.by}{r.status ? ` · ${r.status}` : ''}
                {r.completionPct != null ? ` · ${r.completionPct}%` : ''} · {fmtDT(r.date)}
              </Text>
            </View>
          ))}
        </View>
      ) : t.remark ? (
        <View style={[styles.remark, { marginTop: spacing.sm }]}>
          <Text style={styles.remarkText}>📝 {t.remark}</Text>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Conversation</Text>
      {!comments.length ? (
        <Text style={styles.empty}>No comments yet. Start the conversation below.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
          {comments.map((m, i) => {
            const mine = m.role === 'client';
            return (
              <View key={i} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
                <View style={[styles.bubble, { backgroundColor: mine ? '#eff6ff' : '#f3f4f6' }]}>
                  <Text style={[styles.bubbleWho, mine && { color: colors.primary }]}>
                    {commentAuthor(m)}{m.isReminder ? ' ⏰' : ''}
                  </Text>
                  <Text style={styles.bubbleText}>{m.text}</Text>
                  <Text style={styles.bubbleTime}>{fmtDT(m.date)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { ...font.small, fontWeight: '800' },

  meta: { ...font.small, fontWeight: '500', color: colors.text, lineHeight: 22 },
  metaB: { fontWeight: '800' },

  sectionTitle: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: 6 },
  remark: { backgroundColor: '#f9fafb', borderRadius: radius.sm, padding: 10, marginBottom: 6 },
  remarkText: { ...font.small, fontWeight: '500', color: colors.text },
  remarkMeta: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 3 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.md },

  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubble: { maxWidth: '80%', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleWho: { ...font.tiny, fontWeight: '800', color: colors.text, marginBottom: 2 },
  bubbleText: { ...font.small, fontWeight: '500', color: colors.text, lineHeight: 19 },
  bubbleTime: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 3 },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.small, fontWeight: '600', color: colors.text },
});
