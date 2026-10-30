import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isHOContext } from '../../auth/permissions';
import { Select } from '../../components/form';
import { Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import {
  ImportTendersSheet, LeadDetailSheet, LeadFormSheet, TenderDetailSheet, TenderFormSheet,
} from './sheets';
import {
  ELIG_FILTERS, ELIG_COLOR, REPORT_SCOPES, TENDER_CATEGORIES, blockerCounts, dueDisplay,
  eligVerdict, eventText, filterTenders, fmtDate, fmtMoney, latestEvent, leadColor,
  overdueList, reportRows, tdDaysOverdue, tenderColor, type Lead, type Tender,
} from './logic';

type Tab = 'private' | 'govt' | 'overdue' | 'report';

/**
 * pg-bizdev — leads and tenders. Loading only GETs; every write is behind an
 * explicit control, including the long-running PDF reads and the ICAI import.
 */
export default function BizDevScreen() {
  const { user, branch } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('private');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<string[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [tenderStatuses, setTenderStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tendersLoaded, setTendersLoaded] = useState(false);

  const [leadFilter, setLeadFilter] = useState('all');
  const [cat, setCat] = useState('psu_company');
  const [tdStatus, setTdStatus] = useState('all');
  const [elig, setElig] = useState('all');
  const [search, setSearch] = useState('');
  const [ovdCat, setOvdCat] = useState('all');
  const [scope, setScope] = useState('blocked');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');

  const [leadForm, setLeadForm] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [leadDetail, setLeadDetail] = useState<Lead | null>(null);
  const [tenderForm, setTenderForm] = useState<{ open: boolean; tender: Tender | null }>({ open: false, tender: null });
  const [tenderDetail, setTenderDetail] = useState<Tender | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  /** Tenders, Overdue and the report are Head-Office functions. */
  const hoCtx = isHOContext(branch);

  const loadLeads = useCallback(async (opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    try {
      const r = await api.get<{ leads: Lead[]; statuses: string[] }>(endpoints.leads);
      setLeads(r.leads || []);
      setLeadStatuses(r.statuses || []);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not load leads', 'error');
    } finally { setLoading(false); setRefreshing(false); }
  }, [showToast]);

  const loadTenders = useCallback(async () => {
    try {
      const r = await api.get<{ tenders: Tender[]; statuses: string[] }>(endpoints.tenders);
      setTenders(r.tenders || []);
      setTenderStatuses(r.statuses || []);
      setTendersLoaded(true);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not load tenders', 'error');
    }
  }, [showToast]);

  useEffect(() => { void loadLeads({ spinner: true }); }, [loadLeads]);

  // Tenders load the first time a tender-backed tab is opened, as the web does.
  useEffect(() => {
    if (tab !== 'private' && !tendersLoaded) void loadTenders();
  }, [tab, tendersLoaded, loadTenders]);

  const shownLeads = useMemo(
    () => (leadFilter === 'all' ? leads : leads.filter((l) => l.status === leadFilter)),
    [leads, leadFilter],
  );
  const shownTenders = useMemo(
    () => filterTenders(tenders, cat, tdStatus, elig, search),
    [tenders, cat, tdStatus, elig, search],
  );
  const overdue = useMemo(() => overdueList(tenders, ovdCat), [tenders, ovdCat]);
  const report = useMemo(() => reportRows(tenders, scope), [tenders, scope]);
  const blockers = useMemo(() => blockerCounts(report), [report]);

  const leadCounts = useMemo(() => {
    const c: Record<string, number> = {};
    leadStatuses.forEach((s) => { c[s] = 0; });
    leads.forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [leads, leadStatuses]);

  const toggleSel = (id: string) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const bulkDelete = () => {
    const ids = [...sel];
    if (!ids.length) return;
    Alert.alert('Delete tenders', `Delete ${ids.length} tender(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(endpoints.tendersBulkDelete, { ids });
            setSel(new Set());
            await loadTenders();
            showToast(`${ids.length} deleted`);
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  /** readAllTenders(): kick off the batch, then poll the progress endpoint. */
  const readAllPdfs = () => {
    Alert.alert(
      'Read all tender PDFs',
      'This reads every imported tender PDF and re-checks eligibility. It can take a while.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setBusy('analyse');
            try {
              await api.post(endpoints.tenderAnalyseAll, {}, { timeoutMs: 60000 });
              for (let i = 0; i < 60; i++) {
                const p = await api.get<{ running?: boolean; done?: number; total?: number }>(
                  endpoints.tenderAnalyseProgress,
                );
                if (!p.running) break;
                setBusy(`analyse:${p.done || 0}/${p.total || 0}`);
                await new Promise((r) => setTimeout(r, 2000));
              }
              await loadTenders();
              showToast('PDF read complete');
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not read PDFs', 'error');
            } finally { setBusy(''); }
          },
        },
      ],
    );
  };

  const dedupe = () => {
    Alert.alert('Remove duplicates', 'Remove duplicate imported tenders?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy('dedupe');
          try {
            const r = await api.post<{ removed?: number }>(endpoints.tenderDedupe, {});
            await loadTenders();
            showToast(`Removed ${r.removed || 0} duplicate(s)`);
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not dedupe', 'error');
          } finally { setBusy(''); }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Loading business development…" />;

  const TABS: { value: Tab; label: string; ho?: boolean }[] = [
    { value: 'private', label: '🏢 Private' },
    { value: 'govt', label: '🏛 Tenders', ho: true },
    { value: 'overdue', label: '⚠ Overdue', ho: true },
    { value: 'report', label: '📋 Report', ho: true },
  ];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void loadLeads(); if (tendersLoaded) void loadTenders(); }}
            colors={[colors.primary]} tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.sub}>Track leads &amp; tenders — visible to partners &amp; admin</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.filter((t) => !t.ho || hoCtx).map((t) => {
            const on = t.value === tab;
            return (
              <Pressable key={t.value} onPress={() => setTab(t.value)} accessibilityRole="button"
                accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Private companies ── */}
        {tab === 'private' && (
          <>
            <View style={styles.toolbar}>
              <View style={{ flex: 1 }}>
                <Select value={leadFilter} placeholder="All Statuses"
                  options={[{ value: 'all', label: 'All Statuses' },
                    ...leadStatuses.map((s) => ({ value: s, label: s }))]}
                  onChange={setLeadFilter} />
              </View>
              <Pressable onPress={() => setLeadForm({ open: true, lead: null })}
                accessibilityRole="button" style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add Lead</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{leads.length}</Text>
                <Text style={styles.statLabel}>TOTAL LEADS</Text>
              </View>
              {leadStatuses.map((s) => {
                const [, fg] = leadColor(s);
                return (
                  <View key={s} style={styles.stat}>
                    <Text style={[styles.statValue, { color: fg }]}>{leadCounts[s] || 0}</Text>
                    <Text style={styles.statLabel}>{s.toUpperCase()}</Text>
                  </View>
                );
              })}
            </ScrollView>

            {shownLeads.length === 0 ? (
              <Empty text='No leads yet. Tap "+ Add Lead" to add one.' />
            ) : shownLeads.map((l) => {
              const [bg, fg] = leadColor(l.status);
              const ev = latestEvent(l);
              return (
                <Pressable key={l.id} onPress={() => setLeadDetail(l)} accessibilityRole="button"
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{l.name}</Text>
                    <View style={[styles.pill, { backgroundColor: bg }]}>
                      <Text style={[styles.pillText, { color: fg }]}>{l.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>
                    {l.poc || '—'}{l.pocDesignation ? ` · ${l.pocDesignation}` : ''}
                  </Text>
                  {ev ? (
                    <>
                      <Text style={styles.eventText} numberOfLines={2}>{eventText(ev)}</Text>
                      <Text style={styles.eventBy}>{ev.byName || ''} · {fmtDate(ev.date)}</Text>
                    </>
                  ) : <Text style={styles.noEvent}>No events yet</Text>}
                </Pressable>
              );
            })}
            <Text style={styles.hint}>Tap a lead to update its status and see the full trail.</Text>
          </>
        )}

        {/* ── Government tenders ── */}
        {tab === 'govt' && (
          <>
            <View style={styles.segment}>
              {TENDER_CATEGORIES.map((c) => {
                const on = c.value === cat;
                return (
                  <Pressable key={c.value} onPress={() => { setCat(c.value); setSel(new Set()); }}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={[styles.segBtn, on && styles.segBtnOn]}>
                    <Text style={[styles.segText, on && styles.segTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput value={search} onChangeText={setSearch}
                placeholder="Search tenders (name, ref, work, location…)"
                placeholderTextColor={colors.muted} style={styles.search} returnKeyType="search" />
              {!!search && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Text style={styles.clear}>✕</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.toolbar}>
              <View style={{ flex: 1 }}>
                <Select value={tdStatus} placeholder="All Statuses"
                  options={[{ value: 'all', label: 'All Statuses' },
                    ...tenderStatuses.map((s) => ({ value: s, label: s }))]}
                  onChange={setTdStatus} />
              </View>
              <View style={{ flex: 1 }}>
                <Select value={elig} placeholder="Eligibility" options={ELIG_FILTERS} onChange={setElig} />
              </View>
            </View>

            <View style={styles.actions}>
              <Act label="🔍 Read all PDFs" onPress={readAllPdfs} disabled={!!busy} />
              <Act label="🧹 Duplicates" onPress={dedupe} disabled={!!busy} />
              <Act label="⬇ ICAI" onPress={() => setImportOpen(true)} disabled={!!busy} />
              <Act label="+ Add Tender" onPress={() => setTenderForm({ open: true, tender: null })} disabled={!!busy} />
              {sel.size > 0 && <Act label={`🗑 Delete (${sel.size})`} onPress={bulkDelete} danger />}
            </View>
            {busy.startsWith('analyse') && (
              <Text style={styles.progress}>Reading tender PDFs… {busy.split(':')[1] || ''}</Text>
            )}

            {shownTenders.length === 0 ? (
              <Empty text='No tenders in this category yet. Tap "+ Add Tender" to add one.' />
            ) : shownTenders.map((t) => <TenderCard key={t.id} t={t}
              selected={sel.has(t.id)} onToggle={() => toggleSel(t.id)} onOpen={() => setTenderDetail(t)} />)}
            <Text style={styles.hint}>
              Tap a tender for details and the trail. Long-press to select for deletion.
            </Text>
          </>
        )}

        {/* ── Overdue ── */}
        {tab === 'overdue' && (
          <>
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Tenders whose due date has passed and we have not bid. Once a tender is marked
                applied — application date filled or status moved past “Identified” — it leaves
                this list automatically.
              </Text>
            </View>
            <View style={styles.toolbar}>
              <View style={{ flex: 1 }}>
                <Select value={ovdCat} placeholder="All categories"
                  options={[{ value: 'all', label: 'All categories' }, ...TENDER_CATEGORIES]}
                  onChange={setOvdCat} />
              </View>
              <Text style={styles.count}>{overdue.length} overdue</Text>
            </View>
            {overdue.length === 0 ? (
              <Empty text="Nothing overdue — every passed tender has been actioned." />
            ) : overdue.map((t) => {
              const days = tdDaysOverdue(t);
              return (
                <Pressable key={t.id} onPress={() => setTenderDetail(t)} accessibilityRole="button"
                  style={({ pressed }) => [styles.card, styles.cardOverdue, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{t.psuName}</Text>
                    <Text style={styles.overdueDays}>{days}d overdue</Text>
                  </View>
                  <Text style={styles.cardMeta}>{t.tenderRef || '—'}</Text>
                  <Text style={styles.cardMeta}>Due {fmtDate(t.dueDate)} · {t.natureOfWork || '—'}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {/* ── Ineligibility report ── */}
        {tab === 'report' && (
          <>
            <View style={styles.toolbar}>
              <View style={{ flex: 1 }}>
                <Select value={scope} placeholder="Scope" options={REPORT_SCOPES} onChange={setScope} />
              </View>
              <Text style={styles.count}>{report.length} shown</Text>
            </View>

            {blockers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.blockTitle}>Most common blockers</Text>
                {blockers.slice(0, 8).map((b) => (
                  <View key={b.reason} style={styles.blockerRow}>
                    <Text style={styles.blockerText} numberOfLines={2}>{b.reason}</Text>
                    <Text style={styles.blockerCount}>{b.count}</Text>
                  </View>
                ))}
              </View>
            )}

            {report.length === 0 ? (
              <Empty text="Nothing to report for this scope." />
            ) : report.map((t) => {
              const v = eligVerdict(t);
              const c = ELIG_COLOR[v] || ['#f3f4f6', '#6b7280'];
              return (
                <Pressable key={t.id} onPress={() => setTenderDetail(t)} accessibilityRole="button"
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{t.psuName}</Text>
                    <View style={[styles.pill, { backgroundColor: c[0] }]}>
                      <Text style={[styles.pillText, { color: c[1] }]}>{v || 'Not read'}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{t.tenderRef || '—'} · Due {fmtDate(t.dueDate)}</Text>
                  {(t.eligibility?.blockers || t.eligibility?.reasons || []).slice(0, 3).map((r, i) => (
                    <Text key={i} style={styles.reason}>• {r}</Text>
                  ))}
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      <LeadFormSheet
        lead={leadForm.lead}
        statuses={leadStatuses}
        visible={leadForm.open}
        onClose={() => setLeadForm({ open: false, lead: null })}
        onSaved={() => void loadLeads()}
      />
      <LeadDetailSheet
        lead={leadDetail}
        statuses={leadStatuses}
        visible={!!leadDetail}
        onClose={() => setLeadDetail(null)}
        onChanged={(u) => {
          setLeads((prev) => prev.map((x) => (x.id === u.id ? u : x)));
          setLeadDetail(u);
        }}
        onEdit={() => { const l = leadDetail; setLeadDetail(null); setLeadForm({ open: true, lead: l }); }}
        onDeleted={(id) => setLeads((prev) => prev.filter((x) => x.id !== id))}
      />
      <TenderFormSheet
        tender={tenderForm.tender}
        statuses={tenderStatuses}
        defaultCategory={cat}
        visible={tenderForm.open}
        onClose={() => setTenderForm({ open: false, tender: null })}
        onSaved={() => void loadTenders()}
      />
      <TenderDetailSheet
        tender={tenderDetail}
        statuses={tenderStatuses}
        visible={!!tenderDetail}
        onClose={() => setTenderDetail(null)}
        onChanged={(u) => {
          setTenders((prev) => prev.map((x) => (x.id === u.id ? u : x)));
          setTenderDetail(u);
        }}
        onEdit={() => { const t = tenderDetail; setTenderDetail(null); setTenderForm({ open: true, tender: t }); }}
        onDeleted={(id) => setTenders((prev) => prev.filter((x) => x.id !== id))}
      />
      <ImportTendersSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void loadTenders()}
      />
    </View>
  );
}

function TenderCard({
  t, selected, onToggle, onOpen,
}: { t: Tender; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const [bg, fg] = tenderColor(t.status);
  const v = eligVerdict(t);
  const e = ELIG_COLOR[v] || ['#f3f4f6', '#cbd5e1'];
  const due = dueDisplay(t);
  const ev = (t.events || [])[(t.events || []).length - 1];
  return (
    <Pressable
      onPress={selected ? onToggle : onOpen}
      onLongPress={onToggle}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{t.psuName}</Text>
        <View style={[styles.pill, { backgroundColor: bg }]}>
          <Text style={[styles.pillText, { color: fg }]}>{t.status}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{t.tenderRef || '—'}</Text>
      {!!t.natureOfWork && <Text style={styles.cardMeta} numberOfLines={2}>{t.natureOfWork}</Text>}
      {!!t.location && <Text style={styles.cardMeta}>📍 {t.location}</Text>}

      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: e[0] }]}>
          <Text style={[styles.chipText, { color: e[1] }]}>{v || 'Not read'}</Text>
        </View>
        <Text style={[styles.dueText, { color: due.color }]}>
          Due {due.text}{due.tag ? ` · ${due.tag}` : ''}
        </Text>
      </View>

      <View style={styles.money}>
        <Money label="Tender" value={fmtMoney(t.tenderValue)} />
        <Money label="Quotation" value={fmtMoney(t.quotationValue)} />
        <Money label="EMD" value={fmtMoney(t.emdAmount)} />
      </View>
      <Text style={styles.cardMeta}>Partner: {t.partnerName || '—'}</Text>
      {!!ev?.note && <Text style={styles.eventText} numberOfLines={2}>{ev.note}</Text>}
    </Pressable>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <Text style={styles.moneyValue}>{value}</Text>
    </View>
  );
}

function Act({ label, onPress, disabled, danger }: {
  label: string; onPress: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [
        styles.act,
        danger && { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      <Text style={[styles.actText, danger && { color: colors.red }]}>{label}</Text>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  tabs: { gap: 6, paddingVertical: 3, marginBottom: spacing.md },
  tab: { height: 38, paddingHorizontal: 14, borderRadius: 7, justifyContent: 'center', backgroundColor: '#f3f4f6' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { ...font.small, color: colors.muted },
  tabTextOn: { color: colors.white, fontWeight: '800' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center',
  },
  addBtnText: { ...font.small, color: colors.white },
  stats: { gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, minWidth: 104, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 2, textAlign: 'center' },
  segment: {
    flexDirection: 'row', gap: 6, backgroundColor: '#eef2ff',
    borderRadius: radius.md, padding: 3, marginBottom: spacing.md,
  },
  segBtn: { flex: 1, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { ...font.small, color: colors.muted },
  segTextOn: { color: colors.white, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: 12, marginBottom: spacing.md,
  },
  searchIcon: { fontSize: 13, marginRight: 6 },
  search: { flex: 1, height: 46, fontSize: 14, color: colors.text },
  clear: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  act: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center',
  },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  progress: { ...font.small, color: colors.primary, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardOverdue: { backgroundColor: '#fff8f8', borderColor: '#fecaca' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, ...font.h3, color: colors.primary },
  cardMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  chipText: { fontSize: 10, fontWeight: '800' },
  dueText: { ...font.tiny, fontWeight: '700' },
  money: {
    flexDirection: 'row', marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  moneyLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  moneyValue: { ...font.tiny, color: colors.text, fontWeight: '700', marginTop: 2 },
  eventText: { ...font.tiny, color: colors.text, fontWeight: '500', marginTop: 6, lineHeight: 16 },
  eventBy: { fontSize: 9, fontWeight: '700', color: '#94a3b8', marginTop: 2 },
  noEvent: { ...font.tiny, color: '#cbd5e1', fontWeight: '500', marginTop: 6 },
  overdueDays: { ...font.tiny, color: colors.red, fontWeight: '800' },
  warnBox: {
    backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  warnText: { ...font.tiny, color: colors.red, fontWeight: '600', lineHeight: 16 },
  count: { ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  blockTitle: { ...font.small, color: colors.text, marginBottom: spacing.sm },
  blockerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  blockerText: { flex: 1, ...font.tiny, color: colors.text, fontWeight: '500' },
  blockerCount: { ...font.small, color: colors.red },
  reason: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 3, lineHeight: 15 },
  emptyText: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  hint: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.sm, lineHeight: 16 },
});
