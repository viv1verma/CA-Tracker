import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Field, Input } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { passwordError } from './logic';

/**
 * The Account tab: change password, and the push-notification block.
 *
 * changePassword() on the web verifies the current password with POST /login and
 * then PUTs the new one. That login bumps the account's session counter, so the
 * follow-up PUT carries a superseded token — which is why we re-authenticate
 * through signIn(), adopting the token the same call already returns. The
 * validation rules are the web's, unchanged.
 */
export default function AccountTab() {
  const { user, signIn } = useAuth();
  const { showToast } = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [con, setCon] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const change = async () => {
    const err = passwordError(cur, nw, con);
    if (err) { showToast(err, 'error'); return; }
    if (!user?.username || !user?.id) return;
    setSaving(true);
    try {
      // Verify the current password. A wrong one throws here, exactly as the
      // web's POST /login does, and the existing session is left untouched.
      await signIn(user.username, cur);
      await api.put(endpoints.user(user.id), { password: nw });
      showToast('Password changed ✓');
      setCur(''); setNw(''); setCon('');
    } catch (e) {
      showToast(e instanceof ApiError && e.kind !== 'auth'
        ? e.message : 'Current password incorrect', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ ok?: boolean; message?: string }>(endpoints.pushTest, {});
      showToast(r?.ok ? '✅ Test sent! Check your device.' : `❌ ${r?.message || 'No device subscribed'}`,
        r?.ok ? 'success' : 'error');
    } catch (e) {
      showToast(`Test failed: ${e instanceof ApiError ? e.message : 'unknown'}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <View style={styles.card}>
        <Field label="Current Password">
          <Input value={cur} onChangeText={setCur} placeholder="Current password" secure />
        </Field>
        <Field label="New Password">
          <Input value={nw} onChangeText={setNw} placeholder="Min 6 characters" secure />
        </Field>
        <Field label="Confirm Password">
          <Input value={con} onChangeText={setCon} placeholder="Repeat new password" secure />
        </Field>
        <Button title="Update Password" onPress={change} loading={saving} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔔 Push Notifications</Text>
        <View style={styles.info}>
          <Text style={styles.infoText}>
            The server delivers push through the browser's Web Push (VAPID) service, which
            cannot reach an Android app. Enabling notifications on this device needs the
            additive Expo-token branch recorded as backend change B-01, which has not been
            approved — so the Enable button is not offered here rather than pretending to work.
          </Text>
        </View>
        <Button title="🧪 Send Test Notification" onPress={sendTest} variant="outline" loading={testing} />
        <Text style={styles.note}>
          Sends to whatever browser subscriptions this account already has.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  cardTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  info: {
    backgroundColor: '#eff6ff', borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoText: { ...font.small, fontWeight: '500', color: '#1e40af', lineHeight: 19 },
  note: { ...font.tiny, fontWeight: '500', color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});
