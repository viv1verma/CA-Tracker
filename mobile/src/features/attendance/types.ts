/** Shapes returned by the attendance endpoints, mirrored from server.js. */

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName?: string;
  date: string;
  punchIn?: string | null;
  punchOut?: string | null;
  workHours?: number;
  status?: string;
  isLate?: boolean;
  offSite?: boolean;
  siteName?: string;
  wfh?: boolean;
  wfhStatus?: 'Pending' | 'Approved' | 'Rejected';
  wfhReason?: string;
  wfhDecidedBy?: string;
  wfhDecisionNote?: string;
  holidayWork?: boolean;
  holidayName?: string;
  remark?: string;
}

export interface LeaveBalance {
  accrued: number;
  used: number;
  remaining: number;
  compOff?: { available: number };
}

/** One row of GET /api/attendance/wfh-pending. */
export interface WfhPending {
  id: string;
  userId: string;
  userName?: string;
  date: string;
  punchIn?: string | null;
  wfhReason?: string;
}

/** POST /api/attendance/punch-in and punch-out responses. */
export interface PunchResponse {
  message?: string;
  punchIn?: string;
  punchOut?: string;
  workHours?: number;
  isLate?: boolean;
  offSite?: boolean;
  status?: string;
  needsSiteVisit?: boolean;
}
