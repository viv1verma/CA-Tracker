import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmt } from '../assignments/logic';
import { MONTH_NAMES, inr, type SalaryRecord } from './logic';

/**
 * printSalarySlip() — the web opens a print window with the rendered slip markup.
 * On Android there is no popup to print from, so expo-print renders the same
 * markup to a PDF and the share sheet takes the place of the browser print dialog.
 */
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The slip body, matching openSalarySlip()'s #salarySlipPrint markup. */
export function buildSlipHtml(s: SalaryRecord): string {
  const row = (l: string, v: string) =>
    `<div><span class="m">${esc(l)}:</span> <strong>${esc(v)}</strong></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; padding: 4px; }
  .head { text-align: center; border-bottom: 2px solid #1a56db; padding-bottom: 14px; margin-bottom: 14px; }
  .logo { font-size: 24px; font-weight: 900; color: #1a56db; letter-spacing: 2px; }
  .firm { font-size: 11px; color: #6b7280; }
  .title { font-size: 14px; font-weight: 800; margin-top: 6px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; font-size: 12px; }
  .m { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
  thead th { background: #1a56db; color: #fff; padding: 8px 10px; text-align: left; }
  thead th.r { text-align: right; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
  tbody td.r { text-align: right; }
  .red { color: #dc2626; }
  tfoot .gross td { background: #f0fdf4; font-weight: 900; font-size: 13px; padding: 10px; }
  tfoot .net td { background: #1a56db; color: #fff; font-size: 16px; font-weight: 900; padding: 12px 10px; }
  .foot { font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 10px; }
</style></head><body>
<div class="head">
  <div class="logo">G A R P</div>
  <div class="firm">&amp; Associates — ${esc(s.branch || '')}</div>
  <div class="title">SALARY SLIP — ${esc(MONTH_NAMES[s.month - 1])} ${esc(s.year)}</div>
</div>
<div class="meta">
  ${row('Employee', s.userName)}
  ${row('Designation', s.designation || '—')}
  ${row('Department', s.branch || '—')}
  ${row('Joining', s.joiningDate ? fmt(s.joiningDate) : '—')}
  ${row('Working Days', String(s.workingDays))}
  ${row('Present Days', String(s.presentDays))}
  ${row('Absent', String(s.absentDays))}
  ${row('Leave Balance', `${s.leaveBalance?.remaining ?? 0} days`)}
</div>
<table>
  <thead><tr><th>EARNINGS</th><th class="r">AMOUNT</th><th>DEDUCTIONS</th><th class="r">AMOUNT</th></tr></thead>
  <tbody>
    <tr><td>Basic Salary</td><td class="r">${inr(s.basic)}</td><td>Absence Deduction</td><td class="r red">${inr(s.absenceDeduction)}</td></tr>
    <tr><td>HRA</td><td class="r">${inr(s.hra)}</td><td>PF (12%)</td><td class="r red">${inr(s.pf)}</td></tr>
    <tr><td>Conveyance</td><td class="r">${inr(s.conveyance)}</td><td>ESI (0.75%)</td><td class="r red">${inr(s.esi)}</td></tr>
    <tr><td>Other Allowance</td><td class="r">${inr(s.otherAllowance)}</td><td></td><td></td></tr>
  </tbody>
  <tfoot>
    <tr class="gross"><td>GROSS SALARY</td><td class="r">${inr(s.grossSalary)}</td><td>TOTAL DEDUCTIONS</td><td class="r red">${inr(s.totalDeduction)}</td></tr>
    <tr class="net"><td colspan="2">NET PAY</td><td colspan="2" class="r">${inr(s.netPay)}</td></tr>
  </tfoot>
</table>
<div class="foot">This is a computer generated salary slip. | G A R P &amp; Associates | Generated: ${esc(new Date().toLocaleDateString('en-IN'))}</div>
</body></html>`;
}

export async function printSalarySlip(s: SalaryRecord): Promise<void> {
  // printToFileAsync writes to a private temp path the FileProvider may not read,
  // so take the bytes back and write our own cache file under a meaningful name.
  const printed = await Print.printToFileAsync({ html: buildSlipHtml(s), base64: true });
  if (!printed.base64) throw new Error('The PDF renderer returned no data.');

  const safe = (s.userName || 'Employee').replace(/[^A-Za-z0-9]+/g, '_');
  const name = `GARP_Salary_Slip_${safe}_${s.year}_${String(s.month).padStart(2, '0')}.pdf`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(printed.base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri: target.uri });
  }
}
