import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { hasPayrollAccess } from '../../auth/permissions';
import { Select } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { LeaveRequest } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import { LeaveSheet, SiteVisitSheet, WfhReasonSheet } from './sheets';
import {
  attColor, attendanceAlert, leaveStatusColor, monthOptions, yearOptions,
} from './logic';
import type { AttendanceRecord, LeaveBalance, PunchResponse, WfhPending } from './types';

/**
 * pg-attendance — the member's own punch card, leave balance, history and leave
 * requests, plus the WFH approval queue for admin/HR.
 *
 * Note on the firm's "mobile only punch" rule: the server gates punch-in on a
 * mobile User-Agent. React Native's fetch sends an Android UA, so this app
 * satisfies that rule natively — no backend change is needed.
 */
export default function AttendanceScreen() {
  const { user } = useAuth();
  const { leaveRequests, reload } = useData();
  const { showToast } = useToast();

  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [wfhQueue, setWfhQueue] = useState<WfhPending[]>([]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'' | 'in' | 'wfh' | 'out'>('');
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [wfhOpen, setWfhOpen] = useState(false);

  const canApproveWfh = hasPayrollAccess(user);
  const myLeaves = useMemo(
    () => leaveRequests.filter((r) => !r.memberId || r.memberId === user?.id),
    [leaveRequests, user?.id],
  );

  const loadToday = useCallback(async () => {
    const rec = await api.get<AttendanceRecord | null>(endpoints.attendanceToday).catch(() => null);
    setToday(rec);
  }, []);

  const loadHistory = useCallback(async (m: string, y: string) => {
    const data = await api
      .get<AttendanceRecord[]>(`${endpoints.attendance}?month=${m}&year=${y}`)
      .catch(() => []);
    setHistory(data || []);
  }, []);

  const loadAll = useCallback(async (opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    await Promise.all([
      loadToday(),
      loadHistory(month, year),
      api.get<LeaveBalance>(endpoints.leaveBalance).then(setBalance).catch(() => {}),
      canApproveWfh
        ? api.get<WfhPending[]>(endpoints.wfhPending).then((r) => setWfhQueue(r || [])).catch(() => {})
        : Promise.resolve(),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [loadToday, loadHistory, month, year, canApproveWfh]);

  useEffect(() => { void loadAll({ spinner: true }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadHistory(month, year); }, [month, year, loadHistory]);

  // ── Punch actions ─────────────────────────────────────────────────────────
  const punchIn = async () => {
    setBusy('in');
    try {
      const r = await api.post<PunchResponse>(endpoints.punchIn, {});
      setToday((prev) => ({
        ...(prev || { id: '', userId: user?.id || '', date: '' }),
        punchIn: r.punchIn, punchOut: null, isLate: r.isLate,
        status: r.offSite ? 'Site Visit' : 'Present',
      }));
      showToast(r.message || 'Punched in ✓', r.isLate ? 'error' : 'success');
      void loadAll();
    } catch (e) {
      const err = e as ApiError & { payload?: { needsSiteVisit?: boolean } };
      const msg = err?.message || '';
      // Off the office network: say why, then open the site-visit sheet.
      if (/outside the office|NOT_ON_WIFI|site visit to punch in/i.test(msg)) {
        showToast(msg || "You're outside the office network. Log a site visit to punch in.", 'error');
        setTimeout(() => setSiteOpen(true), 900);
        return;
      }
      showToast(msg || 'Could not punch in. Check your connection and try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const punchWfh = async (reason: string) => {
    setBusy('wfh');
    try {
      const r = await api.post<PunchResponse>(endpoints.punchIn, { wfh: true, wfhReason: reason });
      setToday((prev) => ({
        ...(prev || { id: '', userId: user?.id || '', date: '' }),
        punchIn: r.punchIn, punchOut: null, wfh: true, wfhStatus: 'Pending', status: 'WFH Pending',
      }));
      setWfhOpen(false);
      showToast(r.message || 'Work From Home marked — pending approval');
      void loadAll();
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : 'Could not send Work From Home request. Try again.',
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  const punchOut = async () => {
    setBusy('out');
    try {
      const r = await api.post<PunchResponse>(endpoints.punchOut, {});
      setToday((prev) => ({
        ...(prev || { id: '', userId: user?.id || '', date: '' }),
        punchIn: r.punchIn, punchOut: r.punchOut, workHours: r.workHours, status: r.status,
      }));
      showToast(`Punched out at ${r.punchOut} — ${r.workHours}h worked ✓`);
      void loadAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '';
      if (/outside the office|NOT_ON_WIFI|site visit to punch out/i.test(msg)) {
        showToast(msg || "You're outside the office network. Log a site visit to punch out.", 'error');
        setTimeout(() => setSiteOpen(true), 900);
        return;
      }
      showToast(msg || 'Could not punch out. Check your connection and try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const decideWfh = async (id: string, approve: boolean) => {
    try {
      await api.put(endpoints.wfhDecide, { id, decision: approve ? 'approve' : 'reject' });
      setWfhQueue((prev) => prev.filter((w) => w.id !== id));
      showToast(approve ? 'Work From Home approved ✓' : 'Work From Home rejected');
      void loadAll();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    }
  };

  if (loading) return <Loading label="Loading attendance…" />;

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const showAlert = attendanceAlert(today);
  const firstName = (user?.name || '').replace('[TEST] ', '').split(' ')[0];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()}
          colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <Text style={styles.greet}>Hello, {firstName}</Text>

      {showAlert && (
        <View style={styles.alert}>
          <Text style={styles.alertIcon}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>Attendance not marked</Text>
            <Text style={styles.alertBody}>
              It's past 10:00 AM. Please punch in or apply for leave.
            </Text>
          </View>
        </View>
      )}

      {/* ── Punch card ── */}
      <View style={styles.card}>
        <Text style={styles.date}>{dateLabel}</Text>
        <View style={styles.times}>
          <TimeBox label="PUNCH IN" value={today?.punchIn || '—'} color={colors.green} bg="#f0fdf4" />
          <TimeBox label="PUNCH OUT" value={today?.punchOut || '—'} color={colors.red} bg="#fef2f2" />
          <TimeBox
            label="HOURS"
            value={today?.workHours ? String(today.workHours) : '—'}
            color={colors.primary}
            bg="#eff6ff"
          />
        </View>

        <View style={styles.punchTabs}>
          {(['in', 'out'] as const).map((t) => {
            const on = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.punchTab, on && styles.punchTabOn]}
              >
                <Text style={[styles.punchTabText, { color: on ? (t === 'in' ? colors.green : colors.red) : colors.muted }]}>
                  {t === 'in' ? '🟢 Punch In' : '🔴 Punch Out'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'in' ? (
          <>
            <Button title="🟢 Punch In Now" onPress={punchIn} loading={busy === 'in'} />
            <View style={{ marginTop: spacing.sm }}>
              <Button title="🏠 Work From Home" onPress={() => setWfhOpen(true)} variant="outline" />
            </View>
            <Text style={styles.wfhNote}>
              Work From Home needs admin approval before it counts as present.
            </Text>
          </>
        ) : (
          <Button title="🔴 Punch Out Now" onPress={punchOut} loading={busy === 'out'} variant="danger" />
        )}

        <View style={{ marginTop: spacing.sm }}>
          <Button title="🗺 Log Site Visit" onPress={() => setSiteOpen(true)} variant="outline" />
        </View>
      </View>

      {/* ── WFH approvals (admin / HR only) ── */}
      {canApproveWfh && wfhQueue.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏠 Work From Home — Pending Approval</Text>
          {wfhQueue.map((w) => (
            <View key={w.id} style={styles.wfhRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wfhName}>{w.userName || '—'}</Text>
                <Text style={styles.wfhMeta}>
                  {fmt(w.date)}{w.punchIn ? ` · in ${w.punchIn}` : ''}
                </Text>
                {!!w.wfhReason && <Text style={styles.wfhReason}>“{w.wfhReason}”</Text>}
              </View>
              <View style={styles.wfhActions}>
                <Pressable onPress={() => decideWfh(w.id, true)} accessibilityRole="button"
                  style={({ pressed }) => [styles.mini, styles.miniOk, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.miniOkText}>✓</Text>
                </Pressable>
                <Pressable onPress={() => decideWfh(w.id, false)} accessibilityRole="button"
                  style={({ pressed }) => [styles.mini, styles.miniNo, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.miniNoText}>✗</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Leave balance ── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Leave Balance</Text>
          <Pressable onPress={() => setLeaveOpen(true)} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.link}>+ Apply Leave</Text>
          </Pressable>
        </View>
        <View style={styles.balRow}>
          <Bal value={balance?.accrued ?? 0} label="ACCRUED" color={colors.primary} />
          <Bal value={balance?.used ?? 0} label="USED" color={colors.amber} />
          <Bal value={balance?.remaining ?? 0} label="REMAINING" color={colors.green} />
        </View>
      </View>

      {/* ── My attendance history ── */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>My Attendance</Text>
        </View>
        <View style={styles.pickers}>
          <View style={{ flex: 1 }}>
            <Select value={month} placeholder="Month" options={monthOptions()} onChange={setMonth} />
          </View>
          <View style={{ width: 110 }}>
            <Select value={year} placeholder="Year" options={yearOptions()} onChange={setYear} />
          </View>
        </View>
        {history.length === 0 ? (
          <Text style={styles.empty}>No records this month</Text>
        ) : (
          history.map((a) => {
            const c = attColor(a.status);
            return (
              <View key={a.id || a.date} style={styles.attRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.attDate}>{fmt(a.date)}</Text>
                  <View style={[styles.pill, { backgroundColor: c.bg }]}>
                    <Text style={[styles.pillText, { color: c.fg }]}>{a.status || '—'}</Text>
                  </View>
                </View>
                <Cell label="IN" value={a.punchIn || '—'} late={a.isLate} />
                <Cell label="OUT" value={a.punchOut || '—'} />
                <Cell label="HRS" value={a.workHours ? String(a.workHours) : '—'} />
              </View>
            );
          })
        )}
      </View>

      {/* ── My leave requests ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Leave Requests</Text>
        {myLeaves.length === 0 ? (
          <Text style={styles.empty}>No leave requests yet</Text>
        ) : (
          myLeaves.map((r: LeaveRequest) => {
            const c = leaveStatusColor(r.status);
            return (
              <View key={r.id} style={styles.leaveRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaveTitle}>
                    {r.type} · {r.days} day{r.days > 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.leaveMeta}>{fmt(r.fromDate)} → {fmt(r.toDate)}</Text>
                  {!!r.reason && <Text style={styles.leaveReason}>“{r.reason}”</Text>}
                </View>
                <View style={[styles.pill, { backgroundColor: c.bg }]}>
                  <Text style={[styles.pillText, { color: c.fg }]}>{r.status}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <LeaveSheet
        visible={leaveOpen}
        balance={balance}
        onClose={() => setLeaveOpen(false)}
        onApplied={() => { void reload({ showSpinner: false }); void loadAll(); }}
      />
      <SiteVisitSheet visible={siteOpen} onClose={() => setSiteOpen(false)} onLogged={() => void loadAll()} />
      <WfhReasonSheet
        visible={wfhOpen}
        saving={busy === 'wfh'}
        onClose={() => setWfhOpen(false)}
        onSubmit={punchWfh}
      />
    </ScrollView>
  );
}

function TimeBox({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[styles.timeBox, { backgroundColor: bg }]}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={[styles.timeValue, { color }]}>{value}</Text>
    </View>
  );
}

function Bal({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[styles.balValue, { color }]}>{value}</Text>
      <Text style={styles.balLabel}>{label}</Text>
    </View>
  );
}

function Cell({ label, value, late }: { label: string; value: string; late?: boolean }) {
  return (
    <View style={{ width: 62 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, late && { color: colors.red }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  greet: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  alert: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca',
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  alertIcon: { fontSize: 20 },
  alertTitle: { ...font.small, color: '#991b1b' },
  alertBody: { ...font.tiny, color: '#b91c1c', fontWeight: '500', marginTop: 2 },
  card: {
    backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  cardTitle: { ...font.h3, color: colors.text },
  link: { ...font.small, color: colors.primary },
  date: { ...font.small, color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
  times: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  timeBox: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  timeLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  timeValue: { fontSize: 18, fontWeight: '900' },
  punchTabs: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: spacing.md },
  punchTab: { flex: 1, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  punchTabOn: { backgroundColor: colors.white },
  punchTabText: { fontSize: 14, fontWeight: '800' },
  wfhNote: { ...font.tiny, color: colors.muted, fontWeight: '500', textAlign: 'center', marginTop: 6 },
  balRow: { flexDirection: 'row' },
  balValue: { fontSize: 20, fontWeight: '900' },
  balLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginTop: 2 },
  pickers: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  attRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  attDate: { ...font.small, color: colors.text },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  cellLabel: { fontSize: 9, fontWeight: '800', color: colors.muted },
  cellValue: { fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 2 },
  leaveRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  leaveTitle: { ...font.small, color: colors.text },
  leaveMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  leaveReason: { ...font.tiny, color: colors.muted, fontWeight: '500', fontStyle: 'italic', marginTop: 2 },
  wfhRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  wfhName: { ...font.small, color: colors.text },
  wfhMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  wfhReason: { ...font.tiny, color: colors.muted, fontStyle: 'italic', fontWeight: '500', marginTop: 2 },
  wfhActions: { flexDirection: 'row', gap: 6 },
  mini: { width: 40, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  miniOk: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  miniOkText: { color: colors.green, fontWeight: '900' },
  miniNo: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  miniNoText: { color: colors.red, fontWeight: '900' },
});
