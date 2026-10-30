import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../../theme/theme';
import { lakh, type BarRow } from './logic';

/**
 * cbMiniBars() — the grouped bar chart the overview draws for both trends.
 *
 * The web emits an SVG; there is no SVG renderer in this app, so the same chart
 * is composed from views: four gridlines with ₹-lakh labels on the left, one
 * group of coloured bars per bucket, the bucket label underneath. Identical
 * data, colours, scale and legend — the web's per-bar tooltip becomes a value
 * printed above each bar, which a phone can show without a hover.
 */
const CHART_H = 130;

export default function MiniBars({ rows }: { rows: BarRow[] }) {
  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No data</Text>
      </View>
    );
  }
  // max=Math.max(1,...) — the web's guard against an all-zero window.
  const max = Math.max(1, ...rows.flatMap((r) => r.bars.map((b) => b[1])));
  // The web labels its gridlines in hundred-thousands, i.e. lakhs.
  const gridVals = [3, 2, 1, 0].map((i) => (max * i) / 3);

  return (
    <View style={styles.wrap}>
      <View style={styles.axis}>
        {gridVals.map((v, i) => (
          <Text key={i} style={styles.axisText}>{(v / 100000).toFixed(0)}</Text>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <View>
          <View style={styles.plot}>
            {gridVals.map((_v, i) => (
              <View key={i} style={[styles.grid, { top: (CHART_H / 3) * i }]} />
            ))}
            {rows.map((r, i) => (
              <View key={`${r.label}-${i}`} style={styles.group}>
                {r.bars.map(([col, val], j) => (
                  <View key={j} style={styles.barCol}>
                    {val > 0 && <Text style={styles.barVal}>{lakh(val)}</Text>}
                    <View style={[styles.bar, {
                      height: Math.max(val > 0 ? 2 : 0, (val / max) * (CHART_H - 14)),
                      backgroundColor: col,
                    }]} />
                  </View>
                ))}
              </View>
            ))}
          </View>
          <View style={styles.labels}>
            {rows.map((r, i) => (
              <Text key={`${r.label}-${i}`} style={styles.label} numberOfLines={1}>{r.label}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const GROUP_W = 74;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start' },
  axis: { height: CHART_H, justifyContent: 'space-between', width: 26, paddingRight: 4 },
  axisText: { ...font.tiny, fontWeight: '500', color: '#9ca3af', textAlign: 'right' },

  plot: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end' },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#f0f0f0' },
  group: {
    width: GROUP_W, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'flex-end', gap: 5,
  },
  barCol: { alignItems: 'center' },
  barVal: { ...font.tiny, fontWeight: '700', color: colors.muted, marginBottom: 1 },
  bar: { width: 20, borderTopLeftRadius: 2, borderTopRightRadius: 2 },

  labels: { flexDirection: 'row', marginTop: 4 },
  label: { width: GROUP_W, ...font.tiny, fontWeight: '600', color: '#374151', textAlign: 'center' },

  empty: { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...font.small, color: colors.muted },
});
