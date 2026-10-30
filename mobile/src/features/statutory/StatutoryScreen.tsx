import * as Print from 'expo-print';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { PasteImportSheet, UpdateFormSheet } from './sheets';
import {
  buildSummaryHtml, crux, fetchCategoryFor, fmtDate, needsBrief, suCatColor, suCounts, suRows,
  type StatutoryPayload, type StatutoryUpdate,
} from './logic';

/**
 * pg-statutory — the firm's GST / Income-tax / ROC update log: category tabs,
 * per-row selection, auto-fetch, brief back-fill, manual entry, paste import,
 * and a printable summary that can notify all staff.
 */
export default function StatutoryScreen() {
  const { showToast } = useToast();

  const [payload, setPayload] = useState<StatutoryPayload | null>(null);
  const [cat, setCat] = useState('GST');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'fetch' | 'enrich' | 'summary'>('');
  const [formFor, setFormFor] = useState<StatutoryUpdate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const autoBriefDone = useRef(false);

  const load = useCallback(async (opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const r = await api.get<StatutoryPayload>(endpoints.statutoryUpdates);
      setPayload(r);
      // Keep the current tab if it still exists, else fall back to the first.
      setCat((c) => ((r.categories || []).includes(c) ? c : (r.categories || ['GST'])[0]));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load({ spinner: true }); }, [load]);

  const rows = useMemo(() => suRows(payload?.updates || [], cat), [payload, cat]);
  const counts = useMemo(() => suCounts(payload?.updates || []), [payload]);

  /**
   * suEnrich(): back-fill short briefs in server-side batches, looping until
   * nothing is left. suAutoBrief() runs this once per load when briefs are missing.
   */
  const enrich = useCallback(async (silent = false) => {
    setBusy('enrich');
    let filled = 0;
    try {
      for (let round = 0; round < 12; round++) {
        const r = await api.post<{ ok: boolean; filled: number; remaining: number; scanned: number }>(
          endpoints.statutoryEnrich, { cap: 20 }, { timeoutMs: 60000 },
        );
        if (!r?.ok) {
          if (!silent) showToast('Could not fill briefs right now — try again shortly.', 'error');
          break;
        }
        filled += r.filled || 0;
        if (!r.remaining || r.scanned === 0 || r.filled === 0) break;
      }
      await load();
      if (!silent) {
        showToast(filled
          ? `Filled briefs on ${filled} update(s) ✓`
          : 'No new briefs could be read — sources may be unreachable.');
      }
    } catch (e) {
      if (!silent) showToast(e instanceof ApiError ? e.message : 'Fill briefs failed.', 'error');
    } finally {
      setBusy('');
    }
  }, [load, showToast]);

  // suAutoBrief(): at most once per load, and only if something is actually missing.
  useEffect(() => {
    if (autoBriefDone.current || !payload) return;
    if (!needsBrief(rows)) return;
    autoBriefDone.current = true;
    const t = setTimeout(() => { void enrich(true); }, 400);
    return () => clearTimeout(t);
  }, [payload, rows, enrich]);

  const doFetch = async () => {
    const c = fetchCategoryFor(cat);
    setBusy('fetch');
    try {
      const r = await api.post<{ ok: boolean; added?: number; updated?: number; error?: string }>(
        endpoints.statutoryFetch, { category: c }, { timeoutMs: 30000 },
      );
      if (r.ok) {
        await load();
        const src = c === 'Income Tax' ? 'Income Tax portal' : 'TaxGuru';
        const bits: string[] = [];
        if (r.added) bits.push(`${r.added} new`);
        if (r.updated) bits.push(`${r.updated} updated`);
        showToast(bits.length ? `${src}: ${bits.join(', ')}` : `Up to date — no new ${c} updates`);
      } else {
        showToast(r.error || 'Could not fetch right now — use Paste, or try again.', 'error');
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Fetch failed — use Paste from portal.', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = (u: StatutoryUpdate) => {
    Alert.alert('Delete update', 'Delete this update?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.statutoryUpdate(u.id));
            setSel((prev) => { const n = new Set(prev); n.delete(u.id); return n; });
            await load();
            showToast('Deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  /**
   * suGenerateSummary(). The web opens the digest in a new tab and then asks
   * whether to notify staff; here it goes to the system print/share dialogue,
   * and the same confirmation follows.
   */
  const summarise = async () => {
    const chosen = sel.size ? rows.filter((u) => sel.has(u.id)) : rows;
    if (!chosen.length) { showToast('No updates to summarise', 'error'); return; }
    setBusy('summary');
    try {
      await Print.printAsync({ html: buildSummaryHtml(cat, chosen) });
    } catch {
      // A cancelled print dialogue is not an error worth shouting about.
    } finally {
      setBusy('');
    }
    Alert.alert(
      'Notify staff?',
      `Send a notification about these ${chosen.length} update(s) to all staff now?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Notify',
          onPress: async () => {
            try {
              const r = await api.post<{ notified: number }>(endpoints.statutoryNotify, {
                title: `📢 ${cat} Statutory Updates`,
                message: `${chosen.length} ${cat} update(s) circulated — see the Statutory Updates tab.`,
              });
              showToast(`Notified ${r.notified} staff ✓`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not notify', 'error');
            }
          },
        },
      ],
    );
  };

  const toggle = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const allSelected = rows.length > 0 && rows.every((u) => sel.has(u.id));
  const toggleAll = () => {
    setSel((prev) => {
      const n = new Set(prev);
      if (allSelected) rows.forEach((u) => n.delete(u.id));
      else rows.forEach((u) => n.add(u.id));
      return n;
    });
  };

  if (loading) return <Loading label="Loading statutory updates…" />;
  if (error && !payload) return <ErrorState message={error} onRetry={() => void load({ spinner: true })} />;
  if (!payload) return null;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load()}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sub}>
          GST, Income-tax &amp; ROC notifications — circulate to the team
        </Text>

        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {(payload.categories || []).map((c) => {
            const on = c === cat;
            const col = suCatColor(c);
            return (
              <Pressable
                key={c}
                onPress={() => { setCat(c); setSel(new Set()); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && { backgroundColor: col }]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {c}{counts[c] ? ` (${counts[c]})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Toolbar */}
        <Text style={styles.selInfo}>
          {sel.size ? `${sel.size} selected for summary` : `${rows.length} update(s) in ${cat}`}
        </Text>
        <View style={styles.actions}>
          <Act label={busy === 'fetch' ? 'Fetching…' : '⟳ Fetch latest'} onPress={doFetch} disabled={!!busy} />
          <Act label="+ Add update" onPress={() => { setFormFor(null); setFormOpen(true); }} disabled={!!busy} />
          <Act label="📋 Paste" onPress={() => setPasteOpen(true)} disabled={!!busy} />
          <Act label={busy === 'enrich' ? 'Filling…' : '🧾 Fill briefs'} onPress={() => void enrich()} disabled={!!busy} />
          <Act label="📄 Summary & notify" onPress={summarise} disabled={!!busy} primary />
        </View>

        {rows.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>
              No {cat} updates yet. Use Paste from portal or + Add update.
            </Text>
          </View>
        ) : (
          <>
            <Pressable onPress={toggleAll} accessibilityRole="button" style={styles.selectAll}>
              <View style={[styles.box, allSelected && styles.boxOn]}>
                {allSelected && <Text style={styles.tick}>✓</Text>}
              </View>
              <Text style={styles.selectAllText}>Select all in {cat}</Text>
            </Pressable>

            {rows.map((u) => {
              const on = sel.has(u.id);
              const brief = crux(u);
              return (
                <View key={u.id} style={[styles.card, on && styles.cardOn]}>
                  <View style={styles.rowTop}>
                    <Pressable onPress={() => toggle(u.id)} accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }} hitSlop={8}>
                      <View style={[styles.box, on && styles.boxOn]}>
                        {on && <Text style={styles.tick}>✓</Text>}
                      </View>
                    </Pressable>
                    <Text style={styles.date}>{fmtDate(u.date)}</Text>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => { setFormFor(u); setFormOpen(true); }}
                      accessibilityRole="button" hitSlop={6} style={styles.iconBtn}>
                      <Text style={styles.iconText}>✏️</Text>
                    </Pressable>
                    <Pressable onPress={() => remove(u)} accessibilityRole="button" hitSlop={6}
                      style={[styles.iconBtn, styles.iconDel]}>
                      <Text style={styles.iconText}>🗑</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.title}>{u.title}</Text>
                  {!!u.link && (
                    <Pressable onPress={() => void Linking.openURL(u.link as string)}
                      accessibilityRole="link" hitSlop={6}>
                      <Text style={styles.link} numberOfLines={1}>↗ Open source</Text>
                    </Pressable>
                  )}
                  {brief
                    ? <Text style={styles.brief} numberOfLines={3}>{brief}</Text>
                    : <Text style={styles.noBrief}>No brief yet — tap “Fill briefs”.</Text>}
                  {!!u.source && u.source !== 'Manual' && (
                    <Text style={styles.source}>via {u.source}</Text>
                  )}
                  <Text style={styles.ref}>{u.refNo || '—'}</Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <UpdateFormSheet
        record={formFor}
        categories={payload.categories || ['GST']}
        defaultCategory={cat}
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(c) => { setCat(c); void load(); }}
      />
      <PasteImportSheet
        visible={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onImported={() => { setCat('GST'); void load(); }}
      />
    </View>
  );
}

function Act({
  label, onPress, disabled, primary,
}: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.act,
        primary && { backgroundColor: colors.primary, borderColor: colors.primary },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.actText, primary && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  tabs: { gap: 6, paddingVertical: 3 },
  tab: {
    height: 36, paddingHorizontal: 14, borderRadius: 7,
    justifyContent: 'center', backgroundColor: '#f3f4f6',
  },
  tabText: { ...font.small, color: colors.muted },
  tabTextOn: { color: colors.white, fontWeight: '800' },
  selInfo: { ...font.small, color: colors.muted, marginTop: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm, marginBottom: spacing.md },
  act: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center',
  },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, minHeight: 40 },
  selectAllText: { ...font.small, color: colors.muted },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardOn: { borderColor: colors.primary, borderWidth: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  date: { ...font.small, color: colors.text },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  iconBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.white,
  },
  iconDel: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  iconText: { fontSize: 12 },
  title: { ...font.small, color: colors.text, lineHeight: 19, marginTop: spacing.sm },
  link: { ...font.tiny, color: colors.primary, marginTop: 3 },
  brief: { ...font.tiny, color: '#475569', fontWeight: '500', lineHeight: 17, marginTop: 4 },
  noBrief: { ...font.tiny, color: '#cbd5e1', fontStyle: 'italic', fontWeight: '500', marginTop: 3 },
  source: { fontSize: 9, fontWeight: '700', color: '#94a3b8', marginTop: 2 },
  ref: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 4 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
});
