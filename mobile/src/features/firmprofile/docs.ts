import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../../config/env';
import { endpoints } from '../../api/endpoints';
import type { FirmDoc } from './logic';

/**
 * viewDoc() — the web fetches the decrypted bytes with the auth token and opens
 * a short-lived blob URL so the file can't be linked or shared out. Android has
 * no blob URL, so the bytes go to a cache file that is handed straight to the
 * system viewer and then deleted, keeping the same "no durable copy" intent.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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

const MIME_FOR: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
};

export async function openFirmDoc(doc: FirmDoc, token: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${endpoints.firmDoc(doc.id)}`, { headers });
  if (!res.ok) {
    let msg = 'Could not open document';
    try { msg = (await res.json()).error || msg; } catch { /* keep the default */ }
    throw new Error(msg);
  }
  const buf = await res.arrayBuffer();

  const ext = String(doc.ext || 'pdf').toLowerCase();
  const name = `${(doc.label || 'document').replace(/[^A-Za-z0-9]+/g, '_')}.${ext}`;
  const target = new File(Paths.cache, name);
  try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
  target.create();
  target.write(toBase64(new Uint8Array(buf)), { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      mimeType: MIME_FOR[ext] || 'application/octet-stream',
      dialogTitle: doc.label || 'Document',
    });
  }
  // The web revokes its blob URL; drop the cache copy for the same reason.
  try { target.delete(); } catch { /* the viewer may still hold it */ }
}
