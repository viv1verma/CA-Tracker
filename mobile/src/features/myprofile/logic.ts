/**
 * My Profile — the member self-service path, PARITY row 23.
 *
 * The web has no `pg-myprofile` page: the drawer entry runs
 * `navTo('myprofile')` → `showEmpProfile(me.id)`, opening the same employee
 * panel the Team page uses, but for the signed-in member and with the
 * self-service permission rules applied.
 *
 * This module owns the entry point, the identity resolution (always `me.id`,
 * never a picker) and the self-service edit form. The panel itself is the shared
 * renderer, exactly as on the web — but the edit form is NOT the Team module's
 * admin create/edit form: openEditProfile() gates the fields quite differently.
 */

/**
 * openEditProfile(): fields a member may change on their own profile.
 * Everything else in the form is either disabled or inside `ef_adminOnly`.
 */
export const SELF_EDITABLE_FIELDS = [
  'name', 'email', 'mobile', 'dob', 'bloodGroup', 'anniversary',
  'address', 'pan', 'aadhar', 'emergencyName', 'emergencyPhone', 'emergencyRelation',
] as const;

/**
 * Shown but disabled for a member (`el.disabled = !isAdmin`), so the value stays
 * visible without being editable. Admins and HR admins may change these.
 */
export const ADMIN_ONLY_DISABLED = ['designation', 'qualification', 'branch', 'joiningDate'] as const;

/**
 * Inside `#ef_adminOnly`, hidden outright from a member. Note that the password
 * field lives here too — a member changes their password in Settings → Account
 * (PARITY row 21), not from this profile form.
 */
export const ADMIN_ONLY_HIDDEN = [
  'username', 'password', 'basicSalary', 'hra', 'conveyance', 'otherAllowance', 'openingLeave',
] as const;

export type SelfField = (typeof SELF_EDITABLE_FIELDS)[number];

export const SELF_FIELD_LABEL: Record<SelfField, string> = {
  name: 'Name',
  email: 'Email',
  mobile: 'Mobile',
  dob: 'Date of Birth',
  bloodGroup: 'Blood Group',
  anniversary: 'Anniversary',
  address: 'Address',
  pan: 'PAN',
  aadhar: 'Aadhaar',
  emergencyName: 'Emergency Contact Name',
  emergencyPhone: 'Emergency Contact Phone',
  emergencyRelation: 'Emergency Contact Relation',
};

/** The three date fields use a picker rather than free text. */
export const SELF_DATE_FIELDS: SelfField[] = ['dob', 'anniversary'];

/**
 * saveEditProfile() sends every field it can read and lets the server decide.
 * The server (PUT /api/users/:id) allows a non-manager to edit only themselves,
 * and silently ignores designation / qualification / branch / joiningDate /
 * salary / openingLeave unless the caller manages people — so a member's own
 * save can never widen what they may change.
 */
export function buildSelfUpdate(values: Record<string, string>) {
  const body: Record<string, string> = {};
  SELF_EDITABLE_FIELDS.forEach((f) => { body[f] = values[f] ?? ''; });
  return body;
}
