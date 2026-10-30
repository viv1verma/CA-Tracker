import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user, isAdmin, isClient, isItrClient } = useAuth();
  const [clients, setClients] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [ddRequests, setDdRequests] = useState([]);
  const [reopenRequests, setReopenRequests] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [itrParties, setItrParties] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (background = false) => {
    try {
      const opts = { background };
      const promises = [];

      // Core data for all staff
      if (!isClient && !isItrClient) {
        promises.push(
          api('GET', '/clients', null, opts).then(d => d && setClients(d)),
          api('GET', '/assignments', null, opts).then(d => d && setAssignments(d)),
          api('GET', '/notifications', null, opts).then(d => d && setNotifications(d)),
          api('GET', '/due-date-requests', null, opts).then(d => d && setDdRequests(d)),
          api('GET', '/reopen-requests', null, opts).then(d => d && setReopenRequests(d)),
          api('GET', '/recurring-templates', null, opts).then(d => d && setRecurringTemplates(d)),
          api('GET', '/leave-requests', null, opts).then(d => d && setLeaveRequests(d)),
        );
        if (isAdmin) {
          promises.push(api('GET', '/users', null, opts).then(d => d && setUsers(d)));
        }
        // ITR parties if applicable
        promises.push(
          api('GET', '/itr/parties', null, opts).then(d => d && setItrParties(d)).catch(() => {})
        );
      }

      await Promise.allSettled(promises);
    } catch (e) {
      console.error('Data load error:', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isClient, isItrClient]);

  // Initial load
  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  // Auto-refresh every 30 seconds
  useAutoRefresh(() => loadData(true), 30000);

  const refresh = useCallback(() => loadData(true), [loadData]);
  const unreadNotifs = notifications.filter(n => !n.read).length;

  return (
    <DataContext.Provider value={{
      clients, assignments, users, notifications, ddRequests,
      reopenRequests, recurringTemplates, leaveRequests, itrParties,
      loading, refresh, unreadNotifs,
      setClients, setAssignments, setUsers, setNotifications,
      setDdRequests, setReopenRequests, setRecurringTemplates, setLeaveRequests
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
