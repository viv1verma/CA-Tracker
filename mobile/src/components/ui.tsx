import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

export function Button({
  title, onPress, loading, disabled, variant = 'primary',
}: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  const off = disabled || loading;
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.red : colors.white;
  const fg = variant === 'outline' ? colors.text : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: off ? 0.6 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Banner({ text, tone = 'error' }: { text: string; tone?: 'error' | 'info' }) {
  const bg = tone === 'error' ? '#fef2f2' : colors.primaryLight;
  const bd = tone === 'error' ? '#fecaca' : '#bfdbfe';
  const fg = tone === 'error' ? '#b91c1c' : colors.primaryDark;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: bd }]}>
      <Text style={{ color: fg, ...font.small }}>{text}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      {!!label && <Text style={styles.loadingText}>{label}</Text>}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errTitle}>Something went wrong</Text>
      <Text style={styles.errBody}>{message}</Text>
      {!!onRetry && <View style={{ marginTop: spacing.lg, minWidth: 160 }}><Button title="Try again" onPress={onRetry} variant="outline" /></View>}
    </View>
  );
}

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.phTitle}>{title}</Text>
      <Text style={styles.errBody}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  btn: { height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  btnText: { fontSize: 15, fontWeight: '700' },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.muted, ...font.small },
  errTitle: { ...font.h3, color: colors.text, marginBottom: spacing.xs },
  errBody: { ...font.small, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  phTitle: { ...font.h2, color: colors.text, marginBottom: spacing.sm },
});

/** The status pill from the web table, using the same palette. */
export function StatusPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[pill.wrap, { backgroundColor: bg }]}>
      <Text style={[pill.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ pct, width }: { pct: number; width?: number }) {
  const done = pct >= 100;
  return (
    <View style={[pill.bar, width ? { width } : { flex: 1 }]}>
      <View style={[pill.fill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: done ? colors.green : colors.primary }]} />
    </View>
  );
}

export function EmptyState({ icon, title, note }: { icon: string; title: string; note?: string }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 34, marginBottom: spacing.sm }}>{icon}</Text>
      <Text style={styles.phTitle}>{title}</Text>
      {!!note && <Text style={styles.errBody}>{note}</Text>}
    </View>
  );
}

const pill = StyleSheet.create({
  wrap: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '800' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
