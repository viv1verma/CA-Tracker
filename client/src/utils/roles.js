/**
 * Can add/delete clients & team members: admin OR itrAdmin.
 */
export function canManage(user) {
  return !!(user && (user.role === 'admin' || user.itrAdmin));
}

/**
 * HR admin: admin OR hrAdmin flag OR Meenu Jha.
 */
export function isHrAdmin(user) {
  return !!(
    user &&
    (user.role === 'admin' ||
      user.hrAdmin ||
      (user.name || '').trim().toLowerCase() === 'meenu jha')
  );
}

/**
 * Can manage team: admin, itrAdmin, or HR admin.
 */
export function canManageTeam(user) {
  return !!(user && (user.role === 'admin' || user.itrAdmin || isHrAdmin(user)));
}

/**
 * Business Development access: admin OR designation contains "partner".
 */
export function isPartner(user) {
  return !!(
    user &&
    (user.role === 'admin' || (user.designation || '').toLowerCase().includes('partner'))
  );
}

/**
 * Attendance/payroll eligibility: members only, exclude Partners, Greater Noida branch only.
 */
export function isAttendanceMember(user) {
  if (!user || user.role !== 'member') return false;
  if ((user.designation || '').toLowerCase().includes('partner')) return false;
  if (!(user.branch || '').toLowerCase().includes('greater noida')) return false;
  return true;
}
