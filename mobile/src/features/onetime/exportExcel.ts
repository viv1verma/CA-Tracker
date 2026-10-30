import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import type { Assignment, Client, TeamUser } from '../../data/types';
import { daysOld, fmtDT, isOD } from '../assignments/logic';

/**
 * exportExcel() from pg-dashboard, sheet for sheet: a Summary of every member,
 * an All Tasks sheet, then one sheet per member. The browser's XLSX.writeFile()
 * download becomes a base64 write into the app cache plus the Android share sheet.
 */
export function buildWorkbook(
  assignments: Assignment[],
  clients: Client[],
  users: TeamUser[],
): XLSX.WorkBook {
  const cm = Object.fromEntries(clients.map((c) => [c.id, c]));
  const members = users.filter((u) => u.role === 'member');
  const wb = XLSX.utils.book_new();

  const summary = members.map((m) => {
    const mine = assignments.filter((a) => a.memberId === m.id);
    const comp = mine.filter((a) => a.status === 'Completed').length;
    const onTime = mine.filter((a) => a.completedOnTime === true).length;
    return {
      'Member': m.name,
      'Designation': m.designation || '—',
      'Total': mine.length,
      'Completed': comp,
      'On Time': onTime,
      'Late': comp - onTime,
      'In Progress': mine.filter((a) => a.status === 'In Progress').length,
      'Pending': mine.filter((a) => a.status === 'Pending').length,
      'Overdue': mine.filter((a) => isOD(a)).length,
      'Performance%': mine.length ? `${Math.round((onTime / mine.length) * 100)}%` : '—',
    };
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summary.length ? summary : [{ Info: 'No data' }]),
    'Summary',
  );

  const all = assignments.map((a) => ({
    'Client': cm[a.clientId]?.name || '—',
    'Member': a.memberName || '—',
    'Designation': users.find((u) => u.id === a.memberId)?.designation || '—',
    'Work Type': a.workType,
    'Type': a.isSubAssignment ? 'Sub-Assignment' : 'Main',
    'Status': a.status,
    '%': a.completionPct || 0,
    'Due': a.dueDate || '—',
    'Days Old': daysOld(a),
    'Completed At': a.completedAt ? fmtDT(a.completedAt) : '—',
    'On Time': a.completedAt ? (a.completedOnTime ? 'Yes' : 'Late') : '—',
    'Remark': a.remark || '—',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(all.length ? all : [{ Info: 'No assignments' }]),
    'All Tasks',
  );

  members.forEach((m) => {
    const mine = assignments
      .filter((a) => a.memberId === m.id)
      .map((a) => ({
        'Client': cm[a.clientId]?.name || '—',
        'Work Type': a.workType,
        'Status': a.status,
        '%': a.completionPct || 0,
        'Due': a.dueDate || '—',
        'Completed': a.completedAt ? fmtDT(a.completedAt) : '—',
        'On Time': a.completedAt ? (a.completedOnTime ? 'Yes' : 'Late') : '—',
        'Remark': a.remark || '—',
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(mine.length ? mine : [{ Info: 'No assignments' }]),
      m.name.slice(0, 28),
    );
  });

  return wb;
}

/** Writes the workbook to the app cache and opens the share sheet. */
export async function exportOneTimeExcel(
  assignments: Assignment[],
  clients: Client[],
  users: TeamUser[],
): Promise<void> {
  const wb = buildWorkbook(assignments, clients, users);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

  const name = `GARP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'GARP One-Time Tasks Report',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
}
