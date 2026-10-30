import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../api/client';
import { endpoints } from '../api/endpoints';
import { Banner, Button } from '../components/ui';
import { colors, font, radius, spacing } from '../theme/theme';

type Step = 'identifier' | 'code' | 'password' | 'done';

/**
 * Self-service password reset for staff accounts, mirroring the three
 * /api/password-reset endpoints. Client and ITR-party logins are not covered.
 *
 * Rendered by LoginScreen rather than the navigator: the signed-out stack holds
 * a single screen, and `onBack` is all this flow needs to return to it.
 */
export default function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const fail = (e: unknown) =>
    setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    const r = await api.post<{ message?: string }>(endpoints.passwordResetRequest, {
      identifier: identifier.trim(),
    });
    // The reply is deliberately the same whether or not the account exists.
    setNote(r?.message || 'If that account exists and has an e-mail on file, a code has been sent.');
    setCode('');
    setStep('code');
  });

  const verifyCode = () => run(async () => {
    const r = await api.post<{ resetToken: string }>(endpoints.passwordResetVerify, {
      identifier: identifier.trim(), code: code.trim(),
    });
    setResetToken(r.resetToken);
    setStep('password');
  });

  const savePassword = () => run(async () => {
    await api.post(endpoints.passwordResetConfirm, { resetToken, newPassword: password });
    setStep('done');
  });

  const title = step === 'done' ? 'Password updated' : 'Reset password';
  const subtitle =
    step === 'identifier' ? 'Enter your username or e-mail and we’ll send you a 6-digit code.'
    : step === 'code' ? 'Enter the 6-digit code. It expires in 10 minutes.'
    : step === 'password' ? 'Choose a new password for your account.'
    : 'You can now sign in with your new password.';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>G</Text></View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {!!note && step === 'code' && <Banner text={note} tone="info" />}
        {!!error && <Banner text={error} />}

        {step === 'identifier' && (
          <>
            <Text style={styles.label}>Username or e-mail</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={(t) => { setIdentifier(t); if (error) setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="e.g. asha"
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <View style={styles.actions}>
              <Button title="Send code" onPress={sendCode} loading={busy}
                disabled={!identifier.trim() || busy} />
            </View>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={code}
              onChangeText={(t) => { setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); if (error) setError(''); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              onSubmitEditing={verifyCode}
            />
            <View style={styles.actions}>
              <Button title="Verify code" onPress={verifyCode} loading={busy}
                disabled={code.length !== 6 || busy} />
            </View>
            <Pressable onPress={sendCode} disabled={busy} hitSlop={8}>
              <Text style={styles.link}>Send a new code</Text>
            </Pressable>
          </>
        )}

        {step === 'password' && (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="At least 6 characters"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={(t) => { setConfirm(t); if (error) setError(''); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Re-enter the password"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              onSubmitEditing={savePassword}
            />
            {password.length > 0 && password.length < 6 && (
              <Text style={styles.hintInline}>Password must be at least 6 characters.</Text>
            )}
            {confirm.length > 0 && confirm !== password && (
              <Text style={styles.hintInline}>Passwords do not match.</Text>
            )}
            <View style={styles.actions}>
              <Button title="Save password" onPress={savePassword} loading={busy}
                disabled={password.length < 6 || password !== confirm || busy} />
            </View>
          </>
        )}

        {step === 'done' && (
          <View style={styles.actions}>
            <Button title="Return to sign in" onPress={onBack} />
          </View>
        )}

        {step !== 'done' && (
          <Pressable onPress={onBack} disabled={busy} hitSlop={8}>
            <Text style={styles.link}>Back to sign in</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  logo: {
    width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.md,
  },
  logoText: { color: colors.white, fontSize: 30, fontWeight: '900' },
  title: { ...font.h1, color: colors.text, textAlign: 'center' },
  subtitle: {
    ...font.small, color: colors.muted, textAlign: 'center',
    marginTop: spacing.xs, marginBottom: spacing.xl,
  },
  label: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: spacing.xs, marginTop: spacing.md,
  },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.white, color: colors.text, fontSize: 15,
  },
  code: { letterSpacing: 8, textAlign: 'center', fontSize: 20 },
  hintInline: { ...font.tiny, color: colors.red, marginTop: spacing.xs },
  actions: { marginTop: spacing.lg },
  link: {
    ...font.small, color: colors.primary, textAlign: 'center',
    marginTop: spacing.lg, fontWeight: '600',
  },
});
