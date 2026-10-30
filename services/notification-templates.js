// =============================================================================
// services/notification-templates.js — All 17 notification event templates
// =============================================================================
// Each event defines per-channel content (push, inapp, email, sms, whatsapp)
// with {{variable}} interpolation. Templates match the existing notification
// messages used throughout the GARP Tracker codebase.
//
// Usage:
//   const { NOTIFICATION_TEMPLATES, interpolate } = require('./notification-templates');
//   const tpl = NOTIFICATION_TEMPLATES['new-assignment'];
//   const title = interpolate(tpl.templates.push.title, { assignerName: 'Rahul', ... });
// =============================================================================

/**
 * Replace {{variable}} placeholders in a template string with values from `vars`.
 * Returns an empty string if the template is falsy.
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {object} vars - Key-value pairs for interpolation
 * @returns {string}
 */
function interpolate(template, vars) {
  if (!template) return '';
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : ''
  );
}

// =============================================================================
// NOTIFICATION TEMPLATES
// =============================================================================

const NOTIFICATION_TEMPLATES = {

  // ─────────────────────────────────────────────────────────────────────────
  // 1. new-assignment — A task or sub-task is assigned to a member
  // ─────────────────────────────────────────────────────────────────────────
  'new-assignment': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '{{assignmentLabel}} from {{assignerName}}',
        body: '{{clientName}} - {{workType}}{{dueDateSuffix}}'
      },
      inapp: {
        title: '{{assignmentLabel}} from {{assignerName}}',
        message: '{{clientName}} - {{workType}}{{dueDateSuffix}}'
      },
      email: {
        subject: '{{assignmentLabel}} — {{clientName}} — {{workType}}',
        textBody: 'Dear {{memberName}},\n\nYou have been assigned a new task by {{assignerName}}.\n\nClient: {{clientName}}\nWork: {{workType}}\nDue Date: {{dueDate}}\n\nPlease log in to GARP Tracker to view the details.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{assignmentLabel}} — {{clientName}} — {{workType}}. Due: {{dueDate}}. Login to tracker for details.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'new_assignment',
        params: ['{{memberName}}', '{{assignerName}}', '{{clientName}}', '{{workType}}', '{{dueDate}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. approval-needed — Member marks a task complete; approver notified
  // ─────────────────────────────────────────────────────────────────────────
  'approval-needed': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: 'Approval needed',
        body: '{{memberName}} marked "{{workType}}" ({{clientName}}) complete. Review & approve.'
      },
      inapp: {
        title: 'Approval needed',
        message: '{{memberName}} marked "{{workType}}" ({{clientName}}) complete. Review & approve.'
      },
      email: {
        subject: 'Approval needed — {{workType}} ({{clientName}})',
        textBody: 'Dear Approver,\n\n{{memberName}} has marked the task "{{workType}}" for {{clientName}} as complete and it requires your review.\n\nPlease log in to GARP Tracker to approve or send it back.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{memberName}} completed "{{workType}}" ({{clientName}}). Please review & approve.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'approval_needed',
        params: ['{{memberName}}', '{{workType}}', '{{clientName}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. completion-approved — Approver approves a task completion
  // ─────────────────────────────────────────────────────────────────────────
  'completion-approved': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: 'Completion approved',
        body: 'Your task "{{workType}}" ({{clientName}}) was approved by {{approverName}}.'
      },
      inapp: {
        title: 'Completion approved',
        message: 'Your task "{{workType}}" ({{clientName}}) was approved by {{approverName}}.'
      },
      email: {
        subject: 'Task approved — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\nYour task "{{workType}}" for {{clientName}} has been approved by {{approverName}}.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Your task "{{workType}}" ({{clientName}}) approved by {{approverName}}.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'completion_approved',
        params: ['{{memberName}}', '{{workType}}', '{{clientName}}', '{{approverName}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. completion-rejected — Approver sends a task back
  // ─────────────────────────────────────────────────────────────────────────
  'completion-rejected': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: 'Completion sent back',
        body: 'Your task "{{workType}}" ({{clientName}}) was sent back by {{approverName}}.{{rejectionNote}}'
      },
      inapp: {
        title: 'Completion sent back',
        message: 'Your task "{{workType}}" ({{clientName}}) was sent back by {{approverName}}.{{rejectionNote}}'
      },
      email: {
        subject: 'Task sent back — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\nYour task "{{workType}}" for {{clientName}} was sent back by {{approverName}}.{{rejectionNote}}\n\nPlease review the feedback and update accordingly.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Task "{{workType}}" ({{clientName}}) sent back by {{approverName}}.{{rejectionNote}}',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'completion_rejected',
        params: ['{{memberName}}', '{{workType}}', '{{clientName}}', '{{approverName}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. client-comment — A client comments on a task
  // ─────────────────────────────────────────────────────────────────────────
  'client-comment': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\uD83D\uDCAC {{workType}}',
        body: '{{clientName}} commented on a task'
      },
      inapp: {
        title: '\uD83D\uDCAC {{workType}}',
        message: '{{clientName}} commented on a task'
      },
      email: {
        subject: 'New client comment — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\n{{clientName}} has posted a comment on the task "{{workType}}".\n\nPlease log in to GARP Tracker to view and respond.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{clientName}} commented on "{{workType}}". Login to view.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'client_comment',
        params: ['{{memberName}}', '{{clientName}}', '{{workType}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. leave-applied — A member applies for leave; admins notified
  // ─────────────────────────────────────────────────────────────────────────
  'leave-applied': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\uD83C\uDF34 New leave request',
        body: '{{memberName}} applied for {{leaveType}} ({{days}} day(s)) from {{fromDate}}'
      },
      inapp: {
        title: 'New leave request',
        message: '{{memberName}} applied for {{leaveType}} ({{days}} day(s)), {{fromDate}} to {{toDate}}. Reason: {{reason}}'
      },
      email: {
        subject: 'Leave request — {{memberName}} — {{leaveType}}',
        textBody: 'Dear Admin,\n\n{{memberName}} has applied for {{leaveType}} leave.\n\nFrom: {{fromDate}}\nTo: {{toDate}}\nDays: {{days}}\nReason: {{reason}}\n\nPlease log in to GARP Tracker to approve or reject the request.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{memberName}} applied for {{leaveType}} ({{days}} day(s)), {{fromDate}}-{{toDate}}. Review in tracker.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'leave_applied',
        params: ['{{memberName}}', '{{leaveType}}', '{{days}}', '{{fromDate}}', '{{toDate}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. leave-decided — Admin approves or rejects a leave request
  // ─────────────────────────────────────────────────────────────────────────
  'leave-decided': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: 'Leave {{status}}',
        body: 'Your {{leaveType}} ({{fromDate}} to {{toDate}}) was {{status}}.'
      },
      inapp: {
        title: 'Leave {{status}}',
        message: 'Your {{leaveType}} from {{fromDate}} to {{toDate}} was {{status}}.{{adminNote}}'
      },
      email: {
        subject: 'Leave {{status}} — {{leaveType}} ({{fromDate}} to {{toDate}})',
        textBody: 'Dear {{memberName}},\n\nYour {{leaveType}} from {{fromDate}} to {{toDate}} ({{days}} day(s)) has been {{status}}.{{adminNote}}\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Your {{leaveType}} ({{fromDate}}-{{toDate}}) was {{status}}.{{adminNote}}',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'leave_decided',
        params: ['{{memberName}}', '{{leaveType}}', '{{fromDate}}', '{{toDate}}', '{{status}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. stale-remark — No progress update for 2+ days on an active task
  // ─────────────────────────────────────────────────────────────────────────
  'stale-remark': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\u23F0 Update needed',
        body: 'No update for {{days}} days on {{clientName}} \u2014 {{workType}}. Please update the remark/progress.'
      },
      inapp: {
        title: '\u23F0 Update needed',
        message: 'No update for {{days}} days on {{clientName}} \u2014 {{workType}}. Please update the remark/progress.'
      },
      email: {
        subject: 'Update needed — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\nThere has been no progress update for {{days}} days on the following task:\n\nClient: {{clientName}}\nWork: {{workType}}\n\nPlease log in to GARP Tracker and update the remark/progress.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: No update for {{days}} days on {{clientName}} - {{workType}}. Please update progress.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'stale_remark',
        params: ['{{memberName}}', '{{days}}', '{{clientName}}', '{{workType}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. attendance-individual — Employee hasn't punched in past the cutoff
  // ─────────────────────────────────────────────────────────────────────────
  'attendance-individual': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\u23F0 Mark your attendance',
        body: 'It\'s past {{cutoffTime}} and your attendance for today isn\'t marked. Please punch in.'
      },
      inapp: {
        title: 'Attendance not marked',
        message: 'It\'s past {{cutoffTime}} and you haven\'t marked attendance today. Please punch in or apply leave.'
      },
      email: {
        subject: 'Attendance not marked — {{date}}',
        textBody: 'Dear {{memberName}},\n\nYour attendance for today ({{date}}) has not been marked as of {{cutoffTime}}.\n\nPlease log in to GARP Tracker to punch in or apply leave.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Attendance not marked for today. Please punch in or apply leave. -GARP',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'attendance_reminder',
        params: ['{{memberName}}', '{{cutoffTime}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. attendance-admin — Admin rollup of unmarked attendance
  // ─────────────────────────────────────────────────────────────────────────
  'attendance-admin': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\u23F0 {{count}} unmarked attendance',
        body: 'Not marked by {{cutoffTime}}: {{names}}'
      },
      inapp: {
        title: '{{count}} employee(s) haven\'t marked attendance',
        message: 'Not marked by {{cutoffTime}}: {{names}}'
      },
      email: {
        subject: '{{count}} unmarked attendance — {{date}}',
        textBody: 'Dear Admin,\n\n{{count}} employee(s) have not marked attendance as of {{cutoffTime}} on {{date}}.\n\nNot marked: {{names}}\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{count}} attendance unmarked by {{cutoffTime}}. Check tracker for details.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'attendance_admin',
        params: ['{{count}}', '{{cutoffTime}}', '{{names}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. birthday — Broadcast push for a team member's birthday
  // ─────────────────────────────────────────────────────────────────────────
  'birthday': {
    channels: ['push'],
    templates: {
      push: {
        title: '\uD83C\uDF82 Happy Birthday {{name}}!',
        body: 'Today is {{name}}\'s birthday! Wishing them a wonderful day! \uD83C\uDF89'
      },
      inapp: {
        title: '\uD83C\uDF82 Happy Birthday {{name}}!',
        message: 'Today is {{name}}\'s birthday! Wishing them a wonderful day! \uD83C\uDF89'
      },
      email: {
        subject: 'Happy Birthday {{name}}! \uD83C\uDF82',
        textBody: 'Dear Team,\n\nToday is {{name}}\'s birthday! Please join us in wishing them a wonderful day.\n\nBest wishes,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Happy Birthday {{name}}! Wishing you a wonderful day!',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'birthday_wish',
        params: ['{{name}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. anniversary — Broadcast push for a team member's marriage anniversary
  // ─────────────────────────────────────────────────────────────────────────
  'anniversary': {
    channels: ['push'],
    templates: {
      push: {
        title: '\uD83D\uDC8D Happy Anniversary {{name}}!',
        body: 'Today is {{name}}\'s marriage anniversary! Congratulations! \uD83C\uDF8A'
      },
      inapp: {
        title: '\uD83D\uDC8D Happy Anniversary {{name}}!',
        message: 'Today is {{name}}\'s marriage anniversary! Congratulations! \uD83C\uDF8A'
      },
      email: {
        subject: 'Happy Anniversary {{name}}! \uD83D\uDC8D',
        textBody: 'Dear Team,\n\nToday is {{name}}\'s marriage anniversary! Please join us in wishing them congratulations.\n\nBest wishes,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Happy Anniversary {{name}}! Congratulations!',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'anniversary_wish',
        params: ['{{name}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. recurring-reassigned — Open recurring tasks reassigned to a new member
  // ─────────────────────────────────────────────────────────────────────────
  'recurring-reassigned': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\uD83D\uDD04 Task reassigned',
        body: '{{count}} open {{workType}} task(s) moved to you'
      },
      inapp: {
        title: 'Recurring task reassigned to you',
        message: '{{count}} open {{workType}} task(s) for {{clientName}} were reassigned to you by {{managerName}}.'
      },
      email: {
        subject: 'Tasks reassigned to you — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\n{{count}} open {{workType}} task(s) for {{clientName}} have been reassigned to you by {{managerName}}.\n\nPlease log in to GARP Tracker to view the tasks.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{count}} {{workType}} task(s) reassigned to you by {{managerName}}. Check tracker.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'task_reassigned',
        params: ['{{memberName}}', '{{count}}', '{{workType}}', '{{clientName}}', '{{managerName}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 14. new-eligible-tender — New tenders the firm may be eligible for
  // ─────────────────────────────────────────────────────────────────────────
  'new-eligible-tender': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\uD83C\uDFDB {{count}} new eligible tender(s)',
        body: '{{firstPsu}} \u2014 due {{firstDueDate}}'
      },
      inapp: {
        title: '\uD83C\uDFDB New tender(s) you may be eligible for',
        message: '{{tenderSummary}}'
      },
      email: {
        subject: '{{count}} new eligible tender(s) found',
        textBody: 'Dear Partner,\n\nThe following new tender(s) have been identified as potentially eligible for GARP & Associates:\n\n{{tenderSummary}}\n\nPlease log in to GARP Tracker to review and take action.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: {{count}} new eligible tender(s). {{firstPsu}} due {{firstDueDate}}. Check tracker.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'new_tender',
        params: ['{{count}}', '{{firstPsu}}', '{{firstDueDate}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 15. itr-stage-change — ITR stage updated; notify client via email/sms/wa
  //     NO push or inapp — these go to external clients (taxpayers)
  // ─────────────────────────────────────────────────────────────────────────
  'itr-stage-change': {
    channels: ['email', 'sms', 'whatsapp'],
    templates: {
      push: {
        title: null,
        body: null
      },
      inapp: {
        title: null,
        message: null
      },
      email: {
        subject: 'ITR {{ay}} \u2014 status updated: {{stage}}',
        textBody: 'Dear {{name}},\n\nThe status of your Income-tax return{{aySuffix}} has been updated to: {{stage}}.\n\nYou can view details and message us anytime by logging in to your GARP ITR portal.\n\nRegards,\nGARP & Associates\nwww.garp.co.in',
        htmlBody: null
      },
      sms: {
        body: 'GARP: ITR {{ay}} status updated to {{stage}}. Login to portal for details. -GARP',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'itr_status_update',
        params: ['{{name}}', '{{ay}}', '{{stage}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 16. salary-slip — Email salary slip to an employee (email only)
  //     Uses custom HTML override — the htmlBody is generated at send time
  // ─────────────────────────────────────────────────────────────────────────
  'salary-slip': {
    channels: ['email'],
    templates: {
      push: {
        title: null,
        body: null
      },
      inapp: {
        title: null,
        message: null
      },
      email: {
        subject: 'Salary Slip \u2014 {{month}} {{year}} \u2014 GARP & Associates',
        textBody: 'Dear {{memberName}},\n\nPlease find your salary slip for {{month}} {{year}} attached / below.\n\nFor any discrepancy, please contact the payroll team.\n\nRegards,\nGARP & Associates',
        htmlBody: null  // Custom HTML generated at send time by salary.routes.js
      },
      sms: {
        body: 'GARP: Your salary slip for {{month}} {{year}} has been emailed. Check your inbox.',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'salary_slip',
        params: ['{{memberName}}', '{{month}}', '{{year}}']
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 17. manual-reminder — Manager or admin sends a manual reminder on a task
  // ─────────────────────────────────────────────────────────────────────────
  'manual-reminder': {
    channels: ['push', 'inapp'],
    templates: {
      push: {
        title: '\uD83D\uDD14 Reminder from {{senderName}}',
        body: '\uD83D\uDCC1 {{clientName}} \u2014 {{workType}}\n\uD83D\uDCAC {{message}}'
      },
      inapp: {
        title: 'Reminder from {{senderName}}',
        message: '{{clientName}} \u2014 {{workType}}: {{message}}'
      },
      email: {
        subject: 'Reminder — {{workType}} ({{clientName}})',
        textBody: 'Dear {{memberName}},\n\n{{senderName}} has sent you a reminder regarding:\n\nClient: {{clientName}}\nWork: {{workType}}\n\nMessage: {{message}}\n\nPlease log in to GARP Tracker to update the task.\n\nRegards,\nGARP & Associates',
        htmlBody: null
      },
      sms: {
        body: 'GARP: Reminder from {{senderName}} — {{clientName}} — {{workType}}. {{message}}',
        dltTemplateId: ''
      },
      whatsapp: {
        templateName: 'manual_reminder',
        params: ['{{memberName}}', '{{senderName}}', '{{clientName}}', '{{workType}}', '{{message}}']
      }
    }
  }
};

// =============================================================================
// Exports
// =============================================================================

module.exports = { NOTIFICATION_TEMPLATES, interpolate };
