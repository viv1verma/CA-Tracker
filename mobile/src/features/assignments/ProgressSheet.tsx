import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment, AssignmentStatus } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { STATUS_OPTIONS, canEditDueDate } from './logic';

/**
 * openProgressSheet() / saveProgress(). The web uses a 0–100 range slider that
 * the server rounds to the nearest 10; the phone offers those same steps as taps,
 * which is the equivalent interaction without a draggable thumb on a small screen.
 */
const STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export default function ProgressSheet({
  assignment, visible, onClose, onSaved,
}: {
  assignment: Assignment | null;
  visible: boolean;
  onClose: () => void;
  onSaved?: (a: Assignment) => void;
}) {
  const { user } = useAuth();
  const { clientsById, upsertAssignment } = useData();
  const { showToast } = useToast();

  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState<AssignmentStatus>('Pending');
  const [remark, setRemark] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const isCA = canEditDueDate(user);

  useEffect(() => {
    if (!assignment || !visible) return;
    setPct(assignment.completionPct || 0);
    setStatus((assignment.status || 'Pending') as AssignmentStatus);
    setRemark(assignment.remark || '');
    setDueDate(assignment.dueDate || '');
  }, [assignment?.id, visible]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Older rows can carry a status outside the five workflow values. Offer it as-is
  // so opening this sheet never silently rewrites a status the user did not touch.
  const statusOptions = useMemo(() => {
    const current = (assignment?.status || 'Pending') as string;
    const list: string[] = [...STATUS_OPTIONS];
    if (!list.includes(current)) list.unshift(current);
    return list.map((sv) => ({ value: sv, label: sv }));
  }, [assignment?.status]);

  if (!assignment) return null;
  const client = clientsById[assignment.clientId];

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { status, remark: remark.trim(), completionPct: pct };
      if (isCA && dueDate) payload.dueDate = dueDate;
      const updated = await api.put<Assignment>(endpoints.assignment(assignment.id), payload);
      upsertAssignment(updated);
      onSaved?.(updated);
      onClose();
      // The server turns a member's "Completed" into "Under Review" pending approval.
      const landed = updated.status || status;
      showToast(
        landed === 'Under Review' && updated.awaitingApproval
          ? 'Sent to your reporting manager for approval'
          : `Progress: ${updated.completionPct ?? pct}% — ${landed}`,
      );
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Update Progress"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Save" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <Text style={styles.info}>{client?.name || '—'} — {assignment.workType}</Text>

      <Field label="Completion">
        <Text style={styles.bigPct}>{pct}%</Text>
        <View style={styles.steps}>
          {STEPS.map((s) => {
            const on = s === pct;
            return (
              <Pressable
                key={s}
                onPress={() => setPct(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.step, on && styles.stepOn]}
              >
                <Text style={[styles.stepText, on && styles.stepTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Status">
        <Select
          value={status}
          placeholder="Status"
          options={statusOptions}
          onChange={(v) => setStatus(v as AssignmentStatus)}
        />
      </Field>

      <Field label="Remark">
        <Input value={remark} onChangeText={setRemark} placeholder="What changed?" multiline />
      </Field>

      {isCA && (
        <Field label="Due Date" hint="CA / admin only">
          <DateField value={dueDate} onChange={setDueDate} />
        </Field>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { ...font.small, color: colors.muted, marginBottom: spacing.lg },
  bigPct: { fontSize: 30, fontWeight: '900', color: colors.primary, marginBottom: spacing.sm },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  step: {
    minWidth: 44, height: 40, paddingHorizontal: 6, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  stepOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepText: { ...font.small, color: colors.muted },
  stepTextOn: { color: colors.white },
});
