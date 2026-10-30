import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/permissions';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, spacing } from '../../theme/theme';
import {
  QUALIFICATIONS, TEAM_BRANCHES, grossOf, rupees, type Employee,
} from './logic';

/** openUserSheet() / saveUser(). */
export default function UserFormSheet({
  member, visible, onClose, onSaved,
}: {
  member: Employee | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const editing = !!member;
  const admin = isAdmin(user);

  const [f, setF] = useState<Record<string, string>>({});
  const [partner, setPartner] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!visible) return;
    const m = member;
    setF({
      name: m?.name || '',
      username: m?.username || '',
      email: m?.email || '',
      password: '',
      role: m?.role || 'member',
      designation: m?.designation || '',
      qualification: m?.qualification || 'CA',
      branch: m?.branch || TEAM_BRANCHES[0],
      joiningDate: m?.joiningDate || '',
      dob: m?.dob || '',
      anniversary: m?.anniversary || '',
      openingLeave: m?.openingLeave != null ? String(m.openingLeave) : '0',
      basicSalary: m?.basicSalary != null ? String(m.basicSalary) : '0',
      hra: m?.hra != null ? String(m.hra) : '0',
      conveyance: m?.conveyance != null ? String(m.conveyance) : '0',
      otherAllowance: m?.otherAllowance != null ? String(m.otherAllowance) : '0',
    });
    setPartner(!!m?.isFirmPartner);
  }, [visible, member?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const gross = useMemo(() => grossOf({
    basicSalary: Number(f.basicSalary), hra: Number(f.hra),
    conveyance: Number(f.conveyance), otherAllowance: Number(f.otherAllowance),
  }), [f.basicSalary, f.hra, f.conveyance, f.otherAllowance]);

  const save = async () => {
    // saveUser()'s validation, in the same order.
    if (!f.name?.trim() || !f.username?.trim()) {
      showToast('Name and username required', 'error'); return;
    }
    if (!editing && !f.password) { showToast('Password required', 'error'); return; }
    if (f.password && f.password.length < 6) { showToast('Min 6 characters', 'error'); return; }

    const body: Record<string, unknown> = {
      name: f.name.trim(),
      username: f.username.trim(),
      email: (f.email || '').trim(),
      role: f.role,
      designation: f.designation?.trim() || '',
      qualification: f.qualification,
      branch: f.branch,
      joiningDate: f.joiningDate,
      dob: f.dob,
      anniversary: f.anniversary,
      openingLeave: parseFloat(f.openingLeave) || 0,
      basicSalary: parseFloat(f.basicSalary) || 0,
      hra: parseFloat(f.hra) || 0,
      conveyance: parseFloat(f.conveyance) || 0,
      otherAllowance: parseFloat(f.otherAllowance) || 0,
    };
    // The Firm Partner flag is an admin-only control.
    if (admin) body.isFirmPartner = partner;
    if (f.password) body.password = f.password;

    setSaving(true);
    try {
      if (editing && member) {
        await api.put(endpoints.user(member.id), body);
        showToast('Member updated');
      } else {
        await api.post(endpoints.users, body);
        showToast(`Created: ${f.username}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? 'Edit Member' : 'Add Team Member'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title={editing ? 'Update Member' : 'Add Member'} onPress={save} loading={saving} />
          </View>
        </>
      }
    >
      <Field label="Name *"><Input value={f.name || ''} onChangeText={(v) => set('name', v)} /></Field>
      <Field label="Username *">
        <Input value={f.username || ''} onChangeText={(v) => set('username', v)} />
      </Field>
      <Field label="Email Address" hint="used for password reset">
        <Input value={f.email || ''} onChangeText={(v) => set('email', v)}
          placeholder="name@example.com" keyboardType="email-address" />
      </Field>
      <Field label={editing ? 'Password' : 'Password *'} hint={editing ? 'leave blank to keep' : 'min 6 characters'}>
        <Input value={f.password || ''} onChangeText={(v) => set('password', v)} placeholder="••••••" />
      </Field>
      <Field label="Role">
        <Select value={f.role || 'member'} placeholder="Role"
          options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }]}
          onChange={(v) => set('role', v)} />
      </Field>
      <Field label="Designation">
        <Input value={f.designation || ''} onChangeText={(v) => set('designation', v)} />
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Qualification">
            <Select value={f.qualification || 'CA'} placeholder="Qualification"
              options={QUALIFICATIONS.map((q) => ({ value: q, label: q }))}
              onChange={(v) => set('qualification', v)} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Branch">
            <Select value={f.branch || ''} placeholder="Branch"
              options={TEAM_BRANCHES.map((b) => ({ value: b, label: b }))}
              onChange={(v) => set('branch', v)} />
          </Field>
        </View>
      </View>

      <Field label="Joining Date">
        <DateField value={f.joiningDate || ''} onChange={(v) => set('joiningDate', v)} />
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Date of Birth"><DateField value={f.dob || ''} onChange={(v) => set('dob', v)} /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Anniversary">
            <DateField value={f.anniversary || ''} onChange={(v) => set('anniversary', v)} />
          </Field>
        </View>
      </View>
      <Field label="Opening Leave">
        <Input value={f.openingLeave || ''} onChangeText={(v) => set('openingLeave', v)} keyboardType="numeric" />
      </Field>

      <Text style={styles.section}>Salary structure</Text>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Basic">
            <Input value={f.basicSalary || ''} onChangeText={(v) => set('basicSalary', v)} keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="HRA">
            <Input value={f.hra || ''} onChangeText={(v) => set('hra', v)} keyboardType="numeric" />
          </Field>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Conveyance">
            <Input value={f.conveyance || ''} onChangeText={(v) => set('conveyance', v)} keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Other Allowance">
            <Input value={f.otherAllowance || ''} onChangeText={(v) => set('otherAllowance', v)} keyboardType="numeric" />
          </Field>
        </View>
      </View>
      <Text style={styles.gross}>Gross: {rupees(gross)}/month</Text>

      {admin && (
        <Pressable onPress={() => setPartner((p) => !p)} accessibilityRole="checkbox"
          accessibilityState={{ checked: partner }} style={styles.toggle}>
          <View style={[styles.box, partner && styles.boxOn]}>
            {partner && <Text style={styles.tick}>✓</Text>}
          </View>
          <Text style={styles.toggleLabel}>Firm Partner</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.md },
  section: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  gross: { ...font.small, color: colors.primary, marginBottom: spacing.md },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, minHeight: 44 },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  toggleLabel: { ...font.small, color: colors.text },
});
