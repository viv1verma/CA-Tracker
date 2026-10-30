import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, spacing } from '../../theme/theme';
import {
  EXP_META_FALLBACK, type ExpMeta, type FirmExperience, type FirmProfile,
} from './logic';

/**
 * openExpForm() / saveExp() — the Audit Experience sheet. POST for a new record,
 * PUT for an edit; both return the whole profile, which the caller adopts.
 */
export default function ExperienceSheet({
  visible, record, onClose, onSaved,
}: {
  visible: boolean;
  record: FirmExperience | null;
  onClose: () => void;
  onSaved: (p: FirmProfile) => void;
}) {
  const { showToast } = useToast();
  const [meta, setMeta] = useState<ExpMeta>(EXP_META_FALLBACK);
  const [saving, setSaving] = useState(false);

  const [client, setClient] = useState('');
  const [clientType, setClientType] = useState('');
  const [assignmentType, setAssignmentType] = useState('');
  const [sector, setSector] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ongoing, setOngoing] = useState(false);
  const [feeValue, setFeeValue] = useState('');
  const [refNo, setRefNo] = useState('');
  const [remarks, setRemarks] = useState('');

  // ensureExpMeta(): fetched once, with the web's hardcoded fallback on failure.
  useEffect(() => {
    if (!visible) return;
    void (async () => {
      try { setMeta(await api.get<ExpMeta>(endpoints.firmExperienceMeta, { background: true })); }
      catch { setMeta(EXP_META_FALLBACK); }
    })();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setClient(record?.client || '');
    setClientType(record?.clientType || '');
    setAssignmentType(record?.assignmentType || '');
    setSector(record?.sector || '');
    setFromDate(record?.fromDate || '');
    setToDate(record?.toDate || '');
    setOngoing(!!record?.ongoing);
    setFeeValue(record?.feeValue ? String(record.feeValue) : '');
    setRefNo(record?.refNo || '');
    setRemarks(record?.remarks || '');
  }, [visible, record]);

  const save = async () => {
    if (!client.trim()) { showToast('Client name is required', 'error'); return; }
    setSaving(true);
    const body = {
      id: record?.id, client: client.trim(), clientType, assignmentType,
      sector: sector.trim(), fromDate, toDate, ongoing,
      feeValue: parseFloat(feeValue) || 0, refNo: refNo.trim(), remarks: remarks.trim(),
    };
    try {
      const p = record?.id
        ? await api.put<FirmProfile>(endpoints.firmExperienceItem(record.id), body)
        : await api.post<FirmProfile>(endpoints.firmExperience, body);
      onSaved(p);
      onClose();
      showToast('Experience saved ✓ — tenders will now match against it');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const opts = (list: string[]) =>
    [{ value: '', label: '—' }, ...list.map((x) => ({ value: x, label: x }))];

  return (
    <Sheet
      visible={visible}
      title={record ? 'Edit Audit Experience' : 'Add Audit Experience'}
      onClose={onClose}
      footer={<Button title="Save" onPress={save} loading={saving} />}
    >
      <Field label="Client *">
        <Input value={client} onChangeText={setClient} placeholder="Client name" />
      </Field>
      <Field label="Client Type">
        <Select value={clientType} placeholder="—" options={opts(meta.clientTypes)} onChange={setClientType} />
      </Field>
      <Field label="Assignment Type">
        <Select value={assignmentType} placeholder="—" options={opts(meta.assignmentTypes)}
          onChange={setAssignmentType} />
      </Field>
      <Field label="Sector">
        <Input value={sector} onChangeText={setSector} placeholder="e.g. Power, Banking" />
      </Field>
      <Field label="From">
        <DateField value={fromDate} onChange={setFromDate} />
      </Field>
      <Field label="To">
        {/* The web disables the To field while "ongoing" is ticked. */}
        {ongoing
          ? <Text style={styles.disabled}>present</Text>
          : <DateField value={toDate} onChange={setToDate} />}
      </Field>
      <Pressable onPress={() => setOngoing((v) => !v)} accessibilityRole="checkbox"
        accessibilityState={{ checked: ongoing }} style={styles.checkRow}>
        <Text style={styles.checkBox}>{ongoing ? '☑' : '☐'}</Text>
        <Text style={styles.checkLabel}>Ongoing</Text>
      </Pressable>
      <Field label="Fee / Value (₹)">
        <Input value={feeValue} onChangeText={setFeeValue} keyboardType="numeric" placeholder="0" />
      </Field>
      <Field label="Reference No.">
        <Input value={refNo} onChangeText={setRefNo} placeholder="Work order / letter no." />
      </Field>
      <Field label="Remarks">
        <Input value={remarks} onChangeText={setRemarks} multiline placeholder="Anything worth noting" />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.body, color: colors.text },
  disabled: {
    ...font.body, color: colors.muted, height: 44, lineHeight: 44,
    paddingHorizontal: 12, backgroundColor: '#f3f4f6', borderRadius: 12,
  },
});
