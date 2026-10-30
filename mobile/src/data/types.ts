/**
 * Shapes returned by the existing GARP API. Field names and semantics come from
 * server.js — nothing here is invented, and nothing is renamed.
 */

export type AssignmentStatus =
  | 'Pending' | 'In Progress' | 'Under Review' | 'Completed' | 'On Hold';

export type Priority = 'Normal' | 'High' | 'Urgent';

export interface ActivityLogEntry {
  date: string;
  updatedBy?: string;
  updatedByName?: string;
  status?: string;
  completionPct?: number;
  prevPct?: number;
  prevStatus?: string;
  remark?: string;
  isBackward?: boolean;
  isApproval?: boolean;
}

export interface TaskComment {
  id?: string;
  authorId?: string;
  authorName?: string;
  /** Legacy field kept by the API on older rows. */
  author?: string;
  role?: string;
  isReminder?: boolean;
  text: string;
  date: string;
}

/** Read-only parent summary the API attaches to a sub-assignment. */
export interface ParentSummary {
  id: string;
  workType?: string;
  notes?: string;
  dueDate?: string | null;
  priority?: string;
  status?: string;
  clientId?: string;
  assigneeName?: string;
  reportingPersonName?: string;
  remark?: string;
  completionPct?: number;
  assignmentType?: string;
  comments?: TaskComment[];
}

export interface Assignment {
  id: string;
  clientId: string;
  memberId: string;
  memberName?: string;
  reportingPersonId?: string | null;
  reportingPersonName?: string | null;
  workType: string;
  priority?: Priority;
  dueDate?: string | null;
  originalDueDate?: string | null;
  notes?: string;
  status?: AssignmentStatus;
  completionPct?: number;
  remark?: string;
  supervisorRemark?: string;
  rejectionRemark?: string;
  createdAt: string;
  completedAt?: string | null;
  completedOnTime?: boolean | null;
  awaitingApproval?: boolean;
  submittedForApprovalAt?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  assignmentType?: 'onetime' | 'recurring';
  frequency?: string;
  recurringTemplateId?: string;
  recurringMonthKey?: string;
  assigneeOverridden?: boolean;
  isSubAssignment?: boolean;
  parentAssignmentId?: string | null;
  parentAssigneeId?: string | null;
  subAssignedBy?: string | null;
  subAssignedByName?: string | null;
  parent?: ParentSummary;
  comments?: TaskComment[];
  activityLog?: ActivityLogEntry[];
}

export interface Client {
  id: string;
  name: string;
  type?: string;
  pan?: string;
  gst?: string;
  city?: string;
  contact?: string;
  address?: string;
  branch?: string;
  hasLogin?: boolean;
  clientUsername?: string;
  groupId?: string | null;
  dashboards?: { tasks?: boolean; billing?: boolean; cashflow?: boolean; debtors?: boolean };
}

/** A client-portal group login covering several companies. */
export interface ClientGroup {
  id: string;
  name: string;
  groupUsername?: string;
  companies?: { id: string; name: string }[];
}

/** One row of a client's invoice register. */
export interface Invoice {
  id: string;
  clientId: string;
  invoiceDate?: string | null;
  invoiceNo?: string;
  customerName?: string;
  netReceivable?: number;
  estimatedDate?: string | null;
  actualDate?: string | null;
}

export interface TeamUser {
  id: string;
  name: string;
  username?: string;
  role: 'admin' | 'member' | 'client' | 'itrclient';
  designation?: string;
  qualification?: string;
  branch?: string;
}

/** Pending-request rows the One-Time Tasks page counts in its banners. */
export interface DueDateRequest {
  id: string;
  assignmentId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy?: string;
  requestedByName?: string;
  memberId?: string;
  memberName?: string;
  clientName?: string;
  workType?: string;
  currentDueDate?: string;
  requestedDueDate?: string;
  reason?: string;
}

export interface ReopenRequest {
  id: string;
  assignmentId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy?: string;
  requestedByName?: string;
  memberId?: string;
  memberName?: string;
  clientName?: string;
  workType?: string;
  reason?: string;
  adminNote?: string;
}

/** A recurring template — the rule that generates a task each period. */
export interface RecurringTemplate {
  id: string;
  clientId: string;
  clientName?: string;
  memberId: string;
  memberName?: string;
  reportingPersonId?: string | null;
  reportingPersonName?: string | null;
  workType: string;
  priority?: string;
  dueDayOfMonth: number;
  frequency?: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Annually';
  notes?: string;
  active?: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  /** PUT returns this when open tasks were moved to a new assignee. */
  reassignedCount?: number;
}

/** One obligation in the statutory catalogue used by the Add sheet's second mode. */
export interface StatutoryItem {
  code: string;
  name: string;
  category: string;
  months: number[];
  dueDay: number;
  freq: string;
  note?: string;
}

/** A member's leave application, as the Approvals page reviews it. */
export interface LeaveRequest {
  id: string;
  memberId?: string;
  memberName?: string;
  type: string;
  days: number;
  fromDate?: string;
  toDate?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt?: string;
  resolvedAt?: string | null;
}

/** GET /api/notifications — one row of the bell panel. */
export interface Notification {
  id: string;
  toUserId: string;
  toName?: string;
  fromUserId?: string;
  fromName?: string;
  assignmentId?: string;
  clientName?: string;
  workType?: string;
  message: string;
  type?: string;
  read?: boolean;
  createdAt: string;
}
