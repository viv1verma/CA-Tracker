import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment, DueDateRequest } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';

/**
 * openDDRSheet() / saveDDR(). The reporting person asks an admin to move a due
 * date; the server accepts it only from the task's reporting person or an admin.
 */
export default function DueDateRequestSheet({
  assignment, visible, onClose,
}: { assignment: Assignment | null; visible: boolean; onClose: () => void }) {
  const { clientsById, addDueDateRequest } = useData();
  const { showToast } = useToast();
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNewDate('');
    setReason('');
  }, [visible, assignment?.id]);

  if (!assignment) return null;
  const client = clientsById[assignment.clientId];

  const save = async () => {
    // Same validation order as the web: date first, then reason.
    if (!newDate) { showToast('Select new due date', 'error'); return; }
    if (!reason.trim()) { showToast('Reason required', 'error'); return; }
    setSaving(true);
    try {
      const req = await api.post<DueDateRequest>(endpoints.dueDateRequests, {
        assignmentId: assignment.id,
        requestedDueDate: newDate,
        reason: reason.trim(),
      });
      addDueDateRequest(req);
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
      title="Due Date Change Request"
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
        <Text style={styles.line}>Assigned to: {assignment.memberName || '—'}</Text>
      </View>

      <Field label="Current Due Date">
        <View style={styles.readonly}>
          <Text style={styles.readonlyText}>{fmt(assignment.dueDate)}</Text>
        </View>
      </Field>
      <Field label="New Due Date *">
        <DateField value={newDate} onChange={setNewDate} placeholder="Pick a new date" />
      </Field>
      <Field label="Reason *">
        <Input value={reason} onChangeText={setReason} placeholder="Why is more time needed?" multiline />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg },
  line: { ...font.small, color: colors.primaryDark, lineHeight: 19 },
  b: { fontWeight: '800' },
  readonly: {
    minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#f9fafb',
  },
  readonlyText: { fontSize: 15, color: colors.muted, fontWeight: '600' },
});
