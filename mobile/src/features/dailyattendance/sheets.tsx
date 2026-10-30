import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, spacing } from '../../theme/theme';
import { PUNCH_STATUSES, type PunchStatusRow } from './logic';

/** openEditPunch() / saveEditPunch(). Admin / HR only, matching the server. */
export function EditPunchSheet({
  row, visible, onClose, onSaved,
}: {
  row: PunchStatusRow | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [punchIn, setPunchIn] = useState('');
  const [punchOut, setPunchOut] = useState('');
  const [status, setStatus] = useState('Present');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !row) return;
    setPunchIn(row.punchIn || '');
    setPunchOut(row.punchOut || '');
    setStatus(row.status || 'Present');
    setRemark(row.remark || '');
  }, [visible, row?.userId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;

  const save = async () => {
    setSaving(true);
    try {
      // The server normalises HH:MM and recomputes hours and the late flag.
      await api.put(endpoints.attendanceRecord, {
        userId: row.userId,
        date: row.date,
        punchIn: punchIn || null,
        punchOut: punchOut || null,
        status,
        remark,
      });
      onSaved();
      onClose();
      showToast('Punch updated');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Edit Punch"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Save" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <Text style={styles.who}>{row.userName} · {row.date}</Text>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Punch In" hint="HH:MM">
            <Input value={punchIn} onChangeText={setPunchIn} placeholder="09:30" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Punch Out" hint="HH:MM">
            <Input value={punchOut} onChangeText={setPunchOut} placeholder="18:30" />
          </Field>
        </View>
      </View>
      <Field label="Status">
        <Select
          value={status}
          placeholder="Status"
          options={PUNCH_STATUSES.map((s) => ({ value: s, label: s }))}
          onChange={setStatus}
        />
      </Field>
      <Field label="Remark" hint="visible to admin & HR only">
        <Input value={remark} onChangeText={setRemark} placeholder="Reason / note…" multiline />
      </Field>
    </Sheet>
  );
}

/** openAttRemark()'s prompt() — the hidden remark, admin/HR only. */
export function RemarkSheet({
  row, visible, onClose, onSaved,
}: {
  row: PunchStatusRow | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && row) setText(row.remark || '');
  }, [visible, row?.userId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(endpoints.attendanceRemark, {
        userId: row.userId, date: row.date, remark: text,
      });
      onSaved();
      onClose();
      showToast('Remark saved');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save remark', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Hidden remark"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Save" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <Text style={styles.who}>{row.userName} · {row.date}</Text>
      <Text style={styles.note}>Visible to admin & HR only.</Text>
      <Field label="Remark / reason">
        <Input value={text} onChangeText={setText} placeholder="Why was this day like this?" multiline />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  who: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  note: { ...font.small, color: colors.muted, marginBottom: spacing.lg },
  pair: { flexDirection: 'row', gap: spacing.md },
});
