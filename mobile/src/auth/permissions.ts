import type { AuthUser, CapKey } from '../api/types';

/**
 * A direct mirror of the web app's gating helpers in public/index.html. These decide
 * what the UI *shows*; the server still decides what is allowed. Where the web app
 * falls back to a hardcoded name, that is reproduced here so behaviour matches
 * exactly rather than diverging quietly.
 */
const lower = (s?: string) => (s ?? '').trim().toLowerCase();

export const isAdmin = (u: AuthUser | null) => u?.role === 'admin';
export const isStaff = (u: AuthUser | null) => u?.role === 'admin' || u?.role === 'member';
export const isClientPortal = (u: AuthUser | null) =>
  u?.role === 'client' || u?.role === 'itrclient';

/** isPartnerFE() — admin, the firm-partner flag, or "partner" in the designation. */
export const isPartner = (u: AuthUser | null) =>
  !!u && (u.role === 'admin' || !!u.isFirmPartner || lower(u.designation).includes('partner'));

/** isHrAdmin() — includes the web app's hardcoded name check. */
export const isHrAdmin = (u: AuthUser | null) =>
  !!u && (u.role === 'admin' || !!u.hrAdmin || lower(u.name) === 'meenu jha');

/** ITR admin — hardcoded name check mirrored from the server. */
export const isItrAdmin = (u: AuthUser | null) =>
  !!u && (u.role === 'admin' || !!u.itrAdmin || lower(u.name) === 'annpurna');

export const hasPayrollAccess = (u: AuthUser | null) =>
  !!u && (u.role === 'admin' || !!u.payrollAccess || isHrAdmin(u));

export const canManageTeam = (u: AuthUser | null) =>
  !!u && (u.role === 'admin' || !!u.itrAdmin || isHrAdmin(u));

/** canSubAssign() — CA and CS qualifications only (admin always). */
export const canSubAssign = (u: AuthUser | null) => {
  if (!u) return false;
  if (u.role === 'admin') return true;
  const q = u.qualification || 'CA';
  return q === 'CA' || q === 'CS';
};

/** isOthers() — the restricted staff qualification. Missing qualification means CA. */
export const isOthers = (u: AuthUser | null) => {
  if (!u || u.role === 'admin') return false;
  return (u.qualification || 'CA') === 'Others';
};

/** isHOContextFE() — ITR is head-office work only. */
export const isHOContext = (branch: string | null | undefined) => {
  const b = lower(branch || 'all');
  return b === 'all' || b.includes('greater noida');
};

/** Delegated capability check. Admin implicitly holds every capability. */
export const can = (u: AuthUser | null, capability: CapKey) =>
  !!u && (u.role === 'admin' || u.caps?.[capability] === true);

/** Client-portal section visibility, from the per-client dashboards toggles. */
export const clientSees = (u: AuthUser | null, key: keyof NonNullable<AuthUser['dashboards']>) =>
  u?.dashboards?.[key] !== false;
