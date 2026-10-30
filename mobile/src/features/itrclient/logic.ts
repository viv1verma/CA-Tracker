/**
 * pg-itrclient — "🧾 My ITR Filing", the portal an ITR party sees for its own
 * return. Ported from renderItrClient(), renderItrComments() and itrAddComment().
 *
 * Separate from PARITY row 13 (`pg-itrdash`), which is the staff tracker over
 * /api/itr/parties with assignment, stage changes, decisions, notifications,
 * bulk import and exports. This portal reads one endpoint, shows a read-only
 * stage tracker, and lets the party post a comment — nothing else.
 */

/** ITR_STAGES, identical on the client and the server (server.js:1810). */
export const ITR_STAGES = ['Not Started', 'Docs Received', 'In Preparation', 'Filed', 'Verified'];

export interface ItrComment {
  id?: string;
  authorId?: string;
  authorName?: string;
  role?: string;
  text: string;
  date: string;
}

/** GET /api/itr/me — the caller's own ITR party record. */
export interface ItrParty {
  id: string;
  pan: string;
  name?: string;
  ay?: string;
  type?: string;
  stage?: string;
  filedAt?: string;
  comments?: ItrComment[];
}

/** The stepper: every stage up to and including the current one is complete. */
export const stageIndex = (stage?: string) => ITR_STAGES.indexOf(stage || '');

/** The sub-header line: `PAN … · AY … · type`. */
export const partySubtitle = (p: ItrParty) =>
  `PAN ${p.pan} · AY ${p.ay || '—'} · ${p.type || '—'}`;

/**
 * renderItrComments(): the party's own messages sit on the LEFT in amber, the
 * firm's on the right in grey — the opposite side from the client task thread,
 * and reproduced as the web has it.
 */
export const isOwnComment = (m: ItrComment) => m.role === 'itrclient';

export const commentTag = (m: ItrComment) =>
  m.role === 'itrclient' ? 'Client' : m.role === 'admin' ? 'Admin' : 'Team';
