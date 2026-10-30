/**
 * Reading a file the user picked.
 *
 * expo-document-picker hands back a URI the sandboxed `File` API will not read —
 * `File(uri).base64Sync()` fails with "Missing 'READ' permission", and staging a
 * copy into the app cache or going through the legacy reader fails too. `fetch`
 * honours the grant the picker just handed us, so every picker read goes through
 * it. This was verified on device by the GST certificate flow.
 *
 * These helpers only turn a picked URI into bytes, base64 or text. Anything
 * endpoint-specific — a data: prefix, a MIME type, a filename, the JSON shape —
 * stays at the call site, because each endpoint wants something different.
 *
 * Not for server downloads: those already hold a normal http(s) response and
 * read `res.arrayBuffer()` directly.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encode raw bytes without depending on btoa, which Hermes may not have. */
export function toBase64(bytes: Uint8Array): string {
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

/** The raw bytes of a picked file. SheetJS reads these directly via type:'array'. */
export async function readPickedAsBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * A picked file as bare base64 — no `data:` prefix. Call sites that need one add
 * it themselves, since the MIME they declare is theirs to choose.
 */
export async function readPickedAsBase64(uri: string): Promise<string> {
  return toBase64(await readPickedAsBytes(uri));
}

/** A picked text file (the restore backup is JSON). */
export async function readPickedAsText(uri: string): Promise<string> {
  const res = await fetch(uri);
  return res.text();
}
