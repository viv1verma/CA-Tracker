import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import type { AuthUser } from '../../api/types';
import { fmtCli, periodLabel, type ClientTask } from './logic';

/**
 * downloadClientTasks() — the same two files the web offers. The browser download
 * and the print window both become a cache file handed to the Android share sheet.
 */
function build(tasks: ClientTask[], user: AuthUser | null, company: string) {
  const showCompany = !!user?.isGroup;
  const header = ['Task', ...(showCompany ? ['Company'] : []),
    'Period', 'Handled By', 'Due Date', 'Status', 'Progress %', 'Completed On'];
  const data = tasks.map((t) => {
    const r: string[] = [t.workType];
    if (showCompany) r.push(t.companyName || '');
    r.push(
      periodLabel(t.period), t.memberName || '', t.dueDate ? fmtCli(t.dueDate) : '',
      t.status || '', `${t.completionPct || 0}%`,
      t.status === 'Completed' && t.completedAt ? fmtCli(t.completedAt) : '',
    );
    return r;
  });
  const title = `${user?.name || 'GARP'} — Tasks`;
  const chosen = company && company !== 'all'
    ? (user?.companies || []).find((c) => c.id === company)?.name : '';
  const sub = `${chosen ? `Company: ${chosen}  ·  ` : ''}Generated ${new Date().toLocaleDateString('en-IN')}`;
  const fileBase = (user?.name || 'GARP').replace(/[^a-z0-9]/gi, '_');
  return { header, data, title, sub, fileBase, showCompany };
}

async function shareCacheFile(name: string, base64: string, mimeType: string, uti: string) {
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(base64, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, { mimeType, dialogTitle: name, UTI: uti });
  }
}

export async function exportClientTasksExcel(
  tasks: ClientTask[], user: AuthUser | null, company: string,
): Promise<void> {
  const { header, data, title, sub, fileBase, showCompany } = build(tasks, user, company);
  const aoa = [[title], [sub], [], header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 28 : h === 'Company' ? 24 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  void showCompany;
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  await shareCacheFile(`${fileBase}_Tasks.xlsx`, base64,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'org.openxmlformats.spreadsheetml.sheet');
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function exportClientTasksPdf(
  tasks: ClientTask[], user: AuthUser | null, company: string,
): Promise<void> {
  const { header, data, title, sub, fileBase, showCompany } = build(tasks, user, company);
  const sc = (s: string) => s === 'Completed' ? '#16a34a' : s === 'Pending' ? '#92400e' : '#2563eb';
  const statusIdx = showCompany ? 5 : 4;
  const ths = header.map((h) =>
    `<th style="padding:8px 10px;border:1px solid #1e3a8a;background:#1e3a8a;color:#fff;font-size:11px;text-align:left">${esc(h)}</th>`).join('');
  const trs = data.map((r, ri) =>
    `<tr style="background:${ri % 2 ? '#f8fafc' : '#fff'}">${r.map((c, ci) =>
      `<td style="padding:7px 10px;border:1px solid #d1d5db;font-size:11px;${ci === statusIdx
        ? `font-weight:700;color:${sc(c)}` : ''}">${esc(c) || '–'}</td>`).join('')}</tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title></head>
<body style="font-family:Arial,sans-serif;padding:24px">
<h2 style="margin:0;color:#1e3a8a">${esc(title)}</h2>
<div style="font-size:12px;color:#6b7280;margin:4px 0 16px">${esc(sub)}</div>
<table style="border-collapse:collapse;width:100%"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
<div style="margin-top:20px;font-size:10px;color:#9ca3af">GARP &amp; Associates · www.garp.co.in</div>
</body></html>`;

  const printed = await Print.printToFileAsync({ html, base64: true });
  if (!printed.base64) throw new Error('The PDF renderer returned no data.');
  await shareCacheFile(`${fileBase}_Tasks.pdf`, printed.base64, 'application/pdf', 'com.adobe.pdf');
}
