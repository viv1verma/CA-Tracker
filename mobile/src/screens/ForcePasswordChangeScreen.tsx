import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button } from '../components/ui';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Shown instead of the app when the signed-in account still carries
 * `mustChangePassword` — an account whose password was chosen by the admin who
 * created it. The navigator mounts this *or* the app, never both, so there is no
 * tab bar, back gesture or deep link around it. Signing out is the only exit.
 */
export default function ForcePasswordChangeScreen() {
  const { user, completeFirstPasswordChange, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = password.length >= 6 && password === confirm && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError('');
    try {
      await completeFirstPasswordChange(password);
      // On success the flag clears and the navigator swaps this screen for the app.
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not set your password. Try again.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>G</Text></View>
        <Text style={styles.title}>Set your password</Text>
        <Text style={styles.subtitle}>
          {user?.name ? `Welcome, ${user.name}. ` : ''}
          This is your first sign-in, so you need to replace the temporary password
          your administrator gave you before you can use the app.
        </Text>

        {!!error && <Banner text={error} />}

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
          onSubmitEditing={submit}
        />

        {password.length > 0 && password.length < 6 && (
          <Text style={styles.hintInline}>Password must be at least 6 characters.</Text>
        )}
        {confirm.length > 0 && confirm !== password && (
          <Text style={styles.hintInline}>Passwords do not match.</Text>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button title="Set password and continue" onPress={submit} loading={busy} disabled={!ready} />
        </View>

        {/* No cancel, no skip and no "Forgot password?" — the only way past this
            screen is to set a password or to leave the account entirely. */}
        <Pressable onPress={() => { void signOut(); }} disabled={busy} hitSlop={8}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
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
    marginTop: spacing.xs, marginBottom: spacing.lg,
  },
  label: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: spacing.xs, marginTop: spacing.md,
  },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.white, color: colors.text, fontSize: 15,
  },
  hintInline: { ...font.tiny, color: colors.red, marginTop: spacing.xs },
  link: {
    ...font.small, color: colors.primary, textAlign: 'center',
    marginTop: spacing.lg, fontWeight: '600',
  },
});
