import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { Button, EmptyState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import { monthOptions, yearOptions } from '../attendance/logic';
import {
  MONTH_NAMES as DA_MONTHS, reportCellColor, type MonthlyReport,
} from '../dailyattendance/logic';
import { downloadAttendanceReport } from '../dailyattendance/report';
import { exportSalaryExcel } from './exportExcel';
import SalarySlipSheet from './SalarySlipSheet';
import {
  MONTH_NAMES, SALARY_BRANCHES, emailBanner, inr, payrollTotals, salaryMembers,
  type EmailStatus, type SalaryRecord,
} from './logic';

/**
 * pg-salary — "💰 Salary". Month / year / branch pickers, the day-wise monthly
 * attendance report card, and the generated salary sheet with per-employee slips.
 *
 * Nothing here mutates on load: initSalaryPage() only reads GET /email-status,
 * and the sheet is built from one GET /salary/:id/:y/:m per eligible member.
 * The Email actions (single and bulk) post to the server's mail routes and are
 * the only writes on the page, so both confirm first, as the web does.
 */
export default function SalaryScreen() {
  const { showToast } = useToast();
  const { token, branch: activeBranch } = useAuth();
  const { users, loading: dataLoading } = useData();

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [branch, setBranch] = useState('');

  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [rows, setRows] = useState<SalaryRecord[]>([]);
  const [sheetFor, setSheetFor] = useState<{ month: number; year: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [emailingAll, setEmailingAll] = useState(false);

  const [slip, setSlip] = useState<SalaryRecord | null>(null);

  // Attendance report card — shares pg-attendance's report endpoints and uses the
  // month/year selected above, exactly as the web note on the card says.
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'empty'>('idle');
  const [downloading, setDownloading] = useState(false);

  const checkEmailStatus = useCallback(async () => {
    try {
      setEmailStatus(await api.get<EmailStatus>(endpoints.emailStatus, { background: true }));
    } catch {
      setEmailStatus(null);   // the web clears the banner on failure
    }
  }, []);

  useEffect(() => { void checkEmailStatus(); }, [checkEmailStatus]);

  const members = useMemo(() => salaryMembers(users, branch), [users, branch]);

  const generate = async () => {
    setGenerating(true);
    try {
      const out: SalaryRecord[] = [];
      for (const m of members) {
        // One request per member, and a failure for one is skipped, not fatal —
        // the web's per-member try/catch inside loadSalarySheet().
        try {
          out.push(await api.get<SalaryRecord>(endpoints.salaryFor(m.id, year, month)));
        } catch { /* skip this member */ }
      }
      setRows(out);
      setSheetFor({ month: parseInt(month, 10), year: parseInt(year, 10) });
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error loading salary', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const exportExcel = async () => {
    if (!rows.length) { showToast('Generate salary sheet first', 'error'); return; }
    setExporting(true);
    try {
      await exportSalaryExcel(rows, month, year);
      showToast('Salary Excel downloaded ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const openSlip = async (userId: string) => {
    try {
      setSlip(await api.get<SalaryRecord>(endpoints.salaryFor(userId, year, month)));
    } catch {
      showToast('Error generating slip', 'error');
    }
  };

  const emailOne = (r: SalaryRecord) => {
    Alert.alert(
      'Email salary slip',
      `Email the ${r.userName} salary slip for this month?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const res = await api.post<{ sentTo?: string }>(
                endpoints.salaryEmail(r.userId, year, month), {},
              );
              showToast(`✅ Slip emailed to ${res?.sentTo || r.userName}`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not send email', 'error');
            }
          },
        },
      ],
    );
  };

  const emailAll = () => {
    if (!sheetFor) return;
    Alert.alert(
      'Email all slips',
      'Email salary slips to ALL employees for this month? This will send an email to each employee with an address on file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send all',
          onPress: async () => {
            setEmailingAll(true);
            showToast('Sending slips…');
            try {
              const r = await api.post<{ sent: number; failed?: { name: string; reason: string }[] }>(
                endpoints.salaryEmailAll(sheetFor.year, sheetFor.month), {}, { timeoutMs: 120000 },
              );
              let msg = `Sent ${r.sent} slip${r.sent === 1 ? '' : 's'}`;
              if (r.failed?.length) msg += ` · ${r.failed.length} skipped`;
              showToast(msg);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Bulk email failed', 'error');
            } finally {
              setEmailingAll(false);
            }
          },
        },
      ],
    );
  };

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

  const downloadReport = async () => {
    setDownloading(true);
    showToast('Preparing report…');
    try {
      await downloadAttendanceReport(month, year, token, activeBranch);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (dataLoading) return <Loading label="Loading…" />;

  const banner = emailBanner(emailStatus);
  const totals = payrollTotals(rows);

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}>
        {/* Month / year / branch, then Generate — the web's control row */}
        <View style={styles.controls}>
          <View style={{ flex: 1 }}>
            <Select value={month} placeholder="Month" options={monthOptions()} onChange={setMonth} />
          </View>
          <View style={{ width: 104 }}>
            <Select value={year} placeholder="Year" options={yearOptions()} onChange={setYear} />
          </View>
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Select value={branch} placeholder="All Branches" options={SALARY_BRANCHES} onChange={setBranch} />
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Generate Salary Sheet" onPress={generate} loading={generating} />
        </View>

        {!!banner && (
          <View style={[styles.banner, { backgroundColor: banner.bg, borderColor: banner.border }]}>
            <Text style={[styles.bannerText, { color: banner.fg }]}>{banner.text}</Text>
          </View>
        )}

        {/* 🗓️ Monthly Attendance Report */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🗓️ Monthly Attendance Report</Text>
          <Text style={styles.cardNote}>
            Full day-by-day attendance for all employees. Uses the month/year selected above.
          </Text>
          <View style={styles.reportBtns}>
            <View style={{ flex: 1 }}>
              <Button title="👁 Preview on screen" onPress={previewReport} variant="outline"
                loading={reportState === 'loading'} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="⬇ Download Excel" onPress={downloadReport} loading={downloading} />
            </View>
          </View>

          {reportState === 'empty' && (
            <Text style={styles.empty}>No employees / attendance for this month.</Text>
          )}
          {!!report && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: spacing.md }}>
                <View>
                  <View style={styles.repHeadRow}>
                    <Text style={[styles.repName, styles.repHeadCell]}>
                      {DA_MONTHS[parseInt(month, 10) - 1]}
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
              <Text style={styles.legend}>
                P Present · L Late · A Absent · HD Half-day · WFH Work-from-home · SV Site visit ·
                CL Casual · SL Sick · EL Earned · LWP Leave w/o Pay · – Weekly off
              </Text>
            </>
          )}
        </View>

        {/* Salary sheet */}
        {!sheetFor ? (
          <View style={{ marginTop: spacing.lg }}>
            <EmptyState icon="💰" title="No salary data"
              note={`Choose a month and tap Generate Salary Sheet. ${members.length} eligible employee${members.length === 1 ? '' : 's'}.`} />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <EmptyState icon="💰" title="No salary data" />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                Salary Sheet — {MONTH_NAMES[sheetFor.month - 1]} {sheetFor.year}
              </Text>
              <Text style={styles.sheetCount}>
                {rows.length} employee{rows.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.sheetActions}>
              <View style={{ flex: 1 }}>
                <Button title="📧 Email All Slips" onPress={emailAll} loading={emailingAll} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="📥 Excel" onPress={exportExcel} variant="outline" loading={exporting} />
              </View>
            </View>

            {rows.map((s, i) => (
              <View key={s.userId} style={[styles.empRow, i % 2 === 1 && { backgroundColor: '#fafafa' }]}>
                <View style={styles.empHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName} numberOfLines={1}>{s.userName}</Text>
                    <Text style={styles.empSub} numberOfLines={1}>
                      {(s.designation || '—')} · {(s.branch || '—')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.netLabel}>NET PAY</Text>
                    <Text style={styles.netValue}>{inr(s.netPay)}</Text>
                  </View>
                </View>

                <View style={styles.daysRow}>
                  <Text style={styles.dayChip}>W.Days <Text style={styles.dayVal}>{s.workingDays}</Text></Text>
                  <Text style={styles.dayChip}>Present <Text style={[styles.dayVal, { color: colors.green }]}>{s.presentDays}</Text></Text>
                  <Text style={styles.dayChip}>Absent <Text style={[styles.dayVal, { color: s.absentDays > 0 ? colors.red : colors.muted }]}>{s.absentDays || '—'}</Text></Text>
                </View>

                <View style={styles.amtGrid}>
                  {([['Basic', s.basic], ['HRA', s.hra], ['Conv.', s.conveyance],
                    ['Gross', s.grossSalary]] as [string, number][]).map(([l, v]) => (
                    <View key={l} style={styles.amtCell}>
                      <Text style={styles.amtLabel}>{l}</Text>
                      <Text style={styles.amtValue}>{inr(v)}</Text>
                    </View>
                  ))}
                  <View style={styles.amtCell}>
                    <Text style={styles.amtLabel}>Deduct.</Text>
                    <Text style={[styles.amtValue, { color: colors.red }]}>{inr(s.absenceDeduction)}</Text>
                  </View>
                  <View style={styles.amtCell}>
                    <Text style={styles.amtLabel}>PF</Text>
                    <Text style={[styles.amtValue, { color: colors.primary }]}>{inr(s.pf)}</Text>
                  </View>
                </View>

                <View style={styles.empActions}>
                  <Pressable onPress={() => void openSlip(s.userId)} accessibilityRole="button"
                    style={({ pressed }) => [styles.act, pressed && { opacity: 0.7 }]}>
                    <Text style={styles.actText}>📄 Slip</Text>
                  </Pressable>
                  <Pressable onPress={() => emailOne(s)} accessibilityRole="button"
                    style={({ pressed }) => [styles.act, styles.actPrimary, pressed && { opacity: 0.7 }]}>
                    <Text style={[styles.actText, { color: colors.white }]}>📧 Email</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {/* TOTAL PAYROLL */}
            <View style={styles.totalBox}>
              <Text style={styles.totalTitle}>TOTAL PAYROLL</Text>
              {([['Gross', totals.gross, colors.text],
                 ['Deductions', totals.deduction, colors.red],
                 ['PF', totals.pf, colors.primary],
                 ['Net Pay', totals.net, colors.green]] as [string, number, string][]).map(([l, v, c]) => (
                <View key={l} style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{l}</Text>
                  <Text style={[styles.totalValue, { color: c }]}>{inr(v)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <SalarySlipSheet record={slip} visible={!!slip} onClose={() => setSlip(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  controls: { flexDirection: 'row', gap: spacing.sm },

  banner: {
    marginTop: spacing.md, borderWidth: 1, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  bannerText: { ...font.small, fontWeight: '600' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginTop: spacing.md,
  },
  cardTitle: { ...font.h3, color: colors.text },
  cardNote: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 4, marginBottom: spacing.sm },
  reportBtns: { flexDirection: 'row', gap: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  legend: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 6 },

  repHeadRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: colors.border },
  repHeadCell: { fontWeight: '800' },
  repRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  repName: { width: 110, ...font.tiny, color: colors.text, paddingRight: 6 },
  repDay: { width: 24, ...font.tiny, color: colors.muted, textAlign: 'center' },
  repCell: { width: 24, ...font.tiny, textAlign: 'center', paddingVertical: 3 },
  repTotal: { width: 26, ...font.tiny, textAlign: 'center', color: colors.muted },

  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { ...font.h3, color: colors.text, flexShrink: 1 },
  sheetCount: { ...font.small, color: colors.muted },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

  empRow: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingVertical: spacing.md, marginTop: spacing.md,
  },
  empHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  empName: { ...font.h3, color: colors.text },
  empSub: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 2 },
  netLabel: { ...font.tiny, color: colors.muted },
  netValue: { fontSize: 16, fontWeight: '900', color: colors.green },

  daysRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  dayChip: { ...font.tiny, fontWeight: '500', color: colors.muted },
  dayVal: { fontWeight: '800', color: colors.text },

  amtGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  amtCell: { width: '33.33%', paddingVertical: 4 },
  amtLabel: { ...font.tiny, color: colors.muted },
  amtValue: { ...font.small, fontWeight: '700', color: colors.text },

  empActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  act: {
    flex: 1, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  actPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },

  totalBox: {
    marginTop: spacing.md, backgroundColor: '#f0fdf4', borderTopWidth: 2, borderTopColor: colors.green,
    borderRadius: radius.sm, padding: spacing.md,
  },
  totalTitle: { ...font.h3, color: colors.green, marginBottom: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { ...font.small, fontWeight: '500', color: colors.muted },
  totalValue: { ...font.small, fontWeight: '900' },
});
