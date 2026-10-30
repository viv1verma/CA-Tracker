import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Banner, Button } from '../components/ui';
import { API_BASE_URL } from '../config/env';
import { colors, font, radius, spacing } from '../theme/theme';
import ForgotPasswordScreen from './ForgotPasswordScreen';

export default function LoginScreen() {
  const { signIn, signingIn, error, endedReason, clearError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !signingIn;

  const submit = async () => {
    if (!canSubmit) return;
    try { await signIn(username, password); } catch { /* surfaced via `error` */ }
  };

  if (forgot) return <ForgotPasswordScreen onBack={() => setForgot(false)} />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoText}>G</Text></View>
        <Text style={styles.title}>GARP Tracker</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {!!endedReason && <Banner text={endedReason} tone="info" />}
        {!!error && <Banner text={error} />}

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={(t) => { setUsername(t); if (error) clearError(); }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. asha"
          placeholderTextColor={colors.muted}
          returnKeyType="next"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(t) => { setPassword(t); if (error) clearError(); }}
          secureTextEntry
          autoCapitalize="none"
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <View style={{ marginTop: spacing.lg }}>
          <Button title="Sign in" onPress={submit} loading={signingIn} disabled={!canSubmit} />
        </View>

        <Pressable onPress={() => { if (error) clearError(); setForgot(true); }} hitSlop={8}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>

        <Text style={styles.hint}>Connected to {API_BASE_URL}</Text>
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
  subtitle: { ...font.small, color: colors.muted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
  label: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.white, color: colors.text, fontSize: 15,
  },
  link: { ...font.small, color: colors.primary, textAlign: 'center', marginTop: spacing.lg, fontWeight: '600' },
  hint: { ...font.tiny, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
});
