import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Select } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { monthOptions, yearOptions } from '../attendance/logic';
import AuditTrail from './AuditTrail';
import LeaveReportView from './LeaveReportView';
import MonthlyActivityView from './MonthlyActivity';
import RecurringStatus from './RecurringStatus';
import {
  ClientsReport, DueDateLogReport, OverdueReport, PerformanceReport, WorkloadReport,
} from './TableReports';
import {
  downloadLeaveReport, downloadRecurringExcel, downloadRecurringPdf, exportMonthlyReportPdf,
} from './exports';
import {
  initialReport, visibleReportTabs,
  type ClientReportRow, type DueDateLogRow, type LeaveDiagnostic, type LeaveReport,
  type MonthlyActivity, type OverdueRow, type PerformanceRow, type RecurringReport,
  type ReportType, type WorkloadRow,
} from './logic';

/**
 * pg-reports — nine report tabs. Reading only: initReports() opens Performance
 * for an admin and Monthly Status for everyone else, and every tab issues a
 * single GET. The Leave tab's "Recover Past Leaves" (POST /leave-migrate) is the
 * page's only write and is user-triggered behind a confirmation.
 */
export default function ReportsScreen() {
  const { user, token, branch } = useAuth();
  const { showToast } = useToast();

  const tabs = visibleReportTabs(user);
  const [tab, setTab] = useState<ReportType>(() => initialReport(user));

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [recMonths, setRecMonths] = useState('6');

  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<unknown>(null);
  // Which tab the payload belongs to: switching tabs must not render the previous
  // report's data through the new report's renderer while the fetch is in flight.
  const [loadedTab, setLoadedTab] = useState<ReportType | null>(null);
  const [diagnostic, setDiagnostic] = useState<LeaveDiagnostic | null>(null);

  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [leaveDownloading, setLeaveDownloading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      switch (tab) {
        case 'performance':
          setPayload(await api.get<PerformanceRow[]>(endpoints.performance)); break;
        case 'monthly':
          setPayload(await api.get<MonthlyActivity>(
            `${endpoints.monthlyReport}?month=${month}&year=${year}`)); break;
        case 'workload':
          setPayload(await api.get<WorkloadRow[]>(endpoints.reportsWorkload)); break;
        case 'overdue':
          setPayload(await api.get<OverdueRow[]>(endpoints.reportsOverdue)); break;
        case 'clients':
          setPayload(await api.get<ClientReportRow[]>(endpoints.reportsClients)); break;
        case 'duedatelog':
          setPayload(await api.get<DueDateLogRow[]>(endpoints.dueDateLog)); break;
        case 'leave': {
          // The web asks the diagnostic first and swallows its failure.
          try {
            setDiagnostic(await api.get<LeaveDiagnostic>(endpoints.leaveDiagnostic, { background: true }));
          } catch { setDiagnostic(null); }
          setPayload(await api.get<LeaveReport>(endpoints.leaveReport));
          break;
        }
        case 'recurring':
          setPayload(await api.get<RecurringReport>(
            `${endpoints.recurringReport}?months=${recMonths}`)); break;
        case 'audit':
          setPayload(null); break;   // AuditTrail fetches and filters on its own
      }
      setLoadedTab(tab);
      setState('idle');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the report');
      setState('error');
    }
  }, [tab, month, year, recMonths]);

  useEffect(() => { void load(); }, [load]);

  const recoverPastLeaves = () => {
    Alert.alert(
      'Recover past leaves',
      'Bring the past leave records from the old system into the history & report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recover',
          onPress: async () => {
            setRecovering(true);
            try {
              const r = await api.post<{ movedNow: number }>(endpoints.leaveMigrate, {});
              showToast(`Recovered ${r?.movedNow || 0} past leave record(s) ✓`);
              await load();
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not recover', 'error');
            } finally {
              setRecovering(false);
            }
          },
        },
      ],
    );
  };

  const leaveExcel = async () => {
    setLeaveDownloading(true);
    showToast('Preparing Excel…');
    try {
      await downloadLeaveReport(token, branch);
      showToast('Downloaded ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setLeaveDownloading(false);
    }
  };

  const recExport = async (kind: 'excel' | 'pdf') => {
    const rep = payload as RecurringReport | null;
    if (!rep?.rows.length) { showToast('Nothing to download', 'error'); return; }
    setBusy(kind);
    try {
      if (kind === 'excel') { await downloadRecurringExcel(rep); showToast('Excel downloaded'); }
      else { await downloadRecurringPdf(rep); showToast('PDF ready'); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const monthlyPdf = async () => {
    const d = payload as MonthlyActivity | null;
    if (!d) return;
    setPdfBusy(true);
    try {
      const label = new Date(d.year, d.month - 1, 1)
        .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      await exportMonthlyReportPdf(d, label);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setPdfBusy(false);
    }
  };

  const body = () => {
    if (tab === 'audit') return <AuditTrail />;
    if (state === 'loading' || loadedTab !== tab) {
      return <Text style={styles.msg}>Loading...</Text>;
    }
    if (state === 'error') return <Text style={[styles.msg, { color: colors.red }]}>Error: {error}</Text>;

    switch (tab) {
      case 'performance': {
        const d = payload as PerformanceRow[];
        return d?.length ? <PerformanceReport data={d} /> : <Text style={styles.msg}>No team data yet</Text>;
      }
      case 'monthly':
        return payload ? <MonthlyActivityView data={payload as MonthlyActivity} /> : null;
      case 'workload': {
        const d = payload as WorkloadRow[];
        return d?.length ? <WorkloadReport data={d} /> : <Text style={styles.msg}>No data</Text>;
      }
      case 'overdue': {
        const d = payload as OverdueRow[];
        return d?.length ? <OverdueReport data={d} /> : (
          <View style={styles.okState}>
            <Text style={styles.okIcon}>✅</Text>
            <Text style={styles.okTitle}>No overdue tasks!</Text>
            <Text style={styles.okNote}>All tasks are on schedule.</Text>
          </View>
        );
      }
      case 'clients': {
        const d = payload as ClientReportRow[];
        return d?.length ? <ClientsReport data={d} /> : <Text style={styles.msg}>No clients yet</Text>;
      }
      case 'duedatelog': {
        const d = payload as DueDateLogRow[];
        return d?.length ? <DueDateLogReport data={d} />
          : <Text style={styles.msg}>No due-date changes recorded yet</Text>;
      }
      case 'leave':
        return payload ? (
          <LeaveReportView
            report={payload as LeaveReport}
            diagnostic={diagnostic}
            onRecover={recoverPastLeaves}
            onDownload={leaveExcel}
            recovering={recovering}
            downloading={leaveDownloading}
          />
        ) : null;
      case 'recurring':
        return (
          <RecurringStatus
            report={payload as RecurringReport | null}
            months={recMonths}
            onMonths={setRecMonths}
            onExcel={() => void recExport('excel')}
            onPdf={() => void recExport('pdf')}
            busy={busy}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}
        contentContainerStyle={{ gap: 2 }}>
        {tabs.map((t) => {
          const on = t.type === tab;
          return (
            <Pressable key={t.type} onPress={() => setTab(t.type)} accessibilityRole="button"
              style={[styles.tab, on && { backgroundColor: colors.primary }]}>
              <Text style={[styles.tabText, on && { color: colors.white, fontWeight: '800' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* rpMonthRow + rpPDFBtn: shown only on the Monthly tab, as the web does */}
      {tab === 'monthly' && (
        <>
          <View style={styles.monthRow}>
            <View style={{ flex: 1 }}>
              <Select value={month} placeholder="Month" options={monthOptions()} onChange={setMonth} />
            </View>
            <View style={{ width: 104 }}>
              <Select value={year} placeholder="Year" options={yearOptions()} onChange={setYear} />
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', marginBottom: spacing.md }}>
            <Button title="⬇ PDF" onPress={monthlyPdf} variant="outline" loading={pdfBusy} />
          </View>
        </>
      )}

      {body()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    backgroundColor: '#f3f4f6', borderRadius: radius.md, padding: 3, marginBottom: spacing.md,
  },
  tab: {
    height: 34, paddingHorizontal: 12, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  tabText: { ...font.small, fontWeight: '700', color: colors.muted },

  monthRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xxl },

  okState: { alignItems: 'center', padding: spacing.xxl },
  okIcon: { fontSize: 40, marginBottom: spacing.md },
  okTitle: { ...font.h2, color: colors.text },
  okNote: { ...font.small, color: colors.muted, marginTop: 6 },
});
