/** Shapes returned by the existing GARP REST API. Kept deliberately narrow. */
export type Role = 'admin' | 'member' | 'client' | 'itrclient';

/** The 16 delegation capabilities the server computes in GET /api/me. */
export type CapKey =
  | 'team.manage' | 'salary.view' | 'payroll.run' | 'attendance.manage'
  | 'leave.approve' | 'clients.manage' | 'clients.own' | 'tasks.manageAll'
  | 'recurring.manage' | 'itr.manage' | 'bd.manage' | 'firmprofile.manage'
  | 'reports.view' | 'rules.manage' | 'backup.manage' | 'delegation.manage';

export interface ClientDashboards {
  tasks?: boolean; billing?: boolean; cashflow?: boolean; debtors?: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  // staff
  designation?: string;
  qualification?: string;          // 'CA' | 'CS' | 'Others' — drives sub-assign + access
  branch?: string;
  itrAdmin?: boolean;
  payrollAccess?: boolean;
  hrAdmin?: boolean;
  isFirmPartner?: boolean;
  /** Set while an admin-created account still has to replace its initial password. */
  mustChangePassword?: boolean;
  caps?: Partial<Record<CapKey, boolean>>;
  // client portal
  clientId?: string;
  isGroup?: boolean;
  groupId?: string;
  companies?: Array<{ id: string; name: string }>;
  dashboards?: ClientDashboards;
  email?: string;
  contact?: string;
  // itr party
  itrId?: string;
  pan?: string;
  ay?: string;
}

export interface LoginResponse { token: string; user: AuthUser; }

/** Why a request failed, so the UI can react rather than just show a string. */
export type ApiErrorKind =
  | 'network' | 'auth' | 'idle' | 'superseded' | 'forbidden' | 'server' | 'unknown';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  constructor(message: string, kind: ApiErrorKind, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}
