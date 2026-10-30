import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin, isHrAdmin } from '../../auth/permissions';
import { DateField, Select } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { monthOptions, yearOptions } from '../attendance/logic';
import { downloadAttendanceReport } from './report';
import { EditPunchSheet, RemarkSheet } from './sheets';
import {
  MONTH_NAMES, hoursCell, punchStats, reportCellColor, statusCell,
  type MonthlyReport, type PunchStatusRow,
} from './logic';

const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * pg-punchstatus — "Daily Attendance". Everyone's punch state for a chosen day,
 * plus the day-wise monthly report. Reading is payroll-gated; editing and
 * deleting a punch are admin/HR only, matching the server's middleware.
 */
export default function DailyAttendanceScreen() {
  const { user, token, branch } = useAuth();
  const { showToast } = useToast();

  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<PunchStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'empty'>('idle');
  const [downloading, setDownloading] = useState(false);

  const [editRow, setEditRow] = useState<PunchStatusRow | null>(null);
  const [remarkRow, setRemarkRow] = useState<PunchStatusRow | null>(null);

  /** Editing and deleting are admin/HR; the web hides the column for everyone else. */
  const canEdit = isAdmin(user) || isHrAdmin(user);

  const load = useCallback(async (d: string, opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    setError(false);
    try {
      const data = await api.get<PunchStatusRow[]>(`${endpoints.attendanceTodayAll}?date=${d}`);
      setRows(data || []);
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(date, { spinner: true }); }, [date, load]);

  const stats = useMemo(() => punchStats(rows), [rows]);

  const previewReport = async () => {
    setReportState('loading');
    try {
      const rep = await api.get<MonthlyReport>(
        `${endpoints.attendanceReport}?month=${month}&year=${year}`,
      );
      if (!rep?.rows?.length) { setReport(null); setReportState('empty'); return; }
      setReport(rep);
      setReportState('idle');
    } catch (e) {
      setReportState('idle');
      showToast(e instanceof ApiError ? e.message : 'Could not load report', 'error');
    }
  };

  const download = async () => {
    setDownloading(true);
    showToast('Preparing report…');
    try {
      await downloadAttendanceReport(month, year, token, branch);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const deletePunch = (r: PunchStatusRow) => {
    Alert.alert(
      'Delete punch',
      `Delete the attendance/punch record for ${r.userName} on ${r.date}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.del(
                `${endpoints.attendanceRecord}?userId=${encodeURIComponent(r.userId)}&date=${encodeURIComponent(r.date)}`,
              );
              showToast('Punch deleted');
              void load(date);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
            }
          },
        },
      ],
    );
  };

  if (loading) return <Loading label="Loading attendance…" />;

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(date)}
          colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* Day picker */}
      <View style={styles.dayRow}>
        <View style={{ flex: 1 }}>
          <DateField value={date} onChange={(v) => setDate(v || todayISO())} />
        </View>
        <Pressable onPress={() => setDate(todayISO())} accessibilityRole="button"
          style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.smallBtnText}>Today</Text>
        </Pressable>
        <Pressable onPress={() => void load(date)} accessibilityRole="button"
          style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.smallBtnText}>⟳</Text>
        </Pressable>
      </View>
      <Text style={styles.dateLabel}>{dateLabel}</Text>

      {/* Day-wise monthly report */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🗓️ Day-wise Monthly Attendance Report</Text>
        <View style={styles.reportControls}>
          <View style={{ flex: 1 }}>
            <Select value={month} placeholder="Month" options={monthOptions()} onChange={setMonth} />
          </View>
          <View style={{ width: 108 }}>
            <Select value={year} placeholder="Year" options={yearOptions()} onChange={setYear} />
          </View>
        </View>
        <View style={styles.reportBtns}>
          <View style={{ flex: 1 }}>
            <Button title="👁 Preview" onPress={previewReport} variant="outline"
              loading={reportState === 'loading'} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="⬇ Excel" onPress={download} loading={downloading} />
          </View>
        </View>

        {reportState === 'empty' && (
          <Text style={styles.empty}>No employees / attendance for this month.</Text>
        )}
        {!!report && (
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: spacing.md }}>
            <View>
              <View style={styles.repHeadRow}>
                <Text style={[styles.repName, styles.repHeadCell]}>
                  {MONTH_NAMES[parseInt(month, 10) - 1]}
                </Text>
                {report.days.map((d) => (
                  <Text key={d.day} style={[styles.repDay, !d.working && { color: '#cbd5e1' }]}>
                    {d.day}{'\n'}{d.dow}
                  </Text>
                ))}
                <Text style={styles.repTotal}>P</Text>
                <Text style={styles.repTotal}>A</Text>
                <Text style={styles.repTotal}>L</Text>
              </View>
              {report.rows.map((r) => (
                <View key={r.userId} style={styles.repRow}>
                  <Text style={styles.repName} numberOfLines={1}>{r.userName}</Text>
                  {r.cells.map((c, i) => {
                    const col = reportCellColor(c.code);
                    return (
                      <Text key={i} style={[styles.repCell, { backgroundColor: col.bg, color: col.fg }]}>
                        {c.code}
                      </Text>
                    );
                  })}
                  <Text style={[styles.repTotal, { color: colors.green }]}>{r.presentDays}</Text>
                  <Text style={[styles.repTotal, { color: colors.red }]}>{r.absent}</Text>
                  <Text style={[styles.repTotal, { color: '#854d0e' }]}>{r.late}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Day stats */}
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: s.bg }]}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Roster */}
      <View style={[styles.card, { padding: 0 }]}>
        {error ? (
          <Text style={styles.error}>Error loading data</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No members found</Text>
        ) : (
          rows.map((r, i) => {
            const st = statusCell(r);
            return (
              <View key={r.userId} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.userName}</Text>
                    <Text style={styles.designation}>
                      {r.designation || ''}{r.branch ? ` · ${r.branch}` : ''}
                    </Text>
                    {r.isLate && (
                      <View style={styles.lateTag}><Text style={styles.lateText}>LATE</Text></View>
                    )}
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${st.color}22` }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                <View style={styles.cells}>
                  <Cell label="PUNCH IN" value={r.punchIn || '—'} late={r.isLate} />
                  <Cell label="PUNCH OUT" value={r.punchOut || '—'} />
                  <Cell label="HOURS" value={hoursCell(r)} accent />
                </View>

                <View style={styles.actions}>
                  <Pressable onPress={() => setRemarkRow(r)} accessibilityRole="button"
                    style={({ pressed }) => [styles.act, pressed && { opacity: 0.7 }]}>
                    <Text style={[styles.actText, !r.remark && { opacity: 0.5 }]}>
                      {r.remark ? '💬 Remark' : '💭 Remark'}
                    </Text>
                  </Pressable>
                  {canEdit && (
                    <>
                      <Pressable onPress={() => setEditRow(r)} accessibilityRole="button"
                        style={({ pressed }) => [styles.act, pressed && { opacity: 0.7 }]}>
                        <Text style={styles.actText}>✏ Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => deletePunch(r)} accessibilityRole="button"
                        style={({ pressed }) => [styles.act, styles.actDel, pressed && { opacity: 0.7 }]}>
                        <Text style={[styles.actText, { color: colors.red }]}>🗑</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      <EditPunchSheet
        row={editRow}
        visible={!!editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => void load(date)}
      />
      <RemarkSheet
        row={remarkRow}
        visible={!!remarkRow}
        onClose={() => setRemarkRow(null)}
        onSaved={() => void load(date)}
      />
    </ScrollView>
  );
}

function Cell({ label, value, late, accent }: { label: string; value: string; late?: boolean; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[
        styles.cellValue,
        late && { color: colors.red },
        accent && { color: colors.primary },
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  smallBtn: {
    height: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center',
  },
  smallBtnText: { ...font.small, color: colors.text },
  dateLabel: { ...font.small, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  cardTitle: { ...font.h3, color: colors.text, marginBottom: spacing.md },
  reportControls: { flexDirection: 'row', gap: spacing.sm },
  reportBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  error: { ...font.small, color: colors.red, textAlign: 'center', padding: spacing.xl },

  repHeadRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  repHeadCell: { color: colors.muted },
  repRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  repName: { width: 110, ...font.tiny, color: colors.text, paddingRight: 6 },
  repDay: { width: 24, fontSize: 8, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  repCell: { width: 24, fontSize: 8, fontWeight: '700', textAlign: 'center', paddingVertical: 3 },
  repTotal: { width: 26, fontSize: 9, fontWeight: '800', textAlign: 'center', color: colors.muted },

  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, marginTop: 3 },

  row: { padding: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { ...font.small, color: colors.text },
  designation: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  lateTag: {
    alignSelf: 'flex-start', backgroundColor: '#fef2f2', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, marginTop: 4,
  },
  lateText: { fontSize: 9, fontWeight: '700', color: colors.red },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  cells: { flexDirection: 'row', marginTop: spacing.md },
  cellLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.3 },
  cellValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  act: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, minHeight: 34, justifyContent: 'center',
  },
  actDel: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
});
