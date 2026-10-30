import * as DocumentPicker from 'expo-document-picker';
import { readPickedAsBase64 } from '../../lib/files';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { CLIENT_TYPES } from './logic';

/**
 * GST REG-06 certificate reader — gstCertRead() / gstCertApply() / gstCertReset().
 *
 * Two deliberate steps, as on the web: reading the certificate only *previews*
 * what was found, and nothing touches the form until "Fill the form with these"
 * is pressed. The preview also carries the parser's own per-field confidence so
 * a low-confidence guess is visible before it is accepted.
 */

/** POST /api/clients/gst-parse response, from gstcert.js parseGstCertificate(). */
export interface GstParseResult {
  ok?: boolean;
  fields: {
    gstin?: string;
    pan?: string;
    state?: string;
    legalName?: string;
    tradeName?: string;
    clientName?: string;
    constitution?: string;
    entityType?: string;
    address?: string;
  };
  confidence: Record<string, string>;
  warnings?: string[];
}

/** The web refuses anything over 8 MB before uploading; the server agrees. */
export const GST_MAX_BYTES = 8 * 1024 * 1024;

/** The preview rows, in the web's order, with their confidence keys. */
export const GST_PREVIEW_ROWS: { label: string; field: keyof GstParseResult['fields']; conf: string }[] = [
  { label: 'Name', field: 'clientName', conf: 'legalName' },
  { label: 'Trade name', field: 'tradeName', conf: 'tradeName' },
  { label: 'GSTIN', field: 'gstin', conf: 'gstin' },
  { label: 'PAN', field: 'pan', conf: 'pan' },
  { label: 'Entity type', field: 'entityType', conf: 'entityType' },
  { label: 'Address', field: 'address', conf: 'address' },
];

/** high → green, medium → amber, anything else → grey, as the web colours them. */
export const confidenceColor = (c?: string) =>
  c === 'high' ? '#15803d' : c === 'medium' ? '#92400e' : '#64748b';

/**
 * Pick a certificate and read it. The browser's FileReader data URL becomes a
 * base64 read; the body key stays `pdf` carrying bare base64, exactly as the web
 * sends it (the route strips a data: prefix too, but we match the web).
 */
export async function pickAndParseGstCert(): Promise<
  { status: 'cancelled' } | { status: 'too-large' } | { status: 'ok'; result: GstParseResult }
> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf', copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };
  const asset = picked.assets[0];
  if ((asset.size || 0) > GST_MAX_BYTES) return { status: 'too-large' };

  const b64 = await readPickedAsBase64(asset.uri);
  const result = await api.post<GstParseResult>(
    endpoints.clientsGstParse, { pdf: b64 }, { timeoutMs: 60000 },
  );
  return { status: 'ok', result };
}

/**
 * gstCertApply(): only non-empty values are written, so anything already typed
 * by hand survives. Address falls back to the state derived from the GSTIN, and
 * the entity type is accepted only when it names one of the form's own options —
 * the web matches it against the select's option text, which is the same list.
 *
 * Note the trade name is previewed but never applied: the client form has no
 * field for it, and the web does not set one either.
 */
export function applyGstFields(
  f: GstParseResult['fields'],
  set: {
    name: (v: string) => void;
    pan: (v: string) => void;
    gst: (v: string) => void;
    address: (v: string) => void;
    type: (v: string) => void;
  },
) {
  if (f.clientName) set.name(f.clientName);
  if (f.pan) set.pan(f.pan);
  if (f.gstin) set.gst(f.gstin);
  const addr = f.address || f.state;
  if (addr) set.address(addr);
  if (f.entityType && CLIENT_TYPES.includes(f.entityType)) set.type(f.entityType);
}
