import React from 'react';
import { Text, View } from 'react-native';
import { colors, font } from '../../theme/theme';
import { fmt, fmtDT } from '../assignments/logic';
import { Pill, RBar, RCard, RCell, RRow, RStats, RTable } from './parts';
import type {
  ClientReportRow, DueDateLogRow, OverdueRow, PerformanceRow, WorkloadRow,
} from './logic';

/** The five table-shaped reports: rpPerformance, rpWorkload, rpOverdue, rpClients, rpDueDateLog. */

const twoLine = (main: string, sub: string) => (
  <View>
    <Text style={{ ...font.small, fontWeight: '700', color: colors.text }} numberOfLines={1}>{main}</Text>
    <Text style={{ ...font.tiny, fontWeight: '500', color: colors.muted }} numberOfLines={1}>{sub}</Text>
  </View>
);

export function PerformanceReport({ data }: { data: PerformanceRow[] }) {
  const tot = data.reduce((s, m) => s + m.total, 0);
  const dn = data.reduce((s, m) => s + m.completed, 0);
  const od = data.reduce((s, m) => s + m.overdue, 0);
  const avg = data.length
    ? Math.round(data.reduce((s, m) => s + (m.performancePct || 0), 0) / data.length)
    : 0;
  // rpPerformance() sorts by rate and medals the top three.
  const rows = [...data].sort((a, b) => (b.performancePct || 0) - (a.performancePct || 0));

  return (
    <>
      <RStats items={[
        { l: 'Total', v: tot },
        { l: 'Completed', v: dn, c: colors.green },
        { l: 'Overdue', v: od, c: colors.red },
        { l: 'Avg Rate', v: `${avg}%`, c: colors.amber },
      ]} />
      <RCard title="👥 Team Performance" sub={`${data.length} members`}>
        <RTable head={['MEMBER', 'TOTAL', 'DONE', 'WIP', 'OD', 'RATE']}
          widths={[170, 60, 55, 55, 50, 120]}>
          {rows.map((m, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            return (
              <RRow key={m.memberId} index={i}>
                <RCell width={170}>
                  {twoLine(`${medal} ${m.memberName || '—'}`.trim(), m.designation || '—')}
                </RCell>
                <RCell width={60} align="center">{m.total}</RCell>
                <RCell width={55} align="center" style={{ color: colors.green, fontWeight: '700' }}>{m.completed}</RCell>
                <RCell width={55} align="center" style={{ color: colors.amber }}>{m.inProgress || 0}</RCell>
                <RCell width={50} align="center" style={{ color: colors.red, fontWeight: '700' }}>{m.overdue}</RCell>
                <RCell width={120}><RBar pct={m.performancePct || 0} /></RCell>
              </RRow>
            );
          })}
        </RTable>
      </RCard>
    </>
  );
}

export function WorkloadReport({ data }: { data: WorkloadRow[] }) {
  const sorted = [...data].sort((a, b) => b.active - a.active);
  const mx = Math.max(...sorted.map((x) => x.active), 1);
  return (
    <RCard title="⚖ Workload Distribution" sub="Active tasks per member">
      <RTable head={['MEMBER', 'ACTIVE LOAD', 'TOTAL', 'OVERDUE', 'RATE']}
        widths={[170, 150, 60, 70, 55]}>
        {sorted.map((m, i) => (
          <RRow key={m.id} index={i}>
            <RCell width={170}>{twoLine(m.name, m.designation || '—')}</RCell>
            <RCell width={150}>
              <View>
                <RBar pct={Math.round((m.active / mx) * 100)} />
                <Text style={{ ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 }}>
                  {m.active} active tasks
                </Text>
              </View>
            </RCell>
            <RCell width={60} align="center">{m.total}</RCell>
            <RCell width={70} align="center" style={{ color: colors.red, fontWeight: '700' }}>{m.overdue}</RCell>
            <RCell width={55} align="center">{`${m.completionRate}%`}</RCell>
          </RRow>
        ))}
      </RTable>
    </RCard>
  );
}

export function OverdueReport({ data }: { data: OverdueRow[] }) {
  return (
    <>
      <View style={{
        backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fecaca',
        borderRadius: 10, padding: 12, marginBottom: 12,
      }}>
        <Text style={{ ...font.small, fontWeight: '700', color: colors.red }}>
          🔴 {data.length} overdue task{data.length > 1 ? 's' : ''} require attention
        </Text>
      </View>
      <RCard title="🔴 Overdue Tasks" sub="Sorted by days late">
        <RTable head={['CLIENT', 'WORK TYPE', 'ASSIGNED TO', 'DUE DATE', 'OVERDUE BY', 'PRIORITY']}
          widths={[140, 150, 140, 100, 100, 90]}>
          {data.map((a, i) => {
            // The web's urgency bands: 30d red, 14d amber, otherwise grey.
            const urg = a.daysOverdue >= 30 ? colors.red : a.daysOverdue >= 14 ? colors.amber : colors.muted;
            return (
              <RRow key={a.id} index={i}>
                <RCell width={140} style={{ fontWeight: '700' }}>{a.clientName}</RCell>
                <RCell width={150}>{a.workType}</RCell>
                <RCell width={140} style={{ color: colors.primary, fontWeight: '700' }}>{a.memberName}</RCell>
                <RCell width={100} style={{ color: colors.red }}>{a.dueDate}</RCell>
                <RCell width={100}>
                  <Pill text={`${a.daysOverdue}d late`} bg={`${urg}22`} fg={urg} />
                </RCell>
                <RCell width={90}>
                  <Pill text={a.priority || 'Normal'} bg="#fef3c7" fg="#92400e" />
                </RCell>
              </RRow>
            );
          })}
        </RTable>
      </RCard>
    </>
  );
}

