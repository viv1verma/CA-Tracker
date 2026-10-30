import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Assignment, Client } from '../../data/types';
import { daysOld, fmt, fmtDT } from './logic';

/**
 * The native replacement for exportPDF(), which used jsPDF + autoTable and a
 * browser download. expo-print renders the same landscape A4 table, and the
 * share sheet takes the place of the download — a sandboxed WebView cannot
 * save files to the device on its own.
 */
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HEAD = ['Client', 'Member', 'Work', 'Type', 'Status', '%', 'Age', 'Due', 'Completed', 'On Time', 'Remark'];

export function buildReportHtml(rows: Assignment[], clientsById: Record<string, Client>): string {
  const body = rows.map((a) => [
    clientsById[a.clientId]?.name || '—',
    a.memberName || '—',
    a.workType,
    a.isSubAssignment ? 'Sub' : 'Main',
    a.status || 'Pending',
    `${a.completionPct || 0}%`,
    `${daysOld(a)}d`,
    fmt(a.dueDate),
    a.completedAt ? fmtDT(a.completedAt) : '—',
    a.completedAt ? (a.completedOnTime ? 'Yes' : 'Late') : '—',
    a.remark || '—',
  ]);

  const generated = new Date().toLocaleDateString('en-IN');
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111827; }
  h1 { font-size: 16px; color: #1a56db; margin: 0 0 4px; }
  .sub { font-size: 9px; color: #6b7280; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 7pt; }
  th { background: #1a56db; color: #fff; text-align: left; padding: 4px 3px; }
  td { padding: 4px 3px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .empty { font-size: 11px; color: #6b7280; padding: 20px 0; }
</style></head><body>
<h1>G A R P — Assignment Report</h1>
<p class="sub">Generated: ${esc(generated)} · ${body.length} assignment${body.length === 1 ? '' : 's'}</p>
${body.length
    ? `<table><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="empty">No assignments to report.</p>'}
</body></html>`;
}

/**
 * Renders the PDF and hands it to the Android share sheet — the native stand-in
 * for the browser download that jsPDF's doc.save() triggered.
 */
export async function exportAssignmentsPdf(
  rows: Assignment[],
  clientsById: Record<string, Client>,
): Promise<void> {
  // printToFileAsync writes to a private temp path that neither the file API nor the
  // FileProvider may read, so take the bytes back and write our own cache file. That
  // also lets the report carry the same name the web download used.
  const printed = await Print.printToFileAsync({
    html: buildReportHtml(rows, clientsById),
    base64: true,
  });
  if (!printed.base64) throw new Error('The PDF renderer returned no data.');

  const name = `GARP_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(printed.base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'GARP Assignment Report',
      UTI: 'com.adobe.pdf',
    });
  } else {
    // No share target (rare): the system print dialog can still save a PDF.
    await Print.printAsync({ uri: target.uri });
  }
}
