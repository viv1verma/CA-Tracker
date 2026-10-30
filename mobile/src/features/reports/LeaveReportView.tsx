import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import { Pill, RCell, RRow, RTable } from './parts';
import { isPaidLeaveType, type LeaveDiagnostic, type LeaveReport } from './logic';

/**
 * rpLeave() — the diagnostic banner, six totals, the per-employee summary and
 * the full application list. The banner's "Recover Past Leaves" is the only
 * write on the Reports page; it is never triggered on load.
 */
export default function LeaveReportView({
  report, diagnostic, onRecover, onDownload, recovering, downloading,
}: {
  report: LeaveReport;
  diagnostic: LeaveDiagnostic | null;
  onRecover: () => void;
  onDownload: () => void;
  recovering: boolean;
  downloading: boolean;
}) {
  const t = report.totals;

  // The web shows the banner only when the old store still holds unmigrated rows.
  const notMigrated = diagnostic
    ? diagnostic.oldStore.count - (diagnostic.newStore.migrated || 0)
    : 0;
  const showBanner = !!diagnostic && diagnostic.oldStore.count > 0
    && (notMigrated > 0 || diagnostic.newStore.count < diagnostic.oldStore.count);

  const stats = [
    { l: 'APPLICATIONS', v: t.applied || 0, c: colors.primary },
    { l: 'APPROVED', v: t.approved || 0, c: colors.green },
    { l: 'PENDING', v: t.pending || 0, c: colors.amber },
    { l: 'REJECTED', v: t.rejected || 0, c: colors.red },
    { l: 'PAID DAYS', v: t.paidDays || 0, c: '#2563eb' },
    { l: 'UNPAID DAYS', v: t.unpaidDays || 0, c: '#991b1b' },
  ];

  return (
    <>
      {showBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            <Text style={{ fontWeight: '800' }}>{diagnostic!.oldStore.count}</Text> past leave
            record(s) found in the old system. Tap to bring them into the history & report.
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <Button title="↻ Recover Past Leaves" onPress={onRecover} loading={recovering} />
          </View>
        </View>
      )}

      <View style={styles.downloadRow}>
        <Button title="📊 Download Excel" onPress={onDownload} variant="outline" loading={downloading} />
      </View>

      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.l} style={styles.stat}>
            <Text style={[styles.statValue, { color: s.c }]}>{s.v}</Text>
            <Text style={styles.statLabel}>{s.l}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Per-Employee Summary</Text>
      {!report.summary.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No leave applications yet.</Text>
        </View>
      ) : (
        <View style={styles.tableCard}>
          <RTable
            head={['EMPLOYEE', 'APPLIED', 'APPROVED', 'REJECTED', 'PENDING', 'APPR. DAYS', 'PAID', 'UNPAID']}
            widths={[170, 75, 85, 80, 75, 90, 60, 70]}
          >
            {report.summary.map((u, i) => (
              <RRow key={u.userId} index={i}>
                <RCell width={170} style={{ fontWeight: '700' }}>{u.name}</RCell>
                <RCell width={75} align="center">{u.applied}</RCell>
                <RCell width={85} align="center" style={{ color: colors.green, fontWeight: '700' }}>{u.approved}</RCell>
                <RCell width={80} align="center" style={{ color: colors.red }}>{u.rejected}</RCell>
                <RCell width={75} align="center" style={{ color: colors.amber }}>{u.pending}</RCell>
                <RCell width={90} align="center" style={{ fontWeight: '700' }}>{u.approvedDays}</RCell>
                <RCell width={60} align="center" style={{ color: '#2563eb', fontWeight: '800' }}>{u.paidDays}</RCell>
                <RCell width={70} align="center" style={{ color: '#991b1b', fontWeight: '800' }}>{u.unpaidDays}</RCell>
              </RRow>
            ))}
            <View style={styles.totalRow}>
              <RCell width={170} style={{ fontWeight: '800' }}>TOTAL</RCell>
              <RCell width={75} align="center" style={{ fontWeight: '800' }}>{t.applied}</RCell>
              <RCell width={85} align="center" style={{ fontWeight: '800' }}>{t.approved}</RCell>
              <RCell width={80} align="center" style={{ fontWeight: '800' }}>{t.rejected}</RCell>
              <RCell width={75} align="center" style={{ fontWeight: '800' }}>{t.pending}</RCell>
              <RCell width={90} align="center" style={{ fontWeight: '800' }}>{t.approvedDays}</RCell>
              <RCell width={60} align="center" style={{ fontWeight: '800', color: '#2563eb' }}>{t.paidDays}</RCell>
              <RCell width={70} align="center" style={{ fontWeight: '800', color: '#991b1b' }}>{t.unpaidDays}</RCell>
            </View>
          </RTable>
        </View>
      )}

      <Text style={styles.section}>All Applications</Text>
      <View style={styles.tableCard}>
        {!report.detail.length ? (
          <Text style={styles.emptyText}>No applications</Text>
        ) : (
          <RTable
            head={['EMPLOYEE', 'TYPE', 'PAID?', 'FROM', 'TO', 'DAYS', 'STATUS', 'REASON']}
            widths={[160, 130, 75, 100, 100, 55, 100, 200]}
          >
            {report.detail.map((r, i) => {
              const paid = isPaidLeaveType(r.type);
              const sc = r.status === 'approved' ? colors.green
                : r.status === 'rejected' ? colors.red : colors.amber;
              return (
                <RRow key={r.id} index={i}>
                  <RCell width={160} style={{ fontWeight: '600' }}>{r.memberName}</RCell>
                  <RCell width={130}>{r.type}</RCell>
                  <RCell width={75}>
                    <Pill text={paid ? 'Paid' : 'Unpaid'}
                      bg={paid ? '#dbeafe' : '#fee2e2'} fg={paid ? '#1e40af' : '#991b1b'} />
                  </RCell>
                  <RCell width={100}>{fmt(r.fromDate)}</RCell>
                  <RCell width={100}>{fmt(r.toDate)}</RCell>
                  <RCell width={55} align="center" style={{ fontWeight: '700' }}>{r.days}</RCell>
                  <RCell width={100}>
                    <Pill text={r.status.toUpperCase()} bg={`${sc}22`} fg={sc} />
                  </RCell>
                  <RCell width={200} style={{ color: colors.muted }}>{r.reason || '—'}</RCell>
                </RRow>
              );
            })}
          </RTable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  bannerText: { ...font.small, color: '#92400e' },

  downloadRow: { alignItems: 'flex-end', marginBottom: spacing.sm },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flexGrow: 1, minWidth: 100, backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10,
    paddingHorizontal: 14, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { ...font.tiny, color: colors.muted },

  section: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  tableCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.lg,
  },
  emptyCard: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.xl, marginBottom: spacing.lg,
  },
  emptyText: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  totalRow: { flexDirection: 'row', backgroundColor: '#eef2ff', alignItems: 'center' },
});
