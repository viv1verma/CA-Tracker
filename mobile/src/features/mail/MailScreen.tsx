import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/permissions';
import { Select } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import MailThreadSheet, { MailSenderSheet } from './MailThreadSheet';
import {
  DEFAULT_QUERY, MAIL_CARDS, MAIL_LIMITS, MAIL_PRESETS, ageBuckets, cardCount,
  fmtDate, responseText, tone,
  type MailRow, type MailStatus, type MailSummary,
} from './logic';

/**
 * pg-mail — the office mailbox, read-only. Loading only reads: status, then
 * threads. Nothing here can send, delete or change mail; the two writes are
 * assigning an owner and drafting a task, both on GARP's own side.
 */
export default function MailScreen({ onDraftTask }: { onDraftTask: (d: TaskDraft) => void }) {
  const { user } = useAuth();
  const { users } = useData();
  const { showToast } = useToast();

  const [status, setStatus] = useState<MailStatus | null>(null);
  const [acct, setAcct] = useState('');
  const [rows, setRows] = useState<MailRow[]>([]);
  const [summary, setSummary] = useState<MailSummary | null>(null);
  const [mailbox, setMailbox] = useState('');
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [limit, setLimit] = useState('50');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);

  const admin = isAdmin(user);

  /** Step one: the mailbox status. A plain GET. */
  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get<MailStatus>(endpoints.gmailStatus);
      setStatus(s);
      setAcct((prev) => prev || (s.accounts?.[0]?.key ?? ''));
      return s;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not read mailbox status');
      return null;
    }
  }, []);

  /** Step two, only when that account is linked: the threads. Also a GET. */
  const loadThreads = useCallback(async (key: string, q: string, lim: string) => {
    setReading(true);
    setError('');
    try {
      const r = await api.get<{ rows?: MailRow[]; summary?: MailSummary; mailbox?: string }>(
        `${endpoints.gmailThreads}?account=${key}&limit=${lim}&q=${encodeURIComponent(q)}`,
        { timeoutMs: 120000 },
      );
      setRows(r.rows || []);
      setSummary(r.summary || null);
      setMailbox(r.mailbox || '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not read mail');
      setRows([]);
    } finally {
      setReading(false);
    }
  }, []);

  const account = useMemo(
    () => status?.accounts?.find((a) => a.key === acct) || null,
    [status, acct],
  );

  useEffect(() => {
    void (async () => {
      const s = await loadStatus();
      setLoading(false);
      const first = s?.accounts?.[0];
      if (first?.connected) await loadThreads(first.key, DEFAULT_QUERY, '50');
    })();
  }, [loadStatus, loadThreads]);

  const search = () => { if (account?.connected) void loadThreads(acct, query, limit); };

  const switchAccount = (key: string) => {
    setAcct(key);
    setFilter('');
    setRows([]);
    setSummary(null);
    const a = status?.accounts?.find((x) => x.key === key);
    if (a?.connected) void loadThreads(key, query, limit);
  };

  /**
   * connectMail(): the web opens Google in a pop-up because navigating the main
   * tab away trips the 5-minute idle logout. An auth session does the same job
   * natively, returning to the app when Google is done.
   */
  const connect = async () => {
    try {
      const r = await api.get<{ url: string }>(`${endpoints.gmailConnect}?account=${acct}`);
      await WebBrowser.openAuthSessionAsync(r.url);
      const s = await loadStatus();
      const a = s?.accounts?.find((x) => x.key === acct);
      if (a?.connected) await loadThreads(acct, query, limit);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not start Google sign-in', 'error');
    }
  };

  const setOwner = async (row: MailRow, userId: string) => {
    try {
      const r = await api.post<{ owner: { userId: string; name: string } | null }>(
        endpoints.gmailOwner, { threadId: row.threadId, userId, account: acct },
      );
      setRows((prev) => prev.map((x) => (x.threadId === row.threadId ? { ...x, owner: r.owner } : x)));
      showToast(r.owner ? `Assigned to ${r.owner.name}` : 'Unassigned');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not assign', 'error');
    }
  };

  /** mailToTask(): the server returns a draft; the assignment form opens on it. */
  const toTask = async (row: MailRow) => {
    try {
      const r = await api.post<{ draft: TaskDraft }>(endpoints.gmailToTask, row);
      onDraftTask(r.draft);
      showToast('Task drafted from mail — set the assignee and due date');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not convert', 'error');
    }
  };

  const shown = useMemo(
    () => (filter ? rows.filter((r) => r.replyState === filter) : rows),
    [rows, filter],
  );
  const ages = useMemo(() => ageBuckets(rows), [rows]);

  if (loading) return <Loading label="Reading mail…" />;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={reading} onRefresh={search}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sub}>
          Read-only. GARP Tracker can never send, delete or change your mail.
        </Text>

        {/* Mailbox tabs */}
        {!!status?.accounts?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {status.accounts.map((a) => {
              const on = a.key === acct;
              return (
                <Pressable key={a.key} onPress={() => switchAccount(a.key)}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[styles.tab, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>
                    {a.label}{a.connected ? '' : '  not linked'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Not connected */}
        {(!account || !account.connected) ? (
          <View style={styles.card}>
            <Text style={styles.notConnected}>
              {account ? `${account.label} not connected` : 'Mailbox not connected'}
            </Text>
            <Text style={styles.hint}>
              {status?.configured
                ? `Link ${account?.expected || ''}. Access is read-only — GARP Tracker can never send, delete or change your mail.`
                : (status?.setupHint || 'Google OAuth is not configured on the server.')}
            </Text>
            {admin && status?.configured && (
              <View style={{ marginTop: spacing.md }}>
                <Button title={`Connect ${account?.expected || ''}`} onPress={connect} />
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Query */}
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput value={query} onChangeText={setQuery}
                placeholder="Gmail search syntax" placeholderTextColor={colors.muted}
                style={styles.search} returnKeyType="search" onSubmitEditing={search} />
            </View>
            <View style={styles.row}>
              <View style={{ width: 110 }}>
                <Select value={limit} placeholder="Show"
                  options={MAIL_LIMITS.map((l) => ({ value: l, label: l }))}
                  onChange={(v) => { setLimit(v); if (account.connected) void loadThreads(acct, query, v); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={reading ? 'Reading…' : 'Search'} onPress={search} loading={reading} />
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
              {MAIL_PRESETS.map((p) => (
                <Pressable key={p.label}
                  onPress={() => { setQuery(p.q); setFilter(''); void loadThreads(acct, p.q, limit); }}
                  accessibilityRole="button" style={styles.preset}>
                  <Text style={styles.presetText}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.header}>
              {rows.length} conversation(s) · read-only{mailbox ? ` · ${mailbox}` : ''}
            </Text>

            {/* Ageing of the needs-reply pile */}
            {ages.total > 0 && (
              <View style={styles.ageRow}>
                {ages.month > 0 && <Age label={`${ages.month} over a month`} bg="#7f1d1d" fg="#fff" />}
                {ages.week > 0 && <Age label={`${ages.week} over a week`} bg="#fef2f2" fg="#b91c1c" />}
                {ages.few > 0 && <Age label={`${ages.few} 3–6 days`} bg="#fffbeb" fg="#92400e" />}
                {ages.fresh > 0 && <Age label={`${ages.fresh} under 3 days`} bg="#f8fafc" fg="#64748b" />}
              </View>
            )}

            {/* The four states, each a filter */}
            <View style={styles.cards}>
              {MAIL_CARDS.map((c) => {
                const t = tone(c.tone);
                const on = filter === c.key;
                return (
                  <Pressable key={c.key}
                    onPress={() => setFilter(on ? '' : c.key)}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={[styles.stateCard, { backgroundColor: t.bg },
                      on && { borderWidth: 2.5, borderColor: t.col }]}>
                    <Text style={[styles.stateNum, { color: t.col }]}>{cardCount(summary, c.key)}</Text>
                    <Text style={[styles.stateTitle, { color: t.col }]}>{c.title}</Text>
                    <Text style={styles.stateSub}>{c.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!!filter && (
              <Text style={styles.filtered}>Filtered — tap the card again to show all</Text>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}

            {shown.length === 0 ? (
              <View style={styles.card}><Text style={styles.empty}>Nothing here.</Text></View>
            ) : shown.map((m) => {
              const t = tone(m.replyTone);
              return (
                <View key={m.id} style={[styles.mailCard, m.replyState === 'needs_reply' && styles.urgent]}>
                  <View style={styles.mailTop}>
                    <View style={[styles.pill, { backgroundColor: t.bg }]}>
                      <Text style={[styles.pillText, { color: t.col }]}>{m.replyLabel || ''}</Text>
                    </View>
                    <Text style={styles.when}>
                      {fmtDate(m.date?.slice(0, 10))} · {m.daysAgo}d ago
                    </Text>
                  </View>
                  {!!m.waitingDays && (
                    <Text style={[styles.waiting, { color: t.col }]}>{m.waitingDays}d waiting</Text>
                  )}
                  {m.responseHours != null && (
                    <Text style={styles.responded}>{responseText(m.responseHours)}</Text>
                  )}

                  <Pressable onPress={() => setThreadId(m.threadId)} accessibilityRole="button">
                    <Text style={[styles.subject, m.unread && styles.unread]} numberOfLines={2}>
                      {m.subject}
                      {m.msgCount > 1 ? `  ↳ ${m.msgCount} messages` : ''}
                    </Text>
                  </Pressable>
                  <Text style={styles.snippet} numberOfLines={2}>{m.snippet}</Text>

                  <View style={styles.fromRow}>
                    <Text style={[styles.fromName, m.unread && styles.unread]} numberOfLines={1}>
                      {m.fromName}{m.internal ? '  TEAM' : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSenderEmail(m.fromEmail)} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.fromEmail} numberOfLines={1}>{m.fromEmail}</Text>
                  </Pressable>

                  {!!m.client?.name && <Text style={styles.client}>Client: {m.client.name}</Text>}

                  <View style={styles.ownerRow}>
                    <View style={{ flex: 1 }}>
                      <Select
                        value={m.owner?.userId || ''}
                        placeholder="Unassigned"
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...users.map((u) => ({ value: u.id, label: u.name })),
                        ]}
                        onChange={(v) => void setOwner(m, v)}
                        searchable
                      />
                    </View>
                    <Pressable onPress={() => void toTask(m)} accessibilityRole="button"
                      style={({ pressed }) => [styles.taskBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={styles.taskBtnText}>→ Task</Text>
                    </Pressable>
                  </View>
                  {m.owner?.auto && <Text style={styles.autoOwner}>auto · client rule</Text>}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <MailThreadSheet
        threadId={threadId}
        account={acct}
        visible={!!threadId}
        onClose={() => setThreadId(null)}
      />
      <MailSenderSheet
        email={senderEmail}
        account={acct}
        visible={!!senderEmail}
        onClose={() => setSenderEmail(null)}
        onOpenThread={(id) => setThreadId(id)}
      />
    </View>
  );
}

export interface TaskDraft {
  title?: string;
  clientId?: string | null;
  clientName?: string;
  description?: string;
  source?: string;
  assignmentType?: string;
}

function Age({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.age, { backgroundColor: bg }]}>
      <Text style={[styles.ageText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md, lineHeight: 18 },
  tabs: { gap: 6, paddingVertical: 3, marginBottom: spacing.md },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.white, minHeight: 38, justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...font.small, color: colors.text },
  tabTextOn: { color: colors.white },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  notConnected: { ...font.h3, color: colors.text, textAlign: 'center', marginBottom: 6 },
  hint: { ...font.tiny, color: colors.muted, fontWeight: '500', textAlign: 'center', lineHeight: 17 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 13, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  presets: { gap: 6, paddingVertical: spacing.sm },
  preset: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7, minHeight: 34, justifyContent: 'center',
  },
  presetText: { ...font.tiny, fontWeight: '700', color: colors.text },
  header: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginVertical: spacing.sm },
  ageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  age: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  ageText: { fontSize: 10, fontWeight: '800' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateCard: {
    flexGrow: 1, minWidth: '46%', borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  stateNum: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  stateTitle: { ...font.small, marginTop: 3 },
  stateSub: { fontSize: 9, color: colors.muted, fontWeight: '600' },
  filtered: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 6 },
  error: { ...font.small, color: colors.red, textAlign: 'center', paddingVertical: spacing.md },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  mailCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginTop: spacing.sm,
  },
  urgent: { backgroundColor: '#fffbfb' },
  mailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  pillText: { fontSize: 9, fontWeight: '800' },
  when: { ...font.tiny, color: colors.muted, fontWeight: '600' },
  waiting: { fontSize: 9, fontWeight: '800', marginTop: 3 },
  responded: { fontSize: 9, color: colors.muted, fontWeight: '600', marginTop: 2 },
  subject: { ...font.small, color: colors.text, fontWeight: '600', marginTop: spacing.sm, lineHeight: 18 },
  unread: { fontWeight: '800' },
  snippet: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3, lineHeight: 15 },
  fromRow: { marginTop: spacing.sm },
  fromName: { ...font.small, color: colors.text, fontWeight: '600' },
  fromEmail: { ...font.tiny, color: colors.primary, fontWeight: '500', textDecorationLine: 'underline' },
  client: { ...font.tiny, color: colors.muted, fontWeight: '600', marginTop: 3 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  taskBtn: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, minHeight: 40, justifyContent: 'center',
  },
  taskBtnText: { ...font.tiny, fontWeight: '700', color: colors.text },
  autoOwner: { fontSize: 8, color: '#1d4ed8', fontWeight: '700', marginTop: 2 },
});
