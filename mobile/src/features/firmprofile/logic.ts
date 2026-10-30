/**
 * pg-firmprofile. ICAI firm details, the partner/member roster, the encrypted
 * document vault, the client-wise audit-experience registry and the ICAI card
 * import. Ported from initFirmProfilePage() and friends.
 *
 * The page reads on load — GET /firm-profile plus GET /tenders/sync-status —
 * and every write (save, card apply, doc upload/apply/delete, experience
 * add/edit/delete, member remove, sync now) is behind an explicit action.
 */

export interface FirmMember {
  name?: string;
  membershipNo: string;
  status?: string;
  isPartner?: boolean;
  joinedFirmDate?: string;
  enrolmentDate?: string;
  fellowDate?: string;
  source?: string;
}

export interface FirmDoc {
  id: string;
  fieldKey: string;
  label?: string;
  docNo?: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  ext?: string;
  size?: number;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface FirmExperience {
  id: string;
  client?: string;
  clientType?: string;
  assignmentType?: string;
  sector?: string;
  fromDate?: string;
  toDate?: string;
  ongoing?: boolean;
  feeValue?: number;
  refNo?: string;
  remarks?: string;
}

export interface CardImport {
  kind: string;
  at: string;
  byName?: string;
  fields?: string;
}

/** GET /api/firm-profile */
export interface FirmProfile {
  configured?: boolean;
  firmName?: string;
  frn?: string;
  constitutionDate?: string;
  experienceYears?: number;
  pan?: string;
  gstin?: string;
  msme?: string;
  partnersTotal?: number;
  fcaPartners?: number;
  caEmployees?: number;
  totalStaff?: number;
  turnoverY1?: number;
  turnoverY2?: number;
  turnoverY3?: number;
  peerReview?: boolean;
  peerReviewValidTill?: string;
  cagEmpanelled?: boolean;
  cagCategory?: string;
  rbiEmpanelled?: boolean;
  gemRegistered?: boolean;
  psuAuditExp?: boolean;
  bankAuditExp?: boolean;
  autoSync?: boolean;
  states?: string[];
  headOfficeCity?: string;
  branchCities?: string[];
  defaultTenderPartnerId?: string;
  defaultTenderPartnerName?: string;
  members?: FirmMember[];
  docs?: FirmDoc[];
  docsRestricted?: boolean;
  experience?: FirmExperience[];
  cardImports?: CardImport[];
}

/** GET /api/tenders/sync-status */
export interface SyncStatus {
  at?: string;
  error?: string;
  found?: number;
  imported?: number;
  analysed?: number;
  autoSync?: boolean;
}

/** GET /api/firm-profile/docs/meta */
export interface DocMeta {
  fields: { key: string; label: string }[];
  maxBytes: number;
  accepts: string[];
  keyConfigured: boolean;
}

/** GET /api/firm-profile/experience/meta */
export interface ExpMeta {
  clientTypes: string[];
  assignmentTypes: string[];
}

/** ensureExpMeta()'s fallback list, used verbatim when the request fails. */
export const EXP_META_FALLBACK: ExpMeta = {
  clientTypes: ['PSU', 'PSU Bank', 'Government', 'Listed Company', 'Private Company', 'Other'],
  assignmentTypes: ['Statutory Audit', 'Internal Audit', 'Concurrent Audit', 'Tax Audit', 'GST Audit', 'Other'],
};

/** DOC_FIELD_LABEL from the review panel. */
export const DOC_FIELD_LABEL: Record<string, string> = {
  gstin: 'GSTIN', pan: 'PAN', msme: 'MSME / Udyam', frn: 'Firm Registration No.',
};

export const CAG_CATEGORIES = [
  { value: '', label: '—' }, { value: 'I', label: 'I' }, { value: 'II', label: 'II' },
  { value: 'III', label: 'III' }, { value: 'IV', label: 'IV' },
];

export const MEMBER_STATUSES = [
  { value: '', label: '—' }, { value: 'ACA', label: 'ACA' }, { value: 'FCA', label: 'FCA' },
];

export const DOC_MAX_BYTES = 8 * 1024 * 1024;
export const CARD_MAX_BYTES = 14 * 1024 * 1024;

/** saveFirmProfile()'s format checks — they warn, they never block. */
export function registrationWarnings(pan: string, gstin: string): string[] {
  const p = pan.toUpperCase().trim();
  const g = gstin.toUpperCase().trim();
  const warns: string[] = [];
  if (p && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) warns.push('PAN doesn’t look like AAAFG1234A');
  if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) {
    warns.push('GSTIN doesn’t look like 09AAAFG1234A1Z5');
  }
  if (g && p && g.slice(2, 12) !== p) warns.push('GSTIN doesn’t contain this PAN (chars 3-12)');
  return warns;
}

/** docSizeStr(), verbatim. */
export function docSizeStr(n?: number): string {
  const v = Number(n) || 0;
  return v < 1024 ? `${v} B`
    : v < 1048576 ? `${(v / 1024).toFixed(0)} KB`
      : `${(v / 1048576).toFixed(1)} MB`;
}

/** The vault's expiry banding: expired, or due inside 45 days. */
export function docExpiryState(expiryDate?: string): 'none' | 'expired' | 'soon' | 'ok' {
  if (!expiryDate) return 'none';
  const today = new Date().toISOString().slice(0, 10);
  if (expiryDate < today) return 'expired';
  const soon = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  return expiryDate < soon ? 'soon' : 'ok';
}

/** expYearsStr(), verbatim. */
export function expYearsStr(r: FirmExperience): string {
  if (!r.fromDate) return '—';
  const a = r.fromDate.slice(0, 4);
  const b = r.ongoing ? 'present' : (r.toDate ? r.toDate.slice(0, 4) : '—');
  return `${a} – ${b}`;
}

/** renderFirmExp()'s summary line, with the same regexes. */
export function experienceSummary(list: FirmExperience[]): string {
  if (!list.length) return '';
  const psu = list.filter((r) =>
    /psu|public|undertaking|government|nigam|authorit|statutory|autonomous/i.test(r.clientType || '')).length;
  const bank = list.filter((r) => /bank/i.test(r.clientType || '')).length;
  const intl = list.filter((r) => /internal/i.test(r.assignmentType || '')).length;
  return `${list.length} engagement(s) · ${psu} PSU/Govt · ${bank} bank(s) · ${intl} internal audit(s)`;
}

/** renderFirmMembers()'s count line. */
export function memberCountLine(list: FirmMember[]): string {
  const partners = list.filter((m) => m.isPartner);
  const fca = partners.filter((m) => String(m.status).toUpperCase() === 'FCA').length;
  return `${list.length} listed · ${partners.length} partner(s) · ${fca} FCA`;
}

/** loadSyncStatus()'s one-line summary. */
export function syncStatusLine(s: SyncStatus | null): string {
  if (!s || !s.at) return 'Tender sync: not run yet.';
  const head = s.error
    ? `⚠ Last sync failed: ${s.error}`
    : `✓ Last sync ${new Date(s.at).toLocaleString('en-IN')} — ${s.found || 0} listed, ${s.imported || 0} new, ${s.analysed || 0} PDF(s) read`;
  return `${head} · auto-sync ${s.autoSync ? 'ON (hourly)' : 'OFF'}`;
}
