import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isItrAdmin } from '../../auth/permissions';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';
import { ITR_STAGES, isClientComment, stageColor, type ItrComment, type ItrParty } from './logic';

/**
 * openItrParty(). Details, client-notification settings, assignment, the stage
 * buttons, and the shared comment thread. Everything except stage and comments
 * is ITR-admin only, matching the server's `itrAdmin` middleware.
 */
export default function ItrPartySheet({
  party, visible, onClose, onChanged, onDeleted,
}: {
  party: ItrParty | null;
  visible: boolean;
  onClose: () => void;
  onChanged: (p: ItrParty) => void;
  onDeleted: (id: string) => void;
}) {
  const { user } = useAuth();
  const { users } = useData();
  const { showToast } = useToast();
  const canAssign = isItrAdmin(user);

  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [reportingTo, setReportingTo] = useState('');
  const [notify, setNotify] = useState(true);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [notifStatus, setNotifStatus] = useState('');

  const loadNotifStatus = useCallback(async () => {
    try {
      const s = await api.get<{ email: boolean; whatsapp: boolean }>(endpoints.itrNotifyStatus);
      setNotifStatus(
        `Channels: Email ${s.email ? 'on' : 'off'} · WhatsApp ${s.whatsapp ? 'on' : 'off'}`
        + (!s.email || !s.whatsapp ? ' — set credentials in the server environment to enable.' : ''),
      );
    } catch { setNotifStatus(''); }
  }, []);

  useEffect(() => {
    if (!visible || !party) return;
    setEmail(party.email || '');
    setMobile(party.mobile || '');
    setAssignedTo(party.assignedTo || '');
    setReportingTo(party.reportingTo || '');
    setNotify(party.notify !== false);
    setComment('');
    if (canAssign) void loadNotifStatus();
  }, [visible, party?.id, canAssign, loadNotifStatus]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!party) return null;

  const teamOptions = [
    { value: '', label: '— select —' },
    ...users.map((u) => ({ value: u.id, label: u.name, sub: u.designation })),
  ];

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not save', 'error'); }
    finally { setBusy(''); }
  };

  const saveContact = () => run('contact', async () => {
    const u = await api.put<ItrParty>(endpoints.itrNotify(party.id), { email, mobile, notify });
    onChanged(u);
    showToast('Saved');
  });

  const toggleNotify = () => run('notify', async () => {
    const next = !notify;
    setNotify(next);
    const u = await api.put<ItrParty>(endpoints.itrNotify(party.id), { email, mobile, notify: next });
    onChanged(u);
  });

  const sendTest = () => run('test', async () => {
    await api.post(endpoints.itrNotifyTest(party.id), {});
    showToast('Test notification sent');
  });

  const saveAssign = () => run('assign', async () => {
    const u = await api.put<ItrParty>(endpoints.itrAssign(party.id), { assignedTo, reportingTo });
    onChanged(u);
    showToast('Saved');
  });

  const setStage = (stage: string) => run(`stage-${stage}`, async () => {
    const u = await api.put<ItrParty>(endpoints.itrStage(party.id), { stage });
    onChanged(u);
    showToast(`Stage: ${stage}`);
  });

  const addComment = () => {
    const text = comment.trim();
    if (!text) { showToast('Type a comment', 'error'); return; }
    void run('comment', async () => {
      const c = await api.post<ItrComment>(endpoints.itrComments(party.id), { text });
      onChanged({ ...party, comments: [...(party.comments || []), c] });
      setComment('');
      showToast('Comment added ✓');
    });
  };

  const remove = () => {
    Alert.alert(
      'Delete ITR record',
      `Delete ITR record for ${party.name || party.pan}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void run('delete', async () => {
            await api.del(endpoints.itrParty(party.id));
            onDeleted(party.id);
            onClose();
            showToast('Deleted');
          }),
        },
      ],
    );
  };

  const [bg, fg] = stageColor(party.stage);

  return (
    <Sheet visible={visible} title="🧾 ITR Filing Details" onClose={onClose}>
      {/* Header */}
      <View style={styles.head}>
        <Text style={styles.name}>{party.name || '—'}</Text>
        <Text style={styles.meta}>
          PAN: <Text style={styles.mono}>{party.pan}</Text> · AY {party.ay || '—'} · {party.type || '—'}
        </Text>
        <Text style={styles.meta}>
          {party.email || 'no email'}{party.mobile ? ` · ${party.mobile}` : ' · no mobile'}
        </Text>
      </View>

      {/* Client notifications — ITR admin only */}
      {canAssign && (
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>🔔 Client Notifications</Text>
            <Pressable onPress={toggleNotify} accessibilityRole="checkbox"
              accessibilityState={{ checked: notify }} style={styles.toggle}>
              <View style={[styles.box, notify && styles.boxOn]}>
                {notify && <Text style={styles.tick}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Auto-notify on stage change</Text>
            </Pressable>
          </View>
          <Field label="Email"><Input value={email} onChangeText={setEmail} placeholder="Email" /></Field>
          <Field label="Mobile (WhatsApp)">
            <Input value={mobile} onChangeText={setMobile} placeholder="Mobile" keyboardType="numeric" />
          </Field>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Button title="Save" onPress={saveContact} loading={busy === 'contact'} variant="outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="📨 Send test" onPress={sendTest} loading={busy === 'test'} variant="outline" />
            </View>
          </View>
          {!!notifStatus && <Text style={styles.notifStatus}>{notifStatus}</Text>}
        </View>
      )}

      {/* Assignment */}
      {canAssign ? (
        <View style={styles.block}>
          <Field label="Assign To">
            <Select value={assignedTo} placeholder="— select —" options={teamOptions}
              onChange={setAssignedTo} searchable />
          </Field>
          <Field label="Reporting To">
            <Select value={reportingTo} placeholder="— select —" options={teamOptions}
              onChange={setReportingTo} searchable />
          </Field>
          <Button title="Save" onPress={saveAssign} loading={busy === 'assign'} />
        </View>
      ) : (
        <Text style={styles.assignRead}>
          <Text style={styles.b}>Assigned to:</Text> {party.assignedName || '—'} · {' '}
          <Text style={styles.b}>Reporting:</Text> {party.reportingName || '—'}
        </Text>
      )}

      {/* Stage — any team member on the filing may change it */}
      <Text style={styles.sectionLabel}>Stage</Text>
      <View style={styles.stages}>
        {ITR_STAGES.map((s) => {
          const on = party.stage === s;
          return (
            <Pressable
              key={s}
              onPress={() => setStage(s)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.stageBtn, on && styles.stageBtnOn, !!busy && { opacity: 0.6 }]}
            >
              <Text style={[styles.stageText, on && styles.stageTextOn]}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.currentPill, { backgroundColor: bg }]}>
        <Text style={[styles.currentText, { color: fg }]}>Current: {party.stage || 'Not Started'}</Text>
      </View>

      {/* Comments */}
      <Text style={styles.sectionLabel}>💬 Comments</Text>
      {(party.comments || []).length === 0 ? (
        <Text style={styles.noComments}>No comments yet.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
          {(party.comments || []).map((c, i) => {
            const fromClient = isClientComment(c);
            return (
              <View key={c.id || i} style={[styles.bubbleRow, { justifyContent: fromClient ? 'flex-start' : 'flex-end' }]}>
                <View style={[styles.bubble, fromClient ? styles.bubbleClient : styles.bubbleTeam]}>
                  <Text style={[styles.bubbleAuthor, fromClient && { color: '#c2410c' }]}>
                    {c.authorName || 'Unknown'}{fromClient ? ' · Client' : ' · Team'}
                  </Text>
                  <Text style={styles.bubbleText}>{c.text}</Text>
                  <Text style={styles.bubbleDate}>{fmtDT(c.date)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
      <Field label="Add a comment">
        <Input
          value={comment}
          onChangeText={setComment}
          placeholder="Visible to everyone on this filing…"
          multiline
        />
      </Field>
      <Button title="💬 Add Comment" onPress={addComment} loading={busy === 'comment'} />

      {canAssign && (
        <View style={{ marginTop: spacing.md }}>
          <Button title="🗑 Delete this ITR record" onPress={remove} loading={busy === 'delete'} variant="danger" />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  name: { ...font.h2, color: colors.text },
  meta: { ...font.small, color: colors.muted, fontWeight: '500', marginTop: 3 },
  mono: { fontWeight: '800', color: colors.text },
  block: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginBottom: spacing.md },
  blockHead: { marginBottom: spacing.sm },
  blockTitle: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, minHeight: 40 },
  toggleLabel: { ...font.small, color: colors.text },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  pair: { flexDirection: 'row', gap: spacing.sm },
  notifStatus: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.sm, lineHeight: 16 },
  assignRead: { ...font.small, color: colors.text, marginBottom: spacing.md },
  b: { fontWeight: '800' },
  sectionLabel: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  stages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stageBtn: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 7, minHeight: 36, justifyContent: 'center',
  },
  stageBtnOn: { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
  stageText: { ...font.tiny, fontWeight: '700', color: colors.text },
  stageTextOn: { color: colors.white },
  currentPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: spacing.sm },
  currentText: { fontSize: 10, fontWeight: '800' },
  noComments: { ...font.small, color: colors.muted, paddingVertical: spacing.sm },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubble: { maxWidth: '85%', borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleClient: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  bubbleTeam: { backgroundColor: '#f3f4f6', borderColor: colors.border },
  bubbleAuthor: { ...font.tiny, color: colors.text, marginBottom: 2 },
  bubbleText: { ...font.small, color: colors.text, fontWeight: '500', lineHeight: 18 },
  bubbleDate: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3 },
});
