import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { ErrorState, Loading } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme/theme';
import {
  CALENDAR_CAVEAT, CC_MON, LEGEND, catColor, ccUrgency, currentMonth, dayKey,
  fmtDay, itemsOn, shiftMonth, todayKey, upcoming,
  type CalendarItem, type CalendarMonth,
} from './logic';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * pg-compcal — the statutory due-date calendar. Read-only: category chips, a
 * Monday-first month grid with per-day dots and counts, and a list of either the
 * picked day or everything still ahead this month.
 */
export default function ComplianceScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [cal, setCal] = useState<CalendarMonth | null>(null);
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string, opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const data = await api.get<CalendarMonth>(
        `${endpoints.statutoryCalendar}?month=${encodeURIComponent(m)}`,
      );
      setCal(data);
      // Every category starts switched on, then the user's choice sticks.
      setCats((prev) => (prev.size ? prev : new Set(data.categories || [])));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
      setCal(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(month, { spinner: true }); }, [month, load]);

  const toggleCat = (c: string) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const move = (delta: number) => { setDay(null); setMonth((m) => shiftMonth(m, delta)); };
  const goToday = () => { setDay(todayKey()); setMonth(currentMonth()); };

  const detail = useMemo(() => {
    if (!cal) return { title: '', rows: [] as { key: string; o: CalendarItem }[], picked: false };
    if (!day) {
      const rows = upcoming(cal, cats);
      return { title: `STILL DUE THIS MONTH · ${rows.length}`, rows, picked: false };
    }
    const rows = itemsOn(cal, day, cats).map((o) => ({ key: day, o }));
    const d = new Date(`${day}T00:00:00`);
    const title = `${d.getDate()} ${CC_MON[d.getMonth()].toUpperCase()} ${d.getFullYear()} · ${rows.length} DUE`;
    return { title, rows, picked: true };
  }, [cal, day, cats]);

  if (loading) return <Loading label="Loading calendar…" />;
  if (error && !cal) return <ErrorState message={error} onRetry={() => void load(month, { spinner: true })} />;
  if (!cal) return null;

  // The API gives a Sunday-first weekday; the grid is Monday-first.
  const lead = (cal.firstWeekday + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: cal.lastDay }, (_, i) => i + 1),
  ];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(month)}
          colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <Text style={styles.sub}>Statutory due dates — GST, TDS, Income Tax, ROC, PF/ESI</Text>

      {/* Category chips */}
      <View style={styles.cats}>
        {(cal.categories || []).map((c) => {
          const on = cats.has(c);
          const col = catColor(c);
          return (
            <Pressable
              key={c}
              onPress={() => toggleCat(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.cat,
                { borderColor: on ? col : colors.border, backgroundColor: on ? col : colors.white },
              ]}
            >
              <Text style={[styles.catText, { color: on ? colors.white : colors.muted }]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Month grid */}
      <View style={styles.card}>
        <View style={styles.navRow}>
          <Pressable onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="Previous month"
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.navText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{CC_MON[cal.monthNo - 1]} {cal.year}</Text>
          <View style={styles.navRight}>
            <Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="Next month"
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.navText}>›</Text>
            </Pressable>
            <Pressable onPress={goToday} accessibilityRole="button"
              style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.todayText}>Today</Text>
            </Pressable>
          </View>
        </View>

        {/* The weekday header is its own row so it can never wrap. */}
        <View style={styles.headRow}>
          {WEEKDAYS.map((d) => (
            <View key={d} style={styles.headCell}><Text style={styles.headText}>{d}</Text></View>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`b${i}`} style={styles.cellBlank} />;
            const key = dayKey(cal.month, d);
            const items = itemsOn(cal, key, cats);
            const isToday = key === cal.today;
            const selected = key === day;
            const u = ccUrgency(key, cal.today);
            return (
              <Pressable
                key={key}
                onPress={() => items.length && setDay(selected ? null : key)}
                disabled={!items.length}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.cell,
                  !items.length && { opacity: 0.55 },
                  isToday && styles.cellToday,
                  selected && styles.cellSelected,
                ]}
              >
                <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                  {String(d).padStart(2, '0')}
                </Text>
                {items.length > 0 && (
                  <>
                    <View style={styles.dots}>
                      {items.slice(0, 4).map((o, k) => (
                        <View key={k} style={[styles.dot, { backgroundColor: catColor(o.category) }]} />
                      ))}
                    </View>
                    <Text style={[styles.due, { color: u.col }]}>{items.length} DUE</Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          {LEGEND.map((l) => (
            <View key={l.label} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: l.col }]} />
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Detail list */}
      {detail.rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            {detail.picked
              ? `Nothing due on ${fmtDay(day || '')} for the selected categories.`
              : 'Nothing further due this month for the selected categories.'}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.listTitle}>{detail.title}</Text>
          {detail.rows.map((r, i) => {
            const u = ccUrgency(r.key, cal.today);
            const col = catColor(r.o.category);
            return (
              <View key={`${r.key}-${r.o.code}-${i}`} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowDue, { color: u.col }]}>{fmtDay(r.key)}</Text>
                  <View style={[styles.catPill, { backgroundColor: `${col}22` }]}>
                    <Text style={[styles.catPillText, { color: col }]}>{r.o.category}</Text>
                  </View>
                </View>
                <Text style={styles.rowName}>{r.o.name}</Text>
                <Text style={styles.rowMeta}>Period: {r.o.period || '—'}</Text>
                {!!r.o.note && <Text style={styles.rowNote}>{r.o.note}</Text>}
              </View>
            );
          })}
          <Text style={styles.caveat}>{CALENDAR_CAVEAT}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  cat: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  catText: { fontSize: 11, fontWeight: '800' },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn: {
    width: 36, height: 36, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  navText: { fontSize: 18, color: colors.text, marginTop: -2 },
  navRight: { flexDirection: 'row', gap: 6 },
  todayBtn: {
    height: 36, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  todayText: { ...font.small, color: colors.text },
  title: { ...font.h3, color: colors.text, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  headRow: { flexDirection: 'row' },
  headCell: { flex: 1, paddingVertical: 3, alignItems: 'center' },
  headText: { fontSize: 9, fontWeight: '800', color: colors.muted },
  cellBlank: { width: `${100 / 7}%`, minHeight: 62 },
  cell: {
    width: `${100 / 7}%`, minHeight: 62, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, padding: 4, backgroundColor: colors.white,
  },
  cellToday: { borderColor: colors.primary, borderWidth: 2 },
  cellSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryLight },
  dayNum: { fontSize: 11, fontWeight: '700', color: colors.text },
  dayNumToday: { fontWeight: '900', color: colors.primary },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  due: { fontSize: 9, fontWeight: '800', marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10, fontWeight: '800', color: colors.muted },
  listTitle: { ...font.small, color: colors.text, marginBottom: spacing.sm },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowDue: { ...font.small, fontWeight: '800' },
  catPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  catPillText: { fontSize: 9, fontWeight: '800' },
  rowName: { ...font.small, color: colors.text, marginTop: 4 },
  rowMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  rowNote: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3, lineHeight: 15 },
  caveat: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.md, lineHeight: 15 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
});