export function ClientsReport({ data }: { data: ClientReportRow[] }) {
  const totT = data.reduce((s, c) => s + c.total, 0);
  const totD = data.reduce((s, c) => s + c.completed, 0);
  return (
    <>
      <RStats items={[
        { l: 'Clients', v: data.length },
        { l: 'Total Tasks', v: totT, c: colors.purple },
        { l: 'Completed', v: totD, c: colors.green },
        { l: 'Rate', v: `${totT ? Math.round((totD / totT) * 100) : 0}%`, c: colors.amber },
      ]} />
      <RCard title="🏢 Client Summary" sub={`${data.length} clients`}>
        <RTable head={['CLIENT', 'TOTAL', 'DONE', 'PENDING', 'OVERDUE', 'COMPLETION', 'TOP WORK']}
          widths={[180, 60, 55, 75, 75, 110, 130]}>
          {data.map((cl, i) => {
            const top = Object.entries(cl.workTypes || {}).sort((a, b) => b[1] - a[1])[0];
            return (
              <RRow key={cl.id} index={i}>
                <RCell width={180}>
                  {twoLine(cl.name, `${cl.type || '—'}${cl.branch ? ` · ${cl.branch}` : ''}`)}
                </RCell>
                <RCell width={60} align="center" style={{ fontWeight: '900', color: colors.primary }}>{cl.total}</RCell>
                <RCell width={55} align="center" style={{ color: colors.green, fontWeight: '700' }}>{cl.completed}</RCell>
                <RCell width={75} align="center" style={{ color: colors.amber }}>{cl.pending}</RCell>
                <RCell width={75} align="center" style={{ color: colors.red, fontWeight: '700' }}>{cl.overdue}</RCell>
                <RCell width={110}><RBar pct={cl.completionRate} /></RCell>
                <RCell width={130} style={{ color: colors.muted }}>{top ? top[0] : '—'}</RCell>
              </RRow>
            );
          })}
        </RTable>
      </RCard>
    </>
  );
}

export function DueDateLogReport({ data }: { data: DueDateLogRow[] }) {
  const viaLabel: Record<string, string> = {
    'edit': 'CA edit', 'admin-edit': 'Admin edit', 'request-approved': 'Request approved',
  };
  const extendedCount = data.filter(
    (g) => g.oldDueDate && g.newDueDate && new Date(g.newDueDate) > new Date(g.oldDueDate),
  ).length;

  return (
    <>
      <RStats items={[
        { l: 'Total Changes', v: data.length },
        { l: 'Extensions', v: extendedCount, c: colors.amber },
      ]} />
      <RCard title="📆 Due Date Change Log" sub={`${data.length} entries`}>
        <RTable head={['WHEN', 'TASK', 'CHANGE', 'CHANGED BY']} widths={[140, 190, 190, 160]}>
          {data.map((g, i) => {
            const extended = !!(g.oldDueDate && g.newDueDate
              && new Date(g.newDueDate) > new Date(g.oldDueDate));
            const dir = extended
              ? { text: '▶ extended', color: colors.amber }
              : g.oldDueDate && g.newDueDate
                ? { text: '◀ advanced', color: colors.green }
                : { text: 'set', color: colors.muted };
            return (
              <RRow key={`${g.date}-${i}`} index={i}>
                <RCell width={140} style={{ color: colors.muted }}>{fmtDT(g.date)}</RCell>
                <RCell width={190}>{twoLine(g.clientName, `${g.workType} · ${g.memberName}`)}</RCell>
                <RCell width={190}>
                  <View>
                    <Text style={{ ...font.small, color: colors.text }}>
                      {fmt(g.oldDueDate)} → <Text style={{ fontWeight: '800' }}>{fmt(g.newDueDate)}</Text>
                    </Text>
                    <Text style={{ ...font.tiny, color: dir.color, fontWeight: '700' }}>{dir.text}</Text>
                  </View>
                </RCell>
                <RCell width={160}>
                  {twoLine(g.changedByName, `${g.changedByQual || ''} · ${viaLabel[g.via || ''] || g.via || ''}`)}
                </RCell>
              </RRow>
            );
          })}
        </RTable>
      </RCard>
    </>
  );
}
