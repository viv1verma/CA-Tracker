import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import type { SalaryRecord } from './logic';

/**
 * exportSalaryExcel() — the same single "Salary Sheet" tab the web writes. The
 * browser's XLSX.writeFile() download becomes a base64 write into the app cache
 * plus the Android share sheet.
 */
export function buildSalaryWorkbook(rows: SalaryRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const data = rows.map((s) => ({
    'Employee': s.userName,
    'Designation': s.designation || '—',
    'Branch': s.branch || '—',
    'Working Days': s.workingDays,
    'Present': s.presentDays,
    'Absent': s.absentDays,
    'Basic': s.basic,
    'HRA': s.hra,
    'Conveyance': s.conveyance,
    'Other': s.otherAllowance,
    'Gross': s.grossSalary,
    'Absence Deduction': s.absenceDeduction,
    'PF': s.pf,
    'ESI': s.esi,
    'Total Deduction': s.totalDeduction,
    'Net Pay': s.netPay,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Salary Sheet');
  return wb;
}

export async function exportSalaryExcel(
  rows: SalaryRecord[],
  month: string,
  year: string,
): Promise<void> {
  const base64 = XLSX.write(buildSalaryWorkbook(rows), { type: 'base64', bookType: 'xlsx' }) as string;

  const name = `GARP_Salary_${year}_${String(month).padStart(2, '0')}.xlsx`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: name,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
}
