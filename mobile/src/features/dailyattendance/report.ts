import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../../config/env';
import { endpoints } from '../../api/endpoints';
import { MONTH_NAMES } from './logic';

/**
 * downloadAttendanceReport(): the server renders the .xlsx itself, so the mobile
 * job is to fetch those bytes and hand them to the share sheet — the native
 * stand-in for the browser's blob download.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encode raw bytes without depending on btoa, which Hermes may not have. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export async function downloadAttendanceReport(
  month: string,
  year: string,
  token: string | null,
  branch: string,
): Promise<void> {
  const url = `${API_BASE_URL}${endpoints.attendanceReportXlsx}?month=${month}&year=${year}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // The report is branch-scoped server-side, so send the same header the app uses.
  if (branch && branch !== 'all') headers['X-Active-Branch'] = encodeURIComponent(branch);

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Could not generate report');
  const buf = await res.arrayBuffer();

  const name = `Attendance_${MONTH_NAMES[parseInt(month, 10) - 1]}_${year}.xlsx`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(toBase64(new Uint8Array(buf)), { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: name,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
}
