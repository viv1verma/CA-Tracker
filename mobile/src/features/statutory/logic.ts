/**
 * pg-statutory ("Statutory Updates"). GST / Income-tax / ROC notifications the
 * firm circulates to the team. Ported from loadStatutory() and renderStatutory().
 */

export interface StatutoryUpdate {
  id: string;
  category: string;
  date?: string;
  title: string;
  refNo?: string;
  link?: string;
  note?: string;
  summary?: string;
  source?: string;
  addedByName?: string;
}

/** GET /api/statutory-updates */
export interface StatutoryPayload {
  updates: StatutoryUpdate[];
  categories: string[];
  firm?: Record<string, unknown>;
}

/** One candidate row returned by the paste parser. */
export interface ParsedItem {
  date?: string;
  title: string;
  refNo?: string;
  link?: string;
  category?: string;
}

/** Category tab colours, from SU_CATCOL. */
export const SU_CATCOL: Record<string, string> = {
  'GST': '#2a78d6',
  'Income Tax': '#1d9e75',
  'ROC / MCA': '#eda100',
  'TDS': '#7f77dd',
  'Other': '#64748b',
};

export const suCatColor = (c: string) => SU_CATCOL[c] || '#64748b';

/** Rows in the selected category, in the order the API returned them. */
export const suRows = (updates: StatutoryUpdate[], cat: string) =>
  updates.filter((u) => u.category === cat);

/** Per-category counts for the tab labels. */
export function suCounts(updates: StatutoryUpdate[]): Record<string, number> {
  const out: Record<string, number> = {};
  updates.forEach((u) => { out[u.category] = (out[u.category] || 0) + 1; });
  return out;
}

/** The row's brief: summary first, then note — matching the web's `crux`. */
export const crux = (u: StatutoryUpdate) => (u.summary || u.note || '').trim();

/** Auto-fetch only supports these two; the button maps anything else to GST. */
export const fetchCategoryFor = (cat: string) => (cat === 'Income Tax' ? 'Income Tax' : 'GST');

/** "05 Sep 2026" for the row's date column. */
export function fmtDate(d?: string): string {
  if (!d) return '—';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[3]} ${MN[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

/** Rows that still have no brief — what the auto-fill pass targets. */
export const needsBrief = (rows: StatutoryUpdate[]) => rows.filter((u) => !crux(u)).length;

/**
 * The summary document, byte for byte the same markup the web opens in a new
 * tab — an internal digest, deliberately not on firm letterhead.
 */
export function buildSummaryHtml(cat: string, chosen: StatutoryUpdate[]): string {
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const sources = [...new Set(chosen.map((u) => u.source).filter((s) => s && s !== 'Manual'))];
  const rows = chosen
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((u, i) =>
      '<tr>'
      + `<td style="padding:7px 8px;border:1px solid #ccc;text-align:center">${i + 1}</td>`
      + `<td style="padding:7px 8px;border:1px solid #ccc;white-space:nowrap">${u.date ? new Date(u.date).toLocaleDateString('en-GB') : '—'}</td>`
      + `<td style="padding:7px 8px;border:1px solid #ccc">${esc(u.title)}`
        + (u.refNo ? `<br><i style="color:#555;font-size:11px">${esc(u.refNo)}</i>` : '')
        + (u.note ? `<br><span style="color:#333;font-size:11px">${esc(u.note)}</span>` : '')
        + (u.link ? `<br><a href="${esc(u.link)}" style="color:#1a56db;font-size:10px">${esc(u.link)}</a>` : '')
      + '</td></tr>').join('');

  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<title>${esc(cat)} Statutory Updates — ${today}</title>`
    + '<style>@page{margin:16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px}'
    + 'h1{font-size:18px;margin:0 0 2px}.meta{font-size:12px;color:#555;margin-bottom:14px}'
    + 'table{width:100%;border-collapse:collapse;font-size:12px}'
    + 'th{background:#334155;color:#fff;padding:7px 8px;border:1px solid #334155;text-align:left;font-size:11px}'
    + '.ft{margin-top:20px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:8px}'
    + '</style></head><body>'
    + `<h1>${esc(cat)} Statutory Updates</h1>`
    + `<div class="meta">${chosen.length} update(s) &nbsp;·&nbsp; prepared ${today}</div>`
    + '<table><thead><tr><th style="width:34px">#</th><th style="width:90px">Date</th><th>Update</th></tr></thead>'
    + `<tbody>${rows}</tbody></table>`
    + '<div class="ft">For information only. Refer to the original notification/circular on the GST portal for the authoritative text.'
    + (sources.length ? ` Sourced via ${esc(sources.join(', '))}.` : '')
    + '</div></body></html>';
}
