import React, { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { canSubAssign } from '../../auth/permissions';
import { Field, Input, Sheet } from '../../components/form';
import { Button, Card, ProgressBar, StatusPill } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment, TaskComment } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import ProgressSheet from './ProgressSheet';
import ReminderSheet from './ReminderSheet';
import SubAssignSheet from './SubAssignSheet';
import {
  canApproveCompletion, canComment, canEditAssignment, canRemind, daysOld,
  fmt, fmtAny, fmtDT, isOD, isOwnTask, sbg,
} from './logic';

/** openAssignDetail() and every action its sheet exposes. */
export default function AssignmentDetailScreen({
  assignmentId, onEdit, onDeleted, onBack,
}: {
  assignmentId: string;
  onEdit: (id: string) => void;
  onDeleted: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { assignments, clientsById, upsertAssignment, removeAssignments } = useData();
  const { showToast } = useToast();

  const a = assignments.find((x) => x.id === assignmentId);

  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showRemind, setShowRemind] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackNote, setSendBackNote] = useState('');

  const client = a ? clientsById[a.clientId] : undefined;
  const mine = isOwnTask(a as Assignment, user);
  const comments: TaskComment[] = useMemo(() => a?.comments || [], [a]);
  const log = useMemo(() => (a?.activityLog || []).slice(-5).reverse(), [a]);

  if (!a) {
    return (
      <View style={styles.gone}>
        <Text style={styles.goneText}>This assignment is no longer available.</Text>
        <View style={{ marginTop: spacing.lg, minWidth: 160 }}>
          <Button title="Go back" onPress={onBack} variant="outline" />
        </View>
      </View>
    );
  }

  const od = isOD(a);
  const [bg, fg] = sbg(a.status);
  const pct = a.completionPct || 0;

  const postComment = async () => {
    const text = comment.trim();
    if (!text) { showToast('Type a remark first', 'error'); return; }
    setPosting(true);
    try {
      const c = await api.post<TaskComment>(endpoints.assignmentComments(a.id), { text });
      upsertAssignment({ ...a, comments: [...(a.comments || []), c] });
      setComment('');
      showToast('Comment added ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not comment', 'error');
    } finally {
      setPosting(false);
    }
  };

  const approve = () => {
    // The web asks confirm() before approving; Alert is the native equivalent.
    Alert.alert('Approve completion', 'Approve this task as 100% complete?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void submitApproval(true, '') },
    ]);
  };

  const submitApproval = async (approveIt: boolean, remark: string) => {
    setBusy(true);
    try {
      const updated = await api.post<Assignment>(
        endpoints.assignmentApproveCompletion(a.id), { approve: approveIt, remark },
      );
      upsertAssignment(updated);
      setSendBackOpen(false);
      showToast(approveIt ? 'Completion approved ✓' : 'Task sent back');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete assignment', 'Delete this assignment? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.del(endpoints.assignment(a.id));
            removeAssignments([a.id]);
            showToast('Assignment deleted');
            onDeleted();
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const showApproval = canApproveCompletion(a, user);
  const showSubAssign = mine && a.status !== 'Completed' && canSubAssign(user);
  const showUpdate = mine && a.status !== 'Completed';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Header ── */}
        <Card>
          <Text style={styles.client}>{client?.name || '—'}</Text>
          <Text style={styles.work}>
            {a.workType}{a.assignmentType === 'recurring' ? ` 🔄 ${a.frequency || 'Monthly'}` : ''}
          </Text>

          <View style={styles.grid}>
            <Row k="Assigned to" v={a.memberName || '—'} />
            <Row k="Reporting" v={a.reportingPersonName || '—'} />
            <Row k="Due date" v={`${fmt(a.dueDate)}${od ? ' ⚠' : ''}`} tone={od ? 'red' : undefined} />
            <Row
              k="Priority"
              v={a.priority || 'Normal'}
              tone={a.priority === 'Urgent' ? 'red' : a.priority === 'High' ? 'amber' : undefined}
            />
            <Row k="Age" v={`${daysOld(a)} days`} />
            <View style={styles.gridCell}>
              <Text style={styles.k}>Status</Text>
              <StatusPill label={a.status || 'Pending'} bg={bg} fg={fg} />
            </View>
            {a.status === 'Completed' && !!a.completedAt && (
              <Row k="Completed on" v={fmtAny(a.completedAt)} tone="green" />
            )}
          </View>

          {!!a.notes && <Text style={styles.notes}>📝 {a.notes}</Text>}

          {a.awaitingApproval && (
            <View style={styles.awaiting}>
              <Text style={styles.awaitingText}>
                ⏳ Awaiting completion approval
                {a.submittedForApprovalAt ? ` · submitted ${fmtDT(a.submittedForApprovalAt)}` : ''}
              </Text>
            </View>
          )}

          {!!a.rejectionRemark && (
            <View style={styles.rejected}>
              <Text style={styles.rejectedTitle}>Sent back</Text>
              <Text style={styles.rejectedText}>{a.rejectionRemark}</Text>
            </View>
          )}
        </Card>

        {/* ── Parent task context, for a sub-assignment ── */}
        {a.isSubAssignment && !!a.parent && (
          <Card style={styles.parentCard}>
            <Text style={styles.parentEyebrow}>
              ↳ Part of a larger task{a.subAssignedByName ? ` · delegated by ${a.subAssignedByName}` : ''}
            </Text>
            <Text style={styles.parentTitle}>
              {a.parent.workType || '—'}{a.parent.assignmentType === 'recurring' ? ' 🔄' : ''}
            </Text>
            <View style={styles.grid}>
              <Row k="Main assignee" v={a.parent.assigneeName || '—'} />
              <Row k="Reporting" v={a.parent.reportingPersonName || '—'} />
              <Row k="Overall due" v={fmt(a.parent.dueDate)} />
              <Row
                k="Overall status"
                v={`${a.parent.status || '—'}${a.parent.completionPct ? ` · ${a.parent.completionPct}%` : ''}`}
              />
            </View>
            {!!a.parent.notes && <Text style={styles.parentNote}>📝 {a.parent.notes}</Text>}
            {!!a.parent.remark && <Text style={styles.parentRemark}>💬 {a.parent.remark}</Text>}
            {!!a.parent.comments?.length && (
              <View style={styles.parentThread}>
                <Text style={styles.parentThreadTitle}>Discussion on the main task</Text>
                {a.parent.comments.slice(-4).map((c, i) => (
                  <View key={i} style={{ marginBottom: 4 }}>
                    <Text style={styles.parentAuthor}>
                      {c.authorName || '—'}<Text style={styles.parentDate}> · {fmtDT(c.date)}</Text>
                    </Text>
                    <Text style={styles.parentBody}>{c.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* ── Progress ── */}
        {pct > 0 && (
          <Card style={styles.block}>
            <View style={styles.progHead}>
              <Text style={styles.blockTitle}>Progress</Text>
              <Text style={styles.bigPct}>{pct}%</Text>
            </View>
            <ProgressBar pct={pct} />
          </Card>
        )}

        {/* ── Member's remark ── */}
        {!!a.remark && (
          <Card style={styles.block}>
            <Text style={styles.blockTitle}>💬 Member's Remark</Text>
            <View style={styles.remarkBox}>
              <Text style={styles.remarkText}>{a.remark}</Text>
            </View>
          </Card>
        )}

        {/* ── Activity log (last 5, newest first) ── */}
        {log.length > 0 && (
          <Card style={styles.block}>
            <Text style={styles.blockTitle}>Activity Log</Text>
            {log.map((l, i) => (
              <View key={i} style={styles.logRow}>
                <View style={[styles.dot, { backgroundColor: l.isBackward ? colors.red : colors.green }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logHead, l.isBackward && { color: colors.red }]}>
                    {l.prevPct ?? 0}% → {l.completionPct ?? 0}%{l.status ? ` · ${l.status}` : ''}
                  </Text>
                  {!!l.remark && <Text style={styles.logRemark}>💬 {l.remark}</Text>}
                  <Text style={styles.logMeta}>{fmtDT(l.date)} · {l.updatedByName || '—'}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* ── Comments thread ── */}
        {comments.length > 0 && (
          <Card style={styles.block}>
            <Text style={styles.blockTitle}>💬 Comments</Text>
            {comments.map((c, i) => {
              const fromClient = c.role === 'client';
              const tag = fromClient ? ' · Client' : c.role === 'admin' ? ' · Admin' : ' · Team';
              return (
                <View key={c.id || i} style={[styles.bubbleRow, { justifyContent: fromClient ? 'flex-start' : 'flex-end' }]}>
                  <View style={[styles.bubble, fromClient ? styles.bubbleClient : styles.bubbleTeam]}>
                    <Text style={[styles.bubbleAuthor, fromClient && { color: '#c2410c' }]}>
                      {c.authorName || c.author || 'Unknown'}{tag}{c.isReminder ? ' ⏰' : ''}
                    </Text>
                    <Text style={styles.bubbleText}>{c.text}</Text>
                    <Text style={styles.bubbleDate}>{fmtDT(c.date)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* ── Comment box: assignee, reporting manager, admin ── */}
        {canComment(a, user) && (
          <Card style={styles.block}>
            <Field label="Add a comment">
              <Input
                value={comment}
                onChangeText={setComment}
                placeholder="Write a remark for the team…"
                multiline
              />
            </Field>
            <Button title="💬 Comment" onPress={postComment} loading={posting} />
          </Card>
        )}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          {showApproval && (
            <>
              <Button title="✓ Approve completion" onPress={approve} loading={busy} />
              <Button title="↩ Send back" onPress={() => { setSendBackNote(''); setSendBackOpen(true); }} variant="outline" />
            </>
          )}
          {showUpdate && <Button title="✏ Update Progress" onPress={() => setShowProgress(true)} />}
          {showSubAssign && <Button title="👥 Sub-Assign" onPress={() => setShowSub(true)} variant="outline" />}
          {canRemind(a, user) && <Button title="🔔 Send Reminder" onPress={() => setShowRemind(true)} variant="outline" />}
          {canEditAssignment(a, user) && <Button title="✏ Edit Assignment" onPress={() => onEdit(a.id)} variant="outline" />}
          {user?.role === 'admin' && <Button title="🗑 Delete" onPress={confirmDelete} variant="danger" />}
        </View>
      </ScrollView>

      <ProgressSheet
        assignment={a}
        visible={showProgress}
        onClose={() => setShowProgress(false)}
      />
      <ReminderSheet assignment={a} visible={showRemind} onClose={() => setShowRemind(false)} />
      <SubAssignSheet parent={a} visible={showSub} onClose={() => setShowSub(false)} />

      {/* The web uses prompt() for the send-back note; a sheet is the native form. */}
      <Sheet
        visible={sendBackOpen}
        title="Send back"
        onClose={() => setSendBackOpen(false)}
        footer={
          <>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" onPress={() => setSendBackOpen(false)} variant="outline" />
            </View>
            <View style={{ flex: 2 }}>
              <Button title="Send back" onPress={() => void submitApproval(false, sendBackNote.trim())} loading={busy} />
            </View>
          </>
        }
      >
        <Field label="Note" hint="optional">
          <Input
            value={sendBackNote}
            onChangeText={setSendBackNote}
            placeholder="Why is this going back?"
            multiline
          />
        </Field>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'red' | 'green' | 'amber' }) {
  const color = tone === 'red' ? colors.red : tone === 'green' ? colors.green : tone === 'amber' ? colors.amber : colors.text;
  return (
    <View style={styles.gridCell}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, { color }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  client: { ...font.h2, color: colors.text },
  work: { ...font.small, color: colors.muted, marginTop: 3, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '50%', paddingVertical: 5, paddingRight: spacing.sm },
  k: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  v: { ...font.small, color: colors.text },
  notes: { ...font.small, color: colors.muted, marginTop: spacing.md, lineHeight: 18 },
  awaiting: { marginTop: spacing.md, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: spacing.md },
  awaitingText: { ...font.small, color: '#92400e', lineHeight: 17 },
  rejected: { marginTop: spacing.sm, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: spacing.md },
  rejectedTitle: { ...font.tiny, color: colors.red, textTransform: 'uppercase', marginBottom: 3 },
  rejectedText: { ...font.small, color: '#b91c1c', lineHeight: 17 },

  parentCard: { marginTop: spacing.md, backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  parentEyebrow: { ...font.tiny, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  parentTitle: { ...font.h3, color: '#4338ca', marginBottom: spacing.sm },
  parentNote: { ...font.small, color: '#4338ca', marginTop: 6 },
  parentRemark: { ...font.small, color: '#4338ca', fontStyle: 'italic', marginTop: 4 },
  parentThread: { marginTop: spacing.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#ddd6fe' },
  parentThreadTitle: { ...font.tiny, color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 },
  parentAuthor: { ...font.tiny, color: colors.text },
  parentDate: { color: colors.muted, fontWeight: '500' },
  parentBody: { ...font.small, color: colors.text, fontWeight: '500' },

  block: { marginTop: spacing.md },
  blockTitle: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  progHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  bigPct: { fontSize: 20, fontWeight: '900', color: colors.primary },
  remarkBox: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: spacing.md },
  remarkText: { ...font.small, color: colors.primaryDark, fontStyle: 'italic', lineHeight: 18 },

  logRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  logHead: { ...font.small, color: colors.text },
  logRemark: { ...font.small, color: colors.primaryDark, fontStyle: 'italic', fontWeight: '500' },
  logMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },

  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubble: { maxWidth: '85%', borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleClient: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  bubbleTeam: { backgroundColor: '#f3f4f6', borderColor: colors.border },
  bubbleAuthor: { ...font.tiny, color: colors.text, marginBottom: 2 },
  bubbleText: { ...font.small, color: colors.text, fontWeight: '500', lineHeight: 18 },
  bubbleDate: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3 },

  actions: { marginTop: spacing.lg, gap: spacing.sm },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  goneText: { ...font.body, color: colors.muted, textAlign: 'center' },
});
