import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';

/**
 * openReminderSheet() / sendReminder(). POST /api/notifications — the server
 * allows only the reporting person or an admin, and pushes to the assignee.
 */
export default function ReminderSheet({
  assignment, visible, onClose,
}: { assignment: Assignment | null; visible: boolean; onClose: () => void }) {
  const { clientsById } = useData();
  const { showToast } = useToast();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (visible) setMsg(''); }, [visible, assignment?.id]);

  if (!assignment) return null;
  const client = clientsById[assignment.clientId];

  const send = async () => {
    setSending(true);
    try {
      await api.post(endpoints.notifications, {
        assignmentId: assignment.id,
        message: msg.trim() || 'Please update the status of your assignment.',
      });
      onClose();
      showToast('Reminder sent ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Send Reminder"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Send" onPress={send} loading={sending} /></View>
        </>
      }
    >
      <View style={styles.info}>
        <Text style={styles.line}>To: <Text style={styles.b}>{assignment.memberName || '—'}</Text></Text>
        <Text style={styles.line}>Task: {client?.name || '—'} — {assignment.workType}</Text>
        <Text style={styles.line}>Status: {assignment.status || 'Pending'}</Text>
      </View>
      <Field label="Message" hint="optional">
        <Input
          value={msg}
          onChangeText={setMsg}
          placeholder="Please update the status of your assignment."
          multiline
        />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: {
    backgroundColor: colors.primaryLight, borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg,
  },
  line: { ...font.small, color: colors.primaryDark, lineHeight: 19 },
  b: { fontWeight: '800' },
});
