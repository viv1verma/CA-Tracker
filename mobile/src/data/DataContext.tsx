import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import type {
  Assignment, Client, DueDateRequest, LeaveRequest, Notification, RecurringTemplate,
  ReopenRequest, TeamUser,
} from './types';

/**
 * The same three collections loadData() pulls in the web app: clients, assignments
 * and users. They are shared because every task row needs its client's name and its
 * member's designation. Refetched whenever the branch context changes, exactly as
 * setActiveBranch() re-runs loadData() on the web.
 */
interface DataState {
  clients: Client[];
  users: TeamUser[];
  assignments: Assignment[];
  /** Pending-request counts drive the One-Time Tasks banners. */
  dueDateRequests: DueDateRequest[];
  reopenRequests: ReopenRequest[];
  recurringTemplates: RecurringTemplate[];
  leaveRequests: LeaveRequest[];
  /** The bell panel's list, and the unread count behind its badge. */
  notifications: Notification[];
  unreadNotifications: number;
  clientsById: Record<string, Client>;
  usersById: Record<string, TeamUser>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Full reload; `background: true` keeps the server's idle timer untouched. */
  reload: (opts?: { background?: boolean; showSpinner?: boolean }) => Promise<void>;
  /** Merge a server response for one assignment back into the cache. */
  upsertAssignment: (a: Assignment) => void;
  addAssignment: (a: Assignment) => void;
  removeAssignments: (ids: string[]) => void;
  addDueDateRequest: (r: DueDateRequest) => void;
  setRequestStatus: (
    kind: 'dueDate' | 'reopen' | 'leave', id: string, status: 'approved' | 'rejected',
  ) => void;
  upsertTemplate: (t: RecurringTemplate) => void;
  removeTemplates: (ids: string[]) => void;
  addReopenRequest: (r: ReopenRequest) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  getAssignment: (id: string) => Assignment | undefined;
}

const DataContext = createContext<DataState | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, branch } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dueDateRequests, setDueDateRequests] = useState<DueDateRequest[]>([]);
  const [reopenRequests, setReopenRequests] = useState<ReopenRequest[]>([]);
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTemplate[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const reload = useCallback(async (opts?: { background?: boolean; showSpinner?: boolean }) => {
    // The client and ITR portals have their own endpoints; loadData() skips them too.
    // An account still owing its first password change is gated server-side, so every
    // one of these would come back 403 — skip until the flag clears.
    if (!user || user.mustChangePassword || user.role === 'client' || user.role === 'itrclient') return;
    const showSpinner = opts?.showSpinner ?? !loadedOnce.current;
    if (showSpinner) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      // The web's loadData() pulls the same set in one go.
      const [c, a, u, dd, ro, rt, lv, nf] = await Promise.all([
        api.get<Client[]>(endpoints.clients, { background: opts?.background }),
        api.get<Assignment[]>(endpoints.assignments, { background: opts?.background }),
        api.get<TeamUser[]>(endpoints.users, { background: opts?.background }),
        api.get<DueDateRequest[]>(endpoints.dueDateRequests, { background: opts?.background }).catch(() => []),
        api.get<ReopenRequest[]>(endpoints.reopenRequests, { background: opts?.background }).catch(() => []),
        api.get<RecurringTemplate[]>(endpoints.recurringTemplates, { background: opts?.background }).catch(() => []),
        api.get<LeaveRequest[]>(endpoints.leaveRequests, { background: opts?.background }).catch(() => []),
        api.get<Notification[]>(endpoints.notifications, { background: opts?.background }).catch(() => []),
      ]);
      setClients(c || []);
      setAssignments(a || []);
      setUsers(u || []);
      setDueDateRequests(dd || []);
      setReopenRequests(ro || []);
      setRecurringTemplates(rt || []);
      setLeaveRequests(lv || []);
      setNotifications(nf || []);
      loadedOnce.current = true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Load on sign-in, and reload whenever the branch switcher changes context.
  useEffect(() => {
    loadedOnce.current = false;
    if (user && !user.mustChangePassword) void reload({ showSpinner: true });
    else if (user) { /* gated: the effect re-runs when mustChangePassword clears */ }
    else {
      setClients([]); setUsers([]); setAssignments([]);
      setDueDateRequests([]); setReopenRequests([]); setRecurringTemplates([]); setLeaveRequests([]);
      setNotifications([]);
    }
  }, [user?.id, user?.mustChangePassword, branch]);   // eslint-disable-line react-hooks/exhaustive-deps

  // updateBellBadge(): the unread count the web puts on the bell.
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  const clientsById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])) as Record<string, Client>,
    [clients],
  );
  const usersById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, TeamUser>,
    [users],
  );

  const upsertAssignment = useCallback((a: Assignment) => {
    setAssignments((prev) => {
      const i = prev.findIndex((x) => x.id === a.id);
      if (i === -1) return [...prev, a];
      const next = prev.slice();
      next[i] = { ...next[i], ...a };
      return next;
    });
  }, []);

  const addAssignment = useCallback((a: Assignment) => {
    setAssignments((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
  }, []);

  const removeAssignments = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    // The server also deletes sub-assignments of a deleted task; mirror that locally.
    setAssignments((prev) =>
      prev.filter((a) => !gone.has(a.id) && !(a.parentAssignmentId && gone.has(a.parentAssignmentId))));
  }, []);

  const addDueDateRequest = useCallback((r: DueDateRequest) => {
    setDueDateRequests((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
  }, []);

  /** Approvals flips a request's status in place after the server confirms. */
  const setRequestStatus = useCallback(
    (kind: 'dueDate' | 'reopen' | 'leave', id: string, status: 'approved' | 'rejected') => {
      const patch = <T extends { id: string; status: string }>(list: T[]) =>
        list.map((r) => (r.id === id ? { ...r, status } : r));
      if (kind === 'dueDate') setDueDateRequests((p) => patch(p) as DueDateRequest[]);
      else if (kind === 'reopen') setReopenRequests((p) => patch(p) as ReopenRequest[]);
      else setLeaveRequests((p) => patch(p) as LeaveRequest[]);
    }, []);

  const upsertTemplate = useCallback((t: RecurringTemplate) => {
    setRecurringTemplates((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      const next = prev.slice();
      next[i] = { ...next[i], ...t };
      return next;
    });
  }, []);

  const removeTemplates = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setRecurringTemplates((prev) => prev.filter((t) => !gone.has(t.id)));
  }, []);

  const addReopenRequest = useCallback((r: ReopenRequest) => {
    setReopenRequests((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
  }, []);

  const getAssignment = useCallback(
    (id: string) => assignments.find((a) => a.id === id),
    [assignments],
  );

  const value = useMemo<DataState>(() => ({
    clients, users, assignments, dueDateRequests, reopenRequests, recurringTemplates, leaveRequests,
    notifications, unreadNotifications, markNotificationRead, clearNotifications,
    clientsById, usersById,
    loading, refreshing, error, reload,
    upsertAssignment, addAssignment, removeAssignments,
    addDueDateRequest, addReopenRequest, setRequestStatus,
    upsertTemplate, removeTemplates, getAssignment,
  }), [clients, users, assignments, dueDateRequests, reopenRequests, recurringTemplates, leaveRequests,
       notifications, unreadNotifications, markNotificationRead, clearNotifications,
       clientsById, usersById, loading, refreshing, error,
       reload, upsertAssignment, addAssignment, removeAssignments,
       addDueDateRequest, addReopenRequest, setRequestStatus,
       upsertTemplate, removeTemplates, getAssignment]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
