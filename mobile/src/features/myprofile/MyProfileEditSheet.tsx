import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import type { Employee } from '../team/logic';
import {
  ADMIN_ONLY_DISABLED, SELF_DATE_FIELDS, SELF_EDITABLE_FIELDS, SELF_FIELD_LABEL,
  buildSelfUpdate,
} from './logic';

/**
 * The member's own edit form — openEditProfile() with `isAdmin` false.
 *
 * Deliberately NOT the Team module's UserFormSheet, which is the admin
 * create/edit form: that one requires a username, exposes salary and the
 * capability flags, and lets designation and joining date be typed. Here the
 * four admin-controlled fields are shown read-only, and username, password,
 * salary and opening leave are not shown at all.
 */
export default function MyProfileEditSheet({
  member, visible, onClose, onSaved,
}: {
  member: Employee | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (updated: Employee) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !member) return;
    const next: Record<string, string> = {};
    SELF_EDITABLE_FIELDS.forEach((k) => {
      next[k] = (member as unknown as Record<string, unknown>)[k] as string || '';
    });
    setF(next);
  }, [visible, member]);

  if (!member) return null;
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name?.trim()) { showToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      // Always the signed-in member's own id — this form can address no one else.
      const body = buildSelfUpdate(f);
      await api.put(endpoints.user(member.id), body);
      onSaved({ ...member, ...body } as Employee);
      onClose();
      showToast('Profile updated successfully ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error saving profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const readOnly = (label: string, value?: string) => (
    <Field key={label} label={label}>
      <View style={styles.disabled}>
        <Text style={styles.disabledText}>{value || '—'}</Text>
      </View>
    </Field>
  );

  return (
    <Sheet visible={visible} title="Edit My Profile" onClose={onClose}
      footer={<Button title="Save" onPress={save} loading={saving} />}>

      {SELF_EDITABLE_FIELDS.map((k) => (
        <Field key={k} label={SELF_FIELD_LABEL[k]}>
          {SELF_DATE_FIELDS.includes(k) ? (
            <DateField value={f[k] || ''} onChange={(v) => set(k, v)} />
          ) : (
            <Input value={f[k] || ''} onChangeText={(v) => set(k, v)}
              multiline={k === 'address'}
              keyboardType={k === 'mobile' || k === 'emergencyPhone' ? 'numeric' : 'default'} />
          )}
        </Field>
      ))}

      {/* Shown but not editable, exactly as the web disables them for a member */}
      <Text style={styles.note}>
        Set by your firm — contact an admin to change these.
      </Text>
      {ADMIN_ONLY_DISABLED.map((k) =>
        readOnly(k === 'joiningDate' ? 'Joining Date'
          : k.charAt(0).toUpperCase() + k.slice(1),
        (member as unknown as Record<string, unknown>)[k] as string))}

      <Text style={styles.note}>
        Your username, password, salary and leave opening balance are not editable here.
        Change your password in Settings → Account.
      </Text>
      {/* Username is displayed for reference only; the field is admin-only on web. */}
      <Text style={styles.note}>Signed in as {user?.username || '—'}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  disabled: {
    height: 44, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#f8fafc',
  },
  disabledText: { ...font.body, color: colors.muted },
  note: {
    ...font.small, fontWeight: '500', color: colors.muted,
    backgroundColor: '#f8fafc', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
});
