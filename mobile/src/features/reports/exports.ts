import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config/env';
import { endpoints } from '../../api/endpoints';
import type { AuditLog, RecurringReport } from './logic';

/**
 * The Reports page's four downloads. Every browser download becomes a base64
 * write into the app cache plus the Android share sheet, and the two print
 * windows become expo-print PDFs.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encode raw bytes without depending on btoa, which Hermes may not have. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]; const b1 = bytes[i + 1]; const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

async function shareCacheFile(name: string, base64: string, mimeType: string, uti: string) {
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(base64, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, { mimeType, dialogTitle: name, UTI: uti });
  }
  return target;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

/** downloadLeaveReport() — the server renders this workbook, so just fetch it. */
export async function downloadLeaveReport(token: string | null, branch: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branch && branch !== 'all') headers['X-Active-Branch'] = encodeURIComponent(branch);

  const res = await fetch(`${API_BASE_URL}${endpoints.leaveReportXlsx}`, { headers });
  if (!res.ok) throw new Error('Could not generate');
  const buf = await res.arrayBuffer();
  await shareCacheFile('Leave_Report.xlsx', toBase64(new Uint8Array(buf)), XLSX_MIME, XLSX_UTI);
}

/** downloadAudit() — built client-side from the rows currently on screen. */
export async function downloadAuditExcel(entries: AuditLog['entries']): Promise<void> {
  const rows = entries.map((e) => ({
    'When': new Date(e.at).toLocaleString('en-IN'),
    'Who': e.actorName,
    'Role': e.actorRole || '',
    'Action': e.action,
    'Area': e.entity,
    'Subject': e.label || '',
    'What changed': e.details || '',
    'IP': e.ip || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 60 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  await shareCacheFile('GARP_Audit_Trail.xlsx', base64, XLSX_MIME, XLSX_UTI);
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const REC_TITLE = 'GARP — Monthly Recurring Status';

function recTable(rep: RecurringReport) {
  const header = ['Client Name', 'Work Type', ...rep.months.map((m) => m.label)];
  const data = rep.rows.map((r) => [
    r.clientName, r.workType, ...r.cells.map((c) => (c ? c.status : '–')),
  ]);
  return { header, data };
}

/** downloadRecReport('excel') — the same title/subtitle rows and column widths. */
export async function downloadRecurringExcel(rep: RecurringReport): Promise<void> {
  const { header, data } = recTable(rep);
  const sub = `Generated ${new Date().toLocaleDateString('en-IN')}`;
  const aoa = [[REC_TITLE], [sub], [], header, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((_h, i) => ({ wch: i === 0 ? 26 : i === 1 ? 16 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recurring Status');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  await shareCacheFile('GARP_Recurring_Status.xlsx', base64, XLSX_MIME, XLSX_UTI);
}

/** downloadRecReport('pdf') — the web opens a print window; expo-print renders it. */
export async function downloadRecurringPdf(rep: RecurringReport): Promise<void> {
  const { header, data } = recTable(rep);
  const sc = (s: string) =>
    s === 'Completed' ? '#16a34a' : s === 'Pending' ? '#92400e'
      : s === 'In Progress' ? '#1d4ed8' : s === 'Under Review' ? '#5b21b6' : '#9ca3af';
  const ths = header.map((h, i) =>
    `<th style="padding:8px 10px;border:1px solid #1e3a8a;background:#1e3a8a;color:#fff;font-size:10px;text-align:${i < 2 ? 'left' : 'center'}">${esc(h)}</th>`).join('');
  const trs = data.map((r, ri) =>
    `<tr style="background:${ri % 2 ? '#f8fafc' : '#fff'}">${r.map((c, ci) =>
      `<td style="padding:6px 9px;border:1px solid #d1d5db;font-size:10px;${ci >= 2
        ? `text-align:center;font-weight:700;color:${sc(String(c))}`
        : `font-weight:${ci === 0 ? '700' : '400'}`}">${esc(c)}</td>`).join('')}</tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${REC_TITLE}</title></head>
<body style="font-family:Arial,sans-serif;padding:20px">
<h2 style="margin:0;color:#1e3a8a">${REC_TITLE}</h2>
<div style="font-size:12px;color:#6b7280;margin:4px 0 14px">Generated ${esc(new Date().toLocaleDateString('en-IN'))}</div>
<table style="border-collapse:collapse;width:100%"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
<div style="margin-top:18px;font-size:10px;color:#9ca3af">GARP &amp; Associates · www.garp.co.in</div>
</body></html>`;

  const printed = await Print.printToFileAsync({ html, base64: true });
  if (!printed.base64) throw new Error('The PDF renderer returned no data.');
  await shareCacheFile('GARP_Recurring_Status.pdf', printed.base64, 'application/pdf', 'com.adobe.pdf');
}

/**
 * exportReportPDF() — the web re-prints whatever the Monthly tab rendered. The
 * mobile equivalent rebuilds the same member/assignment/update structure as a PDF,
 * since there is no DOM to copy.
 */
export async function exportMonthlyReportPdf(
  data: import('./logic').MonthlyActivity,
  monthLabel: string,
): Promise<void> {
  const members = data.report.filter((m) => m.assignments.length > 0);
  const body = members.map((m) => `
<h3 style="margin:16px 0 4px;color:#1a56db">${esc(m.memberName)}
  <span style="font-size:11px;color:#6b7280;font-weight:400">${esc(m.designation || '')} · ${m.totalUpdatesThisMonth} updates · ${m.totalBackwardUpdates ? `⚠ ${m.totalBackwardUpdates} backward` : '✓ Clean'}</span></h3>
<table><thead><tr><th>Task</th><th>Progress</th><th>Age</th><th>Due</th><th>Updates</th><th>Backward</th></tr></thead>
<tbody>${m.assignments.map((a) => `<tr>
  <td>${esc(a.clientName)} — ${esc(a.workType)}</td>
  <td style="text-align:center">${a.currentPct}%</td>
  <td style="text-align:center">${a.daysSinceAssigned}d</td>
  <td style="text-align:center">${esc(a.dueDate || '—')}</td>
  <td style="text-align:center">${a.totalUpdates}</td>
  <td style="text-align:center">${a.backwardUpdates || '—'}</td></tr>`).join('')}</tbody></table>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>GARP Report</title>
<style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:8px}
th{background:#f9fafb;font-size:10px;text-align:left}</style></head><body>
<h2 style="margin:0;color:#1a56db">GARP — Monthly Activity Report</h2>
<div style="font-size:12px;color:#6b7280;margin:4px 0 10px">${esc(monthLabel)}</div>
${body || '<p style="color:#6b7280">No activity this month.</p>'}
</body></html>`;

  const printed = await Print.printToFileAsync({ html, base64: true });
  if (!printed.base64) throw new Error('The PDF renderer returned no data.');
  await shareCacheFile(
    `GARP_Monthly_Report_${data.monthKey}.pdf`, printed.base64, 'application/pdf', 'com.adobe.pdf',
  );
}
