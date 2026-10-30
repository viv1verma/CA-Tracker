import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment, ReopenRequest } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';

/**
 * openReopenSheet() / saveReopenReq(). Asks an admin to reopen a completed task.
 * The server requires the task to be Completed and the caller to be its
 * reporting manager (or an admin).
 */
export default function ReopenRequestSheet({
  assignment, visible, onClose,
}: { assignment: Assignment | null; visible: boolean; onClose: () => void }) {
  const { clientsById, addReopenRequest } = useData();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setReason(''); }, [visible, assignment?.id]);

  if (!assignment) return null;
  const client = clientsById[assignment.clientId];

  const save = async () => {
    if (!reason.trim()) { showToast('Reason required', 'error'); return; }
    setSaving(true);
    try {
      const req = await api.post<ReopenRequest>(endpoints.reopenRequests, {
        assignmentId: assignment.id,
        reason: reason.trim(),
      });
      addReopenRequest(req);
      onClose();
      showToast('Request sent to Admin ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not send request', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Reopen Request"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Send Request" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <View style={styles.info}>
        <Text style={styles.line}><Text style={styles.b}>{client?.name || '—'}</Text> — {assignment.workType}</Text>
        <Text style={styles.line}>Completed by: {assignment.memberName || '—'}</Text>
        <Text style={styles.line}>Completed: {fmtDT(assignment.completedAt)}</Text>
      </View>
      <Field label="Reason *">
        <Input value={reason} onChangeText={setReason} placeholder="Why should this be reopened?" multiline />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg },
  line: { ...font.small, color: '#b91c1c', lineHeight: 19 },
  b: { fontWeight: '800' },
});
