import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { LeaveRequest } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import { LEAVE_TYPES, leaveDays } from './logic';
import type { LeaveBalance } from './types';

/** openLeaveSheet() / applyLeave(). */
export function LeaveSheet({
  visible, balance, onClose, onApplied,
}: {
  visible: boolean;
  balance: LeaveBalance | null;
  onClose: () => void;
  onApplied: (r: LeaveRequest) => void;
}) {
  const { showToast } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('Casual Leave');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFrom(''); setTo(''); setType('Casual Leave'); setReason('');
  }, [visible]);

  const days = useMemo(() => leaveDays(from, to), [from, to]);

  const save = async () => {
    // Validation order copied from applyLeave().
    if (!from || !to) { showToast('Select from and to dates', 'error'); return; }
    if (!reason.trim()) { showToast('Reason required', 'error'); return; }
    if (new Date(to) < new Date(from)) { showToast('To date is before From date', 'error'); return; }
    setSaving(true);
    try {
      const r = await api.post<LeaveRequest>(endpoints.leaveRequests, {
        fromDate: from, toDate: to, type, reason: reason.trim(),
      });
      onApplied(r);
      onClose();
      showToast('Leave request submitted ✓ — sent to admin for approval');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not apply', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="🌴 Apply for Leave"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Apply for Leave" onPress={save} loading={saving} /></View>
        </>
      }
    >
      {!!balance && (
        <View style={styles.info}>
          <Text style={styles.infoText}>
            Leave Balance: {balance.accrued} accrued · {balance.used} used · {balance.remaining} remaining
            {balance.compOff ? `  |  Comp Off: ${balance.compOff.available} available` : ''}
          </Text>
        </View>
      )}
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="From"><DateField value={from} onChange={setFrom} /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="To"><DateField value={to} onChange={setTo} /></Field>
        </View>
      </View>
      {days !== null && <Text style={styles.days}>{days} day{days > 1 ? 's' : ''} of leave</Text>}
      <Field label="Type">
        <Select value={type} placeholder="Leave type" options={LEAVE_TYPES} onChange={setType} />
      </Field>
      <Field label="Reason *">
        <Input value={reason} onChangeText={setReason} placeholder="Reason for leave…" multiline />
      </Field>
    </Sheet>
  );
}

/**
 * openSiteVisitManual() / openSiteVisitForPunch(). Logging a visit also writes an
 * attendance row server-side, which is how an off-network punch is allowed.
 */
export function SiteVisitSheet({
  visible, onClose, onLogged,
}: { visible: boolean; onClose: () => void; onLogged: () => void }) {
  const { clients } = useData();
  const { showToast } = useToast();
  const [siteName, setSiteName] = useState('');
  const [clientId, setClientId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSiteName(''); setClientId(''); setPurpose(''); setNotes('');
  }, [visible]);

  const save = async () => {
    if (!siteName.trim()) { showToast('Site name required', 'error'); return; }
    setSaving(true);
    try {
      await api.post(endpoints.siteVisits, {
        siteName: siteName.trim(),
        clientId: clientId || null,
        purpose: purpose.trim(),
        notes: notes.trim(),
      });
      onLogged();
      onClose();
      showToast('Site visit logged ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not log the visit', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="🗺 Log Site Visit"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Log Visit" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <Field label="Site Name *">
        <Input value={siteName} onChangeText={setSiteName} placeholder="Where are you?" />
      </Field>
      <Field label="Client" hint="optional">
        <Select
          value={clientId}
          placeholder="No client"
          options={[{ value: '', label: 'No client' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setClientId}
          searchable
        />
      </Field>
      <Field label="Purpose">
        <Input value={purpose} onChangeText={setPurpose} placeholder="Why are you there?" />
      </Field>
      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} placeholder="Anything else…" multiline />
      </Field>
    </Sheet>
  );
}

/** doPunchWFH()'s prompt() — a sheet, since React Native has no prompt. */
export function WfhReasonSheet({
  visible, onClose, onSubmit, saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  saving: boolean;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  return (
    <Sheet
      visible={visible}
      title="🏠 Work From Home"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title="Send Request" onPress={() => onSubmit(reason.trim())} loading={saving} />
          </View>
        </>
      }
    >
      <Text style={styles.wfhNote}>
        Briefly, what will you be working on today? This request goes to admin for approval.
        It counts as present only after approval.
      </Text>
      <Field label="Today's plan">
        <Input value={reason} onChangeText={setReason} placeholder="What you'll work on…" multiline />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg },
  infoText: { ...font.small, color: colors.primaryDark, lineHeight: 18 },
  pair: { flexDirection: 'row', gap: spacing.md },
  days: { ...font.small, color: colors.primary, marginBottom: spacing.md, marginTop: -spacing.sm },
  wfhNote: { ...font.small, color: colors.muted, lineHeight: 18, marginBottom: spacing.lg },
});
