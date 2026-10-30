// ═══════════════════════════════════════════════════════════
// services/audit.service.js — Audit trail operations
// ═══════════════════════════════════════════════════════════
const { AUDIT_MAX } = require('../config');
const { newId, reqIp, diffFields } = require('../utils/helpers');

/**
 * Records an audit entry on `db`. Caller is responsible for writeDB().
 */
function logAudit(db, req, action, entity, entityId, label, details) {
  if (!db.auditLog) db.auditLog = [];
  db.auditLog.push({
    id: newId(),
    at: new Date().toISOString(),
    actorId: (req && req.user && req.user.id) || 'system',
    actorName: (req && req.user && req.user.name) || 'System',
    actorRole: (req && req.user && req.user.role) || 'system',
    action: action,               // created | updated | deleted | approved | rejected | restored ...
    entity: entity,               // user | client | attendance | leave | comp-off | holiday | settings | data
    entityId: entityId || '',
    label: label || '',           // human-readable subject, e.g. the person's name
    details: details || '',       // what changed
    ip: reqIp(req)
  });
  if (db.auditLog.length > AUDIT_MAX) db.auditLog = db.auditLog.slice(-AUDIT_MAX);
}

/**
 * Records a due-date change for the audit report.
 */
function logDueDateChange(db, assignment, oldDate, newDate, user, via) {
  if (!db.dueDateChangeLog) db.dueDateChangeLog = [];
  if (oldDate === newDate) return;
  const cl = db.clients.find(c => c.id === assignment.clientId);
  db.dueDateChangeLog.push({
    id: newId(),
    assignmentId: assignment.id,
    clientName: cl ? cl.name : '\u2014',
    workType: assignment.workType || '\u2014',
    memberName: assignment.memberName || '\u2014',
    oldDueDate: oldDate || null,
    newDueDate: newDate || null,
    changedById: user.id,
    changedByName: user.name,
    changedByQual: user.qualification || '',
    via: via || 'edit',
    date: new Date().toISOString()
  });
}

module.exports = {
  logAudit,
  logDueDateChange,
  diffFields
};
