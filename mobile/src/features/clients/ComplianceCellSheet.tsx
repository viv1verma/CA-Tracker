import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, spacing } from '../../theme/theme';
import {
  COMP_MONTHS, compRec,
  type ComplianceDef, type ComplianceRecord,
} from '../clientcompliance/logic';

/**
 * compEdit() / compSave() / compDelete() — the per-cell editor behind the admin's
 * per-client compliance grid.
 *
 * Fields follow the web exactly: Status, the obligation's own amount labels when
 * it declares them, due date, filing date, late fee and a free-text note.
 * "Clear this entry" only appears once a record actually exists, as the web only
 * renders that button when `r.id` is set.
 */
export default function ComplianceCellSheet({
  clientId, fy, gstin, defs, statuses, records, target, onClose, onSaved,
}: {
  clientId: string;
  fy: string;
  gstin: string;
  defs: ComplianceDef[];
  statuses: string[];
  records: ComplianceRecord[];
  target: { obligation: string; period: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState('');
  const [amount, setAmount] = useState('');
  const [amount2, setAmount2] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [filedDate, setFiledDate] = useState('');
  const [lateFee, setLateFee] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const def = defs.find((d) => d.key === target?.obligation);
  const rec = target ? compRec(records, defs, target.obligation, target.period, gstin) : undefined;

  useEffect(() => {
    if (!target) return;
    setStatus(rec?.status || statuses[0] || 'pending');
    setAmount(rec?.amount ? String(rec.amount) : '');
    setAmount2(rec?.amount2 ? String(rec.amount2) : '');
    setDueDate(rec?.dueDate || '');
    setFiledDate(rec?.filedDate || '');
    setLateFee(rec?.lateFee ? String(rec.lateFee) : '');
    setNote(rec?.note || '');
  }, [target?.obligation, target?.period, rec?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!target || !def) return null;

  /** The web's period caption: 'Annual', or 'Aug 2026' from a '2026-08' key. */
  const periodLabel = (() => {
    const p = target.period;
    if (p === 'FY') return 'Annual';
    const m = COMP_MONTHS.find((x) => p.endsWith(`-${x[0]}`));
    return m ? `${m[1]} ${p.slice(0, 4)}` : p;
  })();
  const fyLabel = `FY${String(fy).slice(2)}-${String(parseInt(fy, 10) + 1).slice(2)}`;

  const save = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      fy, period: target.period, obligation: target.obligation,
      status, dueDate, filedDate, lateFee, note,
    };
    if (def.amt1) payload.amount = amount;
    if (def.amt2) payload.amount2 = amount2;
    // A GSTIN-wise obligation carries the selected GSTIN; everything else sends ''.
    if (def.gstinWise) payload.gstin = gstin && gstin !== 'all' ? gstin : '';
    try {
      await api.put(endpoints.clientComplianceAdmin(clientId), payload);
      showToast('Saved');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    if (!rec?.id) return;
    Alert.alert('Clear entry', 'Clear this compliance entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.clientComplianceRecord(clientId, rec.id));
            showToast('Cleared');
            onSaved();
            onClose();
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not clear', 'error');
          }
        },
      },
    ]);
  };

  return (
    <Sheet visible={!!target} title="Update Compliance" onClose={onClose}
      footer={<Button title="Save" onPress={save} loading={saving} />}>
      <Text style={styles.obligation}>{def.label}</Text>
      <Text style={styles.period}>{periodLabel} · {fyLabel}</Text>

      <Field label="Status">
        <Select value={status} placeholder="Status" onChange={setStatus}
          options={statuses.map((s) => ({
            value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
          }))} />
      </Field>
      {!!def.amt1 && (
        <Field label={`${def.amt1} (₹)`}>
          <Input value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />
        </Field>
      )}
      {!!def.amt2 && (
        <Field label={`${def.amt2} (₹)`}>
          <Input value={amount2} onChangeText={setAmount2} keyboardType="numeric" placeholder="0" />
        </Field>
      )}
      <Field label="Due date"><DateField value={dueDate} onChange={setDueDate} /></Field>
      <Field label="Filing date"><DateField value={filedDate} onChange={setFiledDate} /></Field>
      <Field label="Late fee (₹)">
        <Input value={lateFee} onChangeText={setLateFee} keyboardType="numeric" placeholder="0" />
      </Field>
      <Field label="Note (optional)">
        <Input value={note} onChangeText={setNote} placeholder="Reference / ARN / remarks" />
      </Field>

      {!!rec?.id && (
        <Button title="Clear this entry" onPress={clear} variant="outline" />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  obligation: { ...font.h3, color: colors.text, marginBottom: 2 },
  period: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },
});
