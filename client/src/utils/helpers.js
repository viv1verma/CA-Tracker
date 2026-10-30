import { AVATAR_COLORS } from './constants';

/**
 * Return up-to-2-letter uppercase initials from a name.
 */
export function ini(n) {
  return (n || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Return a [bgColor, textColor] pair for a given name, deterministically.
 */
export function avatarColor(name) {
  const n = name || '';
  const i = ((n.charCodeAt(0) + n.charCodeAt(n.length - 1)) || 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

/**
 * Check whether an assignment is overdue (past due date & not completed).
 */
export function isOverdue(a) {
  return a.dueDate && new Date(a.dueDate + 'T23:59:59') < new Date() && a.status !== 'Completed';
}

/**
 * Return number of days since the assignment was created.
 */
export function daysOld(a) {
  return Math.floor((new Date() - new Date(a.createdAt)) / 864e5);
}

/**
 * Normalize a percentage to the nearest 10, clamped between 0 and 100.
 */
export function pct(n) {
  return Math.min(100, Math.max(0, Math.round((n || 0) / 10) * 10));
}
