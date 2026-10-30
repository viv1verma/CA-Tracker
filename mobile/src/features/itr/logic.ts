/**
 * pg-itrdash ("ITR Filing Tracker"). Income-tax return filings, tracked apart
 * from clients and tasks. Ported from renderItrDash() and openItrParty().
 */

export interface ItrComment {
  id?: string;
  authorId?: string;
  authorName?: string;
  role?: string;
  text: string;
  date: string;
}

export interface ItrParty {
  id: string;
  pan: string;
  name?: string;
  ay?: string;
  type?: string;
  email?: string;
  mobile?: string;
  stage?: string;
  assignedTo?: string;
  assignedName?: string;
  reportingTo?: string;
  reportingName?: string;
  notify?: boolean;
  filingDecision?: 'confirmed' | 'parked' | null;
  comments?: ItrComment[];
}

/** The five filing stages, in order — ITR_STAGES on the server. */
export const ITR_STAGES = [
  'Not Started', 'Docs Received', 'In Preparation', 'Filed', 'Verified',
];

/** Stage pill colours, from ITR_STAGE_COLOR. */
export const ITR_STAGE_COLOR: Record<string, [string, string]> = {
  'Not Started': ['#f3f4f6', '#6b7280'],
  'Docs Received': ['#dbeafe', '#1d4ed8'],
  'In Preparation': ['#fef3c7', '#92400e'],
  'Filed': ['#dcfce7', '#15803d'],
  'Verified': ['#ede9fe', '#5b21b6'],
};

export const stageColor = (s?: string) =>
  ITR_STAGE_COLOR[s || ''] || ['#f3f4f6', '#6b7280'];

/** The six stat tiles above the list. */
export function itrStats(parties: ItrParty[]) {
  const cnt = (s: string) => parties.filter((p) => p.stage === s).length;
  return [
    { label: 'Total', value: parties.length, color: '#2563eb' },
    { label: 'Not Started', value: cnt('Not Started'), color: '#6b7280' },
    { label: 'Docs Received', value: cnt('Docs Received'), color: '#1d4ed8' },
    { label: 'In Prep', value: cnt('In Preparation'), color: '#d97706' },
    { label: 'Filed', value: cnt('Filed'), color: '#16a34a' },
    { label: 'Verified', value: cnt('Verified'), color: '#7c3aed' },
  ];
}

/** Assessment years present in the data, newest first. */
export const ayOptions = (parties: ItrParty[]) =>
  [...new Set(parties.map((p) => p.ay).filter(Boolean))].sort().reverse() as string[];

/** The AY and stage filters, both defaulting to 'all'. */
export function filterParties(parties: ItrParty[], ay: string, stage: string): ItrParty[] {
  let out = parties.slice();
  if (ay !== 'all') out = out.filter((p) => p.ay === ay);
  if (stage !== 'all') out = out.filter((p) => p.stage === stage);
  return out;
}

/**
 * The list's TEAM COMMENT cell: the latest comment from the team, with the
 * client's own comments excluded, truncated at 60 characters plus a "+N" count.
 */
export function latestTeamComment(p: ItrParty): { text: string; more: number } | null {
  const cs = (p.comments || []).filter((c) => c.role !== 'itrclient');
  if (!cs.length) return null;
  const c = cs[cs.length - 1];
  const text = c.text.length > 60 ? `${c.text.slice(0, 60)}…` : c.text;
  return { text, more: cs.length - 1 };
}

/** The filing-decision badge; the web keeps it even though the flow was removed. */
export function decisionBadge(p: ItrParty): { label: string; bg: string; fg: string } {
  if (p.filingDecision === 'confirmed') return { label: '✓ Will file', bg: '#dcfce7', fg: '#15803d' };
  if (p.filingDecision === 'parked') return { label: '🅿️ Parked', bg: '#fef3c7', fg: '#92400e' };
  return { label: '— Undecided', bg: '#f1f5f9', fg: '#94a3b8' };
}

/** Comment bubbles: the client's sit on one side, the team's on the other. */
export const isClientComment = (c: ItrComment) => c.role === 'itrclient';
