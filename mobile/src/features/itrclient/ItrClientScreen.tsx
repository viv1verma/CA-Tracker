import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Input } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';
import {
  ITR_STAGES, commentTag, isOwnComment, partySubtitle, stageIndex,
  type ItrComment, type ItrParty,
} from './logic';

/**
 * pg-itrclient — the ITR party's own filing portal: the identity line, a
 * read-only five-stage tracker, and the comment thread with the firm.
 *
 * The stage tracker is deliberately read-only: PUT /itr/parties/:id/stage
 * allows only an ITR admin, the assigned member or the reporting person, never
 * the party itself, and the web offers the party no control either.
 */
export default function ItrClientScreen() {
  const { showToast } = useToast();
  const [party, setParty] = useState<ItrParty | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async (o?: { refresh?: boolean }) => {
    if (o?.refresh) setRefreshing(true); else setState('loading');
    try {
      setParty(await api.get<ItrParty>(endpoints.itrMe));
      setState('idle');
    } catch (e) {
      setState('error');
      if (o?.refresh) showToast(e instanceof ApiError ? e.message : 'Could not load', 'error');
    } finally {
      setRefreshing(false);
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) { showToast('Type a comment', 'error'); return; }
    if (!party) return;
    setSending(true);
    try {
      const c = await api.post<ItrComment>(endpoints.itrComments(party.id), { text: body });
      // The web appends into `itrParties`, which a client login never loads, so
      // its thread only updates after a reload. Appending to the party we hold
      // gives the same intended result without the stale-state bug.
      setParty((p) => (p ? { ...p, comments: [...(p.comments || []), c] } : p));
      setText('');
      showToast('Comment added ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  if (state === 'loading') return <Loading label="Loading your filing…" />;
  if (state === 'error' || !party) {
    return <Text style={styles.error}>Could not load your filing.</Text>;
  }

  const idx = stageIndex(party.stage);
  const comments = party.comments || [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />}>

      <Text style={styles.subtitle}>{partySubtitle(party)}</Text>

      {/* Filing Status — the five-step tracker */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Filing Status</Text>
        <View style={styles.steps}>
          {ITR_STAGES.map((s, i) => {
            const done = i <= idx;
            return (
              <React.Fragment key={s}>
                {i > 0 && <View style={styles.connector} />}
                <View style={styles.step}>
                  <View style={[styles.dot, { backgroundColor: done ? '#1e3a8a' : '#e5e7eb' }]}>
                    <Text style={[styles.dotText, { color: done ? colors.white : '#9ca3af' }]}>
                      {i < idx ? '✓' : i + 1}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, { color: done ? '#1e3a8a' : '#9ca3af' }]}
                    numberOfLines={2}>
                    {s}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* Comments & Updates */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💬 Comments & Updates</Text>
        {!comments.length ? (
          <Text style={styles.empty}>No comments yet.</Text>
        ) : (
          <View style={{ marginBottom: spacing.sm }}>
            {comments.map((m, i) => {
              const own = isOwnComment(m);
              return (
                <View key={m.id || i}
                  style={[styles.bubbleRow, !own && { justifyContent: 'flex-end' }]}>
                  <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleFirm]}>
                    <Text style={[styles.who, own && { color: '#c2410c' }]}>
                      {m.authorName || '—'} · {commentTag(m)}
                    </Text>
                    <Text style={styles.text}>{m.text}</Text>
                    <Text style={styles.time}>{fmtDT(m.date)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Input value={text} onChangeText={setText} multiline
          placeholder="Ask a question or send an update…" />
        <View style={{ marginTop: spacing.sm }}>
          <Button title="💬 Send" onPress={send} loading={sending} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  subtitle: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  cardTitle: {
    ...font.small, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', marginBottom: spacing.md,
  },

  steps: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center' },
  connector: { width: 12, height: 2, backgroundColor: '#e5e7eb', marginTop: 13 },
  dot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dotText: { ...font.small, fontWeight: '800' },
  stepLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },

  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.md },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubble: { maxWidth: '85%', borderRadius: radius.md, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleOwn: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  bubbleFirm: { backgroundColor: '#f3f4f6', borderColor: colors.border },
  who: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: 2 },
  text: { ...font.small, fontWeight: '500', color: colors.text, lineHeight: 19 },
  time: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 3 },

  error: { ...font.small, color: colors.red, textAlign: 'center', padding: spacing.xl },
});
