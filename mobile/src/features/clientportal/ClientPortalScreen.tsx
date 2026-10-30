import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { Button, ProgressBar } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import ClientTaskSheet from './ClientTaskSheet';
import { exportClientTasksExcel, exportClientTasksPdf } from './exports';
import {
  companyOptions, fmtCli, isOverdue, latestRemark, periodLabel, periodOptions,
  portalStats, sbg, showsCompanyColumn, tasksForTab,
  type ClientTab, type ClientTask,
} from './logic';

/**
 * pg-clientportal — "My Tasks" for a client login. Company and Period selectors,
 * three counters, Active/Completed tabs, the task list, Excel/PDF export, and a
 * detail sheet with the comment thread.
 *
 * Reads only: GET /api/client/assignments, which the server scopes to this
 * login's own client (or its group's companies) via clientScope(). The single
 * write is posting a comment, from the detail sheet.
 */
export default function ClientPortalScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [company, setCompany] = useState('all');
  const [period, setPeriod] = useState('all');
  const [tab, setTab] = useState<ClientTab>('active');

  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [allForPeriods, setAllForPeriods] = useState<ClientTask[]>([]);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [open, setOpen] = useState<ClientTask | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) setRefreshing(true); else setState('loading');
    const compQS = company && company !== 'all' ? `company=${encodeURIComponent(company)}` : '';
    const perQS = period && period !== 'all' ? `period=${encodeURIComponent(period)}` : '';
    const qs = [compQS, perQS].filter(Boolean).join('&');
    try {
      const rows = await api.get<ClientTask[]>(
        `${endpoints.clientAssignments}${qs ? `?${qs}` : ''}`,
      );
      setTasks(rows || []);
      // The Period list is built from the period-unfiltered set, so it stays
      // complete while a period is selected — the web fetches it separately.
      if (period === 'all') setAllForPeriods(rows || []);
      else if (!allForPeriods.length) {
        const all = await api.get<ClientTask[]>(
          `${endpoints.clientAssignments}${compQS ? `?${compQS}` : ''}`, { background: true },
        );
        setAllForPeriods(all || []);
      }
      setState('idle');
    } catch (e) {
      setState('error');
      if (opts?.refresh) showToast(e instanceof ApiError ? e.message : 'Could not load tasks', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [company, period]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const { total, done, active } = portalStats(tasks);
  const shown = tasksForTab(tasks, tab);
  const showCompany = showsCompanyColumn(user, company);
  const companies = companyOptions(user);

  const exportAs = async (kind: 'excel' | 'pdf') => {
    if (!tasks.length) { showToast('No tasks to download', 'error'); return; }
    setBusy(kind);
    try {
      if (kind === 'excel') { await exportClientTasksExcel(tasks, user, company); showToast('Excel downloaded'); }
      else { await exportClientTasksPdf(tasks, user, company); showToast('PDF ready'); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  /** A posted comment lands in the open task and in the list behind it. */
  const onPosted = (taskId: string, comment: NonNullable<ClientTask['comments']>[number]) => {
    const add = (t: ClientTask) =>
      t.id === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t;
    setTasks((prev) => prev.map(add));
    setOpen((prev) => (prev && prev.id === taskId ? add(prev) : prev));
  };

  return (
    <>
      <ScrollView
        style={styles.page}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} />}
      >
        <Text style={styles.sub}>
          Tasks GARP is handling for you{user?.email ? ` · 📧 ${user.email}` : ''}
        </Text>

        {!!companies && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={styles.selLabel}>Company</Text>
            <Select value={company} placeholder="All Companies" options={companies}
              onChange={(v) => { setCompany(v); setAllForPeriods([]); }} />
          </View>
        )}
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.selLabel}>Period</Text>
          <Select value={period} placeholder="All Periods"
            options={periodOptions(allForPeriods)} onChange={setPeriod} />
        </View>

        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: '#eff6ff' }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{total}</Text>
            <Text style={styles.statLabel}>TOTAL</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: '#fef3c7' }]}>
            <Text style={[styles.statValue, { color: '#92400e' }]}>{active}</Text>
            <Text style={styles.statLabel}>ACTIVE</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.statValue, { color: '#15803d' }]}>{done}</Text>
            <Text style={styles.statLabel}>COMPLETED</Text>
          </View>
        </View>

        {state === 'loading' ? (
          <Text style={styles.msg}>Loading...</Text>
        ) : state === 'error' ? (
          <Text style={[styles.msg, { color: colors.red }]}>Could not load tasks</Text>
        ) : !total ? (
          <Text style={styles.msg}>No tasks assigned yet</Text>
        ) : (
          <>
            <View style={styles.dlBar}>
              <View style={{ flex: 1 }}>
                <Button title="⬇ Excel" onPress={() => void exportAs('excel')}
                  variant="outline" loading={busy === 'excel'} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="⬇ PDF" onPress={() => void exportAs('pdf')}
                  variant="outline" loading={busy === 'pdf'} />
              </View>
            </View>

            <View style={styles.tabBar}>
              {([['active', '📋 Active', active, colors.primary],
                 ['done', '✅ Completed', done, colors.green]] as [ClientTab, string, number, string][])
                .map(([id, label, n, c]) => {
                  const on = tab === id;
                  return (
                    <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="button"
                      style={[styles.tab, on && { borderBottomColor: c }]}>
                      <Text style={[styles.tabText, on && { color: c, fontWeight: '800' }]}>
                        {label} ({n})
                      </Text>
                    </Pressable>
                  );
                })}
            </View>

            <View style={styles.list}>
              {!shown.length ? (
                <Text style={styles.msg}>
                  {tab === 'done' ? 'No completed tasks yet' : 'No active tasks 🎉'}
                </Text>
              ) : shown.map((t, i) => {
                const [bg, fg] = sbg(t.status);
                const od = isOverdue(t);
                const remark = latestRemark(t);
                const nComments = (t.comments || []).length;
                return (
                  <Pressable key={t.id} onPress={() => setOpen(t)} accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.row, i % 2 === 1 && { backgroundColor: '#fafafa' },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <View style={styles.rowHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.workType}>{t.workType}</Text>
                        {!!remark && (
                          <Text style={styles.remark} numberOfLines={1}>
                            📝 {remark.length > 40 ? `${remark.substring(0, 40)}…` : remark}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.pill, { backgroundColor: bg }]}>
                        <Text style={[styles.pillText, { color: fg }]}>{t.status}</Text>
                      </View>
                    </View>

                    {showCompany && (
                      <Text style={styles.company}>{t.companyName || '—'}</Text>
                    )}
                    <Text style={styles.meta}>
                      🗓 {periodLabel(t.period)} · 👤 {t.memberName || '—'}
                    </Text>
                    <Text style={[styles.meta, od && { color: colors.red, fontWeight: '700' }]}>
                      📅 Due {fmtCli(t.dueDate)}{od ? ' ⚠' : ''}
                    </Text>
                    {t.status === 'Completed' && !!t.completedAt && (
                      <Text style={[styles.meta, { color: colors.green, fontWeight: '700' }]}>
                        ✓ Done {fmtCli(t.completedAt)}
                      </Text>
                    )}

                    <View style={styles.progressRow}>
                      <View style={{ flex: 1 }}><ProgressBar pct={t.completionPct || 0} /></View>
                      <Text style={styles.pct}>{t.completionPct || 0}%</Text>
                      <Text style={[styles.comments, nComments > 0 && { color: colors.primary }]}>
                        💬 {nComments}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.footNote}>Tap any task to view details & comments</Text>
          </>
        )}
      </ScrollView>

      <ClientTaskSheet task={open} visible={!!open} onClose={() => setOpen(null)} onPosted={onPosted} />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  sub: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },
  selLabel: { ...font.tiny, color: colors.muted, marginBottom: 4 },

  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { ...font.tiny, color: colors.muted },

  dlBar: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1,
    borderColor: colors.border, borderBottomWidth: 0,
    borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, overflow: 'hidden',
  },
  tab: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabText: { ...font.small, fontWeight: '600', color: colors.muted },

  list: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, overflow: 'hidden',
  },
  row: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  workType: { ...font.small, fontWeight: '800', color: colors.text },
  remark: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 },
  company: { ...font.small, fontWeight: '700', color: colors.primary, marginTop: 4 },
  meta: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 3 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { ...font.tiny, fontWeight: '800' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pct: { ...font.tiny, color: colors.muted },
  comments: { ...font.small, fontWeight: '700', color: colors.muted },

  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
  footNote: { ...font.small, fontWeight: '500', color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});
