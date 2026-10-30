import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Sheet } from '../../components/form';
import { Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDate } from './logic';

interface ThreadMessage {
  id: string;
  fromName?: string;
  fromEmail?: string;
  date?: string;
  snippet?: string;
  body?: string;
  outgoing?: boolean;
  attachments?: { filename?: string }[];
}

/**
 * mailOpenThread(). Read-only: the full conversation, newest last. There is no
 * reply control anywhere, because the server holds read scopes only.
 */
export default function MailThreadSheet({
  threadId, account, visible, onClose,
}: {
  threadId: string | null;
  account: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setMessages(null);
    try {
      const r = await api.get<{ subject?: string; messages?: ThreadMessage[] }>(
        `${endpoints.gmailThread(id)}?account=${account}`, { timeoutMs: 60000 },
      );
      setSubject(r.subject || '');
      setMessages(r.messages || []);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not open the conversation', 'error');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [account, showToast]);

  useEffect(() => {
    if (visible && threadId) void load(threadId);
  }, [visible, threadId, load]);

  return (
    <Sheet visible={visible} title={subject || 'Conversation'} onClose={onClose}>
      <Text style={styles.readOnly}>
        Read-only — GARP Tracker can never send, delete or change your mail.
      </Text>

      {loading && <Loading label="Reading…" />}

      {!loading && messages?.length === 0 && (
        <Text style={styles.empty}>Nothing to show.</Text>
      )}

      {!loading && !!messages?.length && (
        <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
          {messages.map((m, i) => (
            <View key={m.id || i} style={[styles.msg, m.outgoing && styles.msgOut]}>
              <View style={styles.msgHead}>
                <Text style={styles.from} numberOfLines={1}>
                  {m.fromName || m.fromEmail || '—'}
                </Text>
                <Text style={styles.date}>{fmtDate(m.date?.slice(0, 10))}</Text>
              </View>
              {!!m.fromEmail && <Text style={styles.email}>{m.fromEmail}</Text>}
              <Text style={styles.body}>{m.body || m.snippet || ''}</Text>
              {!!m.attachments?.length && (
                <Text style={styles.attach}>
                  📎 {m.attachments.map((a) => a.filename || 'attachment').join(', ')}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

/** mailOpenSender() — every conversation with one address. */
export function MailSenderSheet({
  email, account, visible, onClose, onOpenThread,
}: {
  email: string | null;
  account: string;
  visible: boolean;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<{ threadId: string; subject: string; date?: string; snippet?: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !email) return;
    setLoading(true);
    setRows(null);
    api.get<{ rows?: { threadId: string; subject: string; date?: string; snippet?: string }[] }>(
      `${endpoints.gmailSender}?account=${account}&email=${encodeURIComponent(email)}`,
      { timeoutMs: 60000 },
    )
      .then((r) => setRows(r.rows || []))
      .catch((e) => {
        showToast(e instanceof ApiError ? e.message : 'Could not load', 'error');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [visible, email, account, showToast]);

  return (
    <Sheet visible={visible} title={email || 'Sender'} onClose={onClose}>
      {loading && <Loading label="Reading…" />}
      {!loading && rows?.length === 0 && <Text style={styles.empty}>No conversations found.</Text>}
      {!loading && !!rows?.length && (
        <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
          {rows.map((r) => (
            <Pressable
              key={r.threadId}
              onPress={() => { onClose(); onOpenThread(r.threadId); }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.senderRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.senderSubject} numberOfLines={2}>{r.subject}</Text>
              <Text style={styles.senderMeta}>{fmtDate(r.date?.slice(0, 10))}</Text>
              {!!r.snippet && <Text style={styles.senderSnippet} numberOfLines={2}>{r.snippet}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  readOnly: { ...font.tiny, color: colors.muted, fontWeight: '600', marginBottom: spacing.md, lineHeight: 16 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  msg: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.white,
  },
  msgOut: { backgroundColor: '#f8fafc' },
  msgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  from: { flex: 1, ...font.small, color: colors.text },
  date: { ...font.tiny, color: colors.muted, fontWeight: '500' },
  email: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 1 },
  body: { ...font.small, color: colors.text, fontWeight: '500', lineHeight: 19, marginTop: spacing.sm },
  attach: { ...font.tiny, color: colors.primary, fontWeight: '600', marginTop: 6 },
  senderRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', minHeight: 48 },
  senderSubject: { ...font.small, color: colors.text },
  senderMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  senderSnippet: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3, lineHeight: 15 },
});
