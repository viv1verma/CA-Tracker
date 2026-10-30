import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import { PRIORITY_OPTIONS, fmt, memberUsers } from './logic';

/**
 * openSubSheet() / saveSubAssign(). Delegates a slice of your own task to a
 * junior. The server stamps subAssignedBy/isSubAssignment itself, but the web
 * sends them explicitly and so do we — same request body, same result.
 */
export default function SubAssignSheet({
  parent, visible, onClose, onCreated,
}: {
  parent: Assignment | null;
  visible: boolean;
  onClose: () => void;
  onCreated?: (a: Assignment) => void;
}) {
  const { user } = useAuth();
  const { users, clientsById, addAssignment } = useData();
  const { showToast } = useToast();

  const [memberId, setMemberId] = useState('');
  const [workType, setWorkType] = useState('');
  const [priority, setPriority] = useState<string>('Normal');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // The junior list excludes yourself, exactly as the web's subMem options do.
  const juniors = useMemo(
    () => memberUsers(users)
      .filter((u) => u.id !== user?.id)
      .map((u) => ({ value: u.id, label: u.name, sub: u.designation })),
    [users, user?.id],
  );

  useEffect(() => {
    if (!visible) return;
    setMemberId('');
    setWorkType('');
    setPriority('Normal');
    setDueDate(parent?.dueDate || '');
    setNotes('');
  }, [visible, parent?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const client = parent ? clientsById[parent.clientId] : undefined;

  const save = async () => {
    if (!memberId || !workType.trim()) {
      showToast('Select member and enter work description', 'error');
      return;
    }
    const member = users.find((u) => u.id === memberId);
    setSaving(true);
    try {
      const created = await api.post<Assignment>(endpoints.assignments, {
        clientId: parent?.clientId || '',
        memberId,
        memberName: member?.name || '',
        workType: workType.trim(),
        priority,
        dueDate,
        notes,
        parentAssignmentId: parent?.id || null,
        parentAssigneeId: user?.id,
        subAssignedBy: user?.id,
        subAssignedByName: user?.name,
        isSubAssignment: true,
        reportingPersonId: user?.id,
        reportingPersonName: user?.name,
        status: 'Pending',
      });
      addAssignment(created);
      onCreated?.(created);
      onClose();
      showToast(`Sub-assigned to ${member?.name || 'member'} ✓`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not sub-assign', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Sub-Assign"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Sub-Assign" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <View style={styles.info}>
        {parent ? (
          <>
            <Text style={styles.line}>
              📋 From your task: <Text style={styles.b}>{client?.name || '—'} — {parent.workType}</Text>
            </Text>
            <Text style={styles.sub}>
              Due {fmt(parent.dueDate)}{parent.notes ? ` · 📝 ${parent.notes}` : ''}
            </Text>
            <Text style={styles.note}>The junior will see this parent task's details for context.</Text>
          </>
        ) : (
          <Text style={styles.line}>Creating a standalone sub-assignment.</Text>
        )}
      </View>

      <Field label="Select Junior *">
        <Select value={memberId} placeholder="Select Junior" options={juniors} onChange={setMemberId} searchable />
      </Field>
      <Field label="Work Description *">
        <Input value={workType} onChangeText={setWorkType} placeholder="What should they do?" />
      </Field>
      <Field label="Priority">
        <Select
          value={priority}
          placeholder="Priority"
          options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
          onChange={setPriority}
        />
      </Field>
      <Field label="Due Date">
        <DateField value={dueDate} onChange={setDueDate} />
      </Field>
      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} placeholder="Additional details…" multiline />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg },
  line: { ...font.small, color: '#4338ca', lineHeight: 19 },
  b: { fontWeight: '800' },
  sub: { ...font.tiny, color: colors.muted, marginTop: 4, fontWeight: '500' },
  note: { ...font.tiny, color: '#6366f1', marginTop: 4 },
});
