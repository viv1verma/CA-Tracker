import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../../theme/theme';
import { barColor } from './logic';

/** _rStat() — the stat strip above several reports. */
export function RStats({ items }: { items: { l: string; v: string | number; c?: string }[] }) {
  return (
    <View style={styles.stats}>
      {items.map((s) => (
        <View key={s.l} style={styles.stat}>
          <Text style={[styles.statValue, { color: s.c || colors.primary }]}>{s.v}</Text>
          <Text style={styles.statLabel}>{s.l}</Text>
        </View>
      ))}
    </View>
  );
}

/** _rCard() — a titled card with an optional right-hand subtitle. */
export function RCard({
  title, sub, children,
}: {
  title: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!sub && <Text style={styles.cardSub}>{sub}</Text>}
      </View>
      <View>{children}</View>
    </View>
  );
}

/** _rBar() — the percentage bar with its three-band colour. */
export function RBar({ pct }: { pct: number }) {
  const c = barColor(pct);
  return (
    <View style={styles.barRow}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: c }]} />
      </View>
      <Text style={[styles.barPct, { color: c }]}>{pct}%</Text>
    </View>
  );
}

/**
 * A horizontally scrollable table. The web's tables have a min-width and scroll
 * inside their card; on a phone the same content scrolls sideways here.
 */
export function RTable({
  head, widths, children,
}: {
  head: string[]; widths: number[]; children: React.ReactNode;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={styles.headRow}>
          {head.map((h, i) => (
            <Text key={h + i} style={[styles.headCell, { width: widths[i] }]}>{h}</Text>
          ))}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function RRow({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <View style={[styles.row, index % 2 === 1 && { backgroundColor: '#fafafa' }]}>{children}</View>
  );
}

export function RCell({
  width, children, align = 'left', style,
}: {
  width: number; children: React.ReactNode; align?: 'left' | 'center' | 'right';
  style?: object;
}) {
  return (
    <View style={[styles.cell, { width }]}>
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={[styles.cellText, { textAlign: align }, style]}>{children}</Text>
        : children}
    </View>
  );
}

/** A pill matching the web's rounded status badges. */
export function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export function RMessage({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  return (
    <Text style={[styles.message, tone === 'error' && { color: colors.red }]}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flexGrow: 1, minWidth: 100, backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: 21, fontWeight: '900' },
  statLabel: { ...font.tiny, color: colors.muted, marginTop: 3, textTransform: 'uppercase' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md,
  },
  cardHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, backgroundColor: '#f9fafb',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cardTitle: { ...font.h3, color: colors.text, flexShrink: 1 },
  cardSub: { ...font.small, fontWeight: '500', color: colors.muted },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barPct: { ...font.small, fontWeight: '800' },

  headRow: {
    flexDirection: 'row', backgroundColor: '#1e3a8a',
  },
  headCell: {
    ...font.tiny, color: colors.white, fontWeight: '800',
    paddingVertical: 9, paddingHorizontal: 8,
  },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' },
  cell: { paddingVertical: 9, paddingHorizontal: 8, justifyContent: 'center' },
  cellText: { ...font.small, color: colors.text },

  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { ...font.tiny, fontWeight: '800' },

  message: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
