import React from 'react';
import AssignmentsNavigator from '../features/assignments/AssignmentsNavigator';
import ApprovalsNavigator from '../features/approvals/ApprovalsNavigator';
import BizDevNavigator from '../features/bizdev/BizDevNavigator';
import ClientBillingNavigator from '../features/clientbilling/ClientBillingNavigator';
import ClientComplianceNavigator from '../features/clientcompliance/ClientComplianceNavigator';
import ClientPortalNavigator from '../features/clientportal/ClientPortalNavigator';
import ClientsNavigator from '../features/clients/ClientsNavigator';
import ComplianceNavigator from '../features/compliance/ComplianceNavigator';
import ItrClientNavigator from '../features/itrclient/ItrClientNavigator';
import ItrNavigator from '../features/itr/ItrNavigator';
import MailNavigator from '../features/mail/MailNavigator';
import FirmProfileNavigator from '../features/firmprofile/FirmProfileNavigator';
import NotificationsNavigator from '../features/notifications/NotificationsNavigator';
import SettingsNavigator from '../features/settings/SettingsNavigator';
import ReportsNavigator from '../features/reports/ReportsNavigator';
import SalaryNavigator from '../features/salary/SalaryNavigator';
import StatutoryNavigator from '../features/statutory/StatutoryNavigator';
import TeamNavigator from '../features/team/TeamNavigator';
import AttendanceNavigator from '../features/attendance/AttendanceNavigator';
import DailyAttendanceNavigator from '../features/dailyattendance/DailyAttendanceNavigator';
import LeaveNavigator from '../features/leave/LeaveNavigator';
import MyProfileNavigator from '../features/myprofile/MyProfileNavigator';
import MyTasksNavigator from '../features/mytasks/MyTasksNavigator';
import MyTeamNavigator from '../features/myteam/MyTeamNavigator';
import RecurringNavigator from '../features/recurring/RecurringNavigator';
import SupervisingNavigator from '../features/supervising/SupervisingNavigator';
import OneTimeNavigator from '../features/onetime/OneTimeNavigator';
import ModuleScreen from '../screens/ModuleScreen';
import type { ModuleId } from './modules';

/**
 * Resolves a module id to its implementation. Modules still in the Phase A shell
 * fall through to ModuleScreen; implemented ones bring their own stack, so the
 * host screen hides its header and lets the module's stack draw its own.
 */
const IMPLEMENTED: Partial<Record<ModuleId, React.ComponentType>> = {
  assignments: AssignmentsNavigator,
  dashboard: OneTimeNavigator,
  myassign: MyTasksNavigator,
  submanage: MyTeamNavigator,
  supervising: SupervisingNavigator,
  recdash: RecurringNavigator,
  recurring: RecurringNavigator,
  approvals: ApprovalsNavigator,
  attendance: AttendanceNavigator,
  punchstatus: DailyAttendanceNavigator,
  myleave: LeaveNavigator,
  clients: ClientsNavigator,
  compcal: ComplianceNavigator,
  statutory: StatutoryNavigator,
  itrdash: ItrNavigator,
  bizdev: BizDevNavigator,
  mail: MailNavigator,
  team: TeamNavigator,
  salary: SalaryNavigator,
  reports: ReportsNavigator,
  firmprofile: FirmProfileNavigator,
  notifications: NotificationsNavigator,
  password: SettingsNavigator,
  clientportal: ClientPortalNavigator,
  clientbilling: ClientBillingNavigator,
  clientcompliance: ClientComplianceNavigator,
  itrclient: ItrClientNavigator,
  myprofile: MyProfileNavigator,
};

export const hasOwnNavigator = (id: ModuleId) => !!IMPLEMENTED[id];

export default function ModuleHost({
  moduleId, openAssignmentId,
}: {
  moduleId: ModuleId;
  /** A notification routes to a task list and opens one assignment on arrival. */
  openAssignmentId?: string;
}) {
  const Impl = IMPLEMENTED[moduleId];
  if (!Impl) return <ModuleScreen moduleId={moduleId} />;
  if (openAssignmentId && (moduleId === 'assignments' || moduleId === 'myassign')) {
    const WithOpen = Impl as React.ComponentType<{ openAssignmentId?: string }>;
    return <WithOpen openAssignmentId={openAssignmentId} />;
  }
  return <Impl />;
}
