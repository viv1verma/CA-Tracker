import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Assignment } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { MANUAL_WORK_TYPE, PRIORITY_OPTIONS, WORK_TYPES, memberUsers } from './logic';

/**
 * openAssignSheet() / saveAssignment(). Creating allows many clients at once —
 * the web loops POST /api/assignments per selected client, and so does this.
 * Editing switches to a single client, exactly as the web swaps the two fields.
 */
export default function AssignmentFormScreen({
  editId, onDone, onCancel,
}: { editId?: string; onDone: () => void; onCancel: () => void }) {
  const { clients, users, assignments, addAssignment, upsertAssignment } = useData();
  const { showToast } = useToast();
  const editing = !!editId;
  const existing = editing ? assignments.find((a) => a.id === editId) : undefined;

  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [reportingId, setReportingId] = useState('');
  const [workSel, setWorkSel] = useState('');
  const [workManual, setWorkManual] = useState('');
  const [priority, setPriority] = useState<string>('Normal');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const members = useMemo(
    () => memberUsers(users).map((u) => ({
      value: u.id, label: u.name, sub: u.designation,
    })),
    [users],
  );

  useEffect(() => {
    if (!existing) return;
    setClientId(existing.clientId);
    setMemberId(existing.memberId);
    setReportingId(existing.reportingPersonId || '');
    if (WORK_TYPES.includes(existing.workType)) {
      setWorkSel(existing.workType);
    } else {
      setWorkSel(MANUAL_WORK_TYPE);
      setWorkManual(existing.workType);
    }
    setPriority(existing.priority || 'Normal');
    setDueDate(existing.dueDate || '');
    setNotes(existing.notes || '');
  }, [existing?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shownClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const sorted = clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [clients, clientSearch]);

  const toggleClient = (id: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    // Validation, in the web's order so the same message appears first.
    if (!memberId) { showToast('Select team member', 'error'); return; }
    const workType = workSel === MANUAL_WORK_TYPE ? workManual.trim() : workSel;
    if (!workType) { showToast('Select or enter work type', 'error'); return; }

    const member = users.find((u) => u.id === memberId);
    const rep = users.find((u) => u.id === reportingId);
    const base = {
      memberId,
      memberName: member?.name || '',
      reportingPersonId: reportingId || null,
      reportingPersonName: rep?.name || null,
      workType,
      priority,
      dueDate,
      notes,
    };

    setSaving(true);
    try {
      if (editing) {
        if (!clientId) { showToast('Select client', 'error'); return; }
        const updated = await api.put<Assignment>(endpoints.assignment(editId!), { ...base, clientId });
        upsertAssignment(updated);
        showToast('Assignment updated');
      } else {
        const ids = [...selectedClients];
        if (!ids.length) { showToast('Select at least one client', 'error'); return; }
        let created = 0;
        for (const cid of ids) {
          const a = await api.post<Assignment>(endpoints.assignments, { ...base, clientId: cid });
          addAssignment(a);
          created++;
        }
        showToast(`${created} assignment${created > 1 ? 's' : ''} created ✓`);
      }
      onDone();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (editing && !existing) {
    return (
      <View style={styles.gone}>
        <Text style={styles.goneText}>This assignment is no longer available.</Text>
        <View style={{ marginTop: spacing.lg, minWidth: 160 }}>
          <Button title="Go back" onPress={onCancel} variant="outline" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? (
          <Field label="Client *">
            <Select
              value={clientId}
              placeholder="Select Client"
              options={clients.map((c) => ({ value: c.id, label: c.name, sub: c.pan }))}
              onChange={setClientId}
              searchable
            />
          </Field>
        ) : (
          <Field label="Client(s) *" hint="select one or more">
            <TextInput
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder="🔍 Search clients…"
              placeholderTextColor={colors.muted}
              style={styles.search}
            />
            <View style={styles.cliList}>
              {shownClients.length === 0 && <Text style={styles.cliEmpty}>No clients found</Text>}
              {shownClients.map((c) => {
                const on = selectedClients.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleClient(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.cliRow, on && { backgroundColor: colors.primaryLight }]}
                  >
                    <View style={[styles.box, on && styles.boxOn]}>
                      {on && <Text style={styles.boxTick}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cliName}>{c.name}</Text>
                      {!!c.pan && <Text style={styles.cliPan}>{c.pan}</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.count}>
              {selectedClients.size
                ? `${selectedClients.size} client${selectedClients.size > 1 ? 's' : ''} selected`
                : '0 clients selected'}
            </Text>
          </Field>
        )}

        <Field label="Assign To *">
          <Select value={memberId} placeholder="Assign To" options={members} onChange={setMemberId} searchable />
        </Field>

        <Field label="Reporting Person">
          <Select
            value={reportingId}
            placeholder="No Reporting Person"
            options={[{ value: '', label: 'No Reporting Person' }, ...members]}
            onChange={setReportingId}
            searchable
          />
        </Field>

        <Field label="Work Type *">
          <Select
            value={workSel}
            placeholder="Select work type…"
            options={[
              ...WORK_TYPES.map((w) => ({ value: w, label: w })),
              { value: MANUAL_WORK_TYPE, label: '✏ Enter manually…' },
            ]}
            onChange={(v) => { setWorkSel(v); if (v !== MANUAL_WORK_TYPE) setWorkManual(''); }}
          />
          {workSel === MANUAL_WORK_TYPE && (
            <View style={{ marginTop: spacing.sm }}>
              <Input value={workManual} onChangeText={setWorkManual} placeholder="Type work type name…" autoFocus />
            </View>
          )}
        </Field>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Priority">
              <Select
                value={priority}
                placeholder="Priority"
                options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
                onChange={setPriority}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Due Date">
              <DateField value={dueDate} onChange={setDueDate} />
            </Field>
          </View>
        </View>

        <Field label="Notes">
          <Input value={notes} onChangeText={setNotes} placeholder="Additional details…" multiline />
        </Field>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}><Button title="Cancel" onPress={onCancel} variant="outline" /></View>
        <View style={{ flex: 2 }}>
          <Button title={editing ? 'Update' : 'Create'} onPress={save} loading={saving} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md },
  search: {
    height: 44, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: 14, backgroundColor: colors.white, color: colors.text,
    marginBottom: 6,
  },
  cliList: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.white, maxHeight: 260, overflow: 'hidden',
  },
  cliRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    minHeight: 48,
  },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxTick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  cliName: { ...font.small, color: colors.text, fontWeight: '700' },
  cliPan: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 1 },
  cliEmpty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  count: { ...font.tiny, color: colors.primary, marginTop: 5 },
  footer: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white,
  },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  goneText: { ...font.body, color: colors.muted, textAlign: 'center' },
});
