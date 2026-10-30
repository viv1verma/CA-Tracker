import { useState, useMemo, useCallback } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, RotateCcw, CheckCircle2, Clock, Search,
  ArrowRight, Loader2, PartyPopper,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';

export default function Approvals() {
  const { assignments, clients, ddRequests, reopenRequests, refresh } = useData();
  const { isAdmin } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])),
    [clients],
  );

  // Completion approvals (Under Review assignments)
  const completions = useMemo(
    () => assignments.filter((a) => a.status === 'Under Review'),
    [assignments],
  );

  // Pending due-date requests
  const pendingDD = useMemo(
    () => (ddRequests || []).filter((r) => r.status === 'pending'),
    [ddRequests],
  );

  // Pending reopen requests
  const pendingReopen = useMemo(
    () => (reopenRequests || []).filter((r) => r.status === 'pending'),
    [reopenRequests],
  );

  const total = completions.length + pendingDD.length + pendingReopen.length;

  // Filter by search
  const filterBySearch = useCallback(
    (items, searchFields) => {
      if (!search) return items;
      const q = search.toLowerCase();
      return items.filter((item) =>
        searchFields.some((fn) => (fn(item) || '').toLowerCase().includes(q)),
      );
    },
    [search],
  );

  const filteredCompletions = filterBySearch(completions, [
    (a) => clientMap[a.clientId]?.name,
    (a) => a.workType,
    (a) => a.memberName,
  ]);

  const filteredDD = filterBySearch(pendingDD, [
    (r) => r.clientName,
    (r) => r.workType,
    (r) => r.requestedByName || r.memberName,
  ]);

  const filteredReopen = filterBySearch(pendingReopen, [
    (r) => r.clientName,
    (r) => r.workType,
    (r) => r.requestedByName,
    (r) => r.memberName,
  ]);

  // Format date
  const fmtDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d.includes('T') ? d : d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ---- Action handlers ----

  const handleCompletionApproval = useCallback(
    async (id, approve) => {
      setLoadingId(id);
      try {
        await api('POST', `/assignments/${id}/approve-completion`, {
          approve,
          remark: approve ? '' : 'Sent back for revision',
        });
        await refresh();
        showToast(approve ? 'Approved' : 'Sent back');
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
      } finally {
        setLoadingId(null);
      }
    },
    [refresh, showToast],
  );

  const handleDDRequest = useCallback(
    async (id, approve) => {
      setLoadingId(id);
      try {
        await api('PUT', `/due-date-requests/${id}`, { status: approve ? 'approved' : 'rejected' });
        await refresh();
        showToast(approve ? 'Due date change approved' : 'Request rejected');
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
      } finally {
        setLoadingId(null);
      }
    },
    [refresh, showToast],
  );

  const handleReopenRequest = useCallback(
    async (id, approve) => {
      setLoadingId(id);
      try {
        await api('PUT', `/reopen-requests/${id}`, { status: approve ? 'approved' : 'rejected' });
        await refresh();
        showToast(approve ? 'Reopen approved' : 'Request rejected');
      } catch (e) {
        showToast(e.message || 'Failed', 'error');
      } finally {
        setLoadingId(null);
      }
    },
    [refresh, showToast],
  );

  // Tab configuration
  const tabs = [
    {
      label: 'Completions',
      count: completions.length,
      icon: <CheckCircle2 size={15} />,
      color: '#16a34a',
    },
    {
      label: 'Due Date',
      count: pendingDD.length,
      icon: <Calendar size={15} />,
      color: '#d97706',
    },
    {
      label: 'Reopen',
      count: pendingReopen.length,
      icon: <RotateCcw size={15} />,
      color: '#7c3aed',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total === 0
              ? 'All caught up!'
              : `${total} item${total !== 1 ? 's' : ''} awaiting your review`}
          </p>
        </div>
      </div>

      {/* All-clear banner */}
      {total === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center"
        >
          <PartyPopper size={40} className="text-emerald-500 mx-auto mb-3" />
          <div className="text-lg font-bold text-emerald-700">All caught up!</div>
          <div className="text-sm text-emerald-600 mt-1">No pending approvals at the moment.</div>
        </motion.div>
      )}

      {/* Search */}
      {total > 0 && (
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search approvals..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
      )}

      {/* Tabs */}
      {total > 0 && (
        <TabGroup>
          <TabList className="flex gap-1 p-1 bg-gray-100 rounded-xl max-w-fit">
            {tabs.map((tab) => (
              <Tab
                key={tab.label}
                className={({ selected }) =>
                  `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all outline-none ${
                    selected
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`
                }
              >
                {tab.icon}
                {tab.label}
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 text-[10px] font-bold rounded-full px-1.5 ml-0.5"
                  style={
                    tab.count > 0
                      ? { background: tab.color, color: '#fff' }
                      : { background: '#e5e7eb', color: '#9ca3af' }
                  }
                >
                  {tab.count}
                </span>
              </Tab>
            ))}
          </TabList>

          <TabPanels className="mt-4">
            {/* Completion Approvals */}
            <TabPanel>
              <AnimatePresence mode="wait">
                {filteredCompletions.length === 0 ? (
                  <EmptyPanel message="No completion approvals pending." />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    {filteredCompletions.map((a, i) => {
                      const cl = clientMap[a.clientId];
                      const isLoading = loadingId === a.id;
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <Avatar name={cl?.name || '?'} size={36} />
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900">
                                  {cl?.name || '--'} -- {a.workType}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  By {a.memberName || '--'} - Due {fmtDate(a.dueDate)} - {a.completionPct || 0}% done
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <ActionButton
                                onClick={() => handleCompletionApproval(a.id, true)}
                                loading={isLoading}
                                variant="approve"
                              >
                                Approve
                              </ActionButton>
                              <ActionButton
                                onClick={() => handleCompletionApproval(a.id, false)}
                                loading={isLoading}
                                variant="reject"
                              >
                                Send Back
                              </ActionButton>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabPanel>

            {/* Due Date Requests */}
            <TabPanel>
              <AnimatePresence mode="wait">
                {filteredDD.length === 0 ? (
                  <EmptyPanel message="No due date change requests pending." />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    {filteredDD.map((r, i) => {
                      const isLoading = loadingId === r.id;
                      return (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">
                                {r.clientName || '--'} -- {r.workType || ''}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                <div>
                                  By {r.requestedByName || r.memberName || '--'}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-gray-700">{fmtDate(r.currentDueDate)}</span>
                                  <ArrowRight size={12} className="text-amber-500" />
                                  <span className="font-bold text-amber-700">{fmtDate(r.requestedDueDate || r.newDueDate)}</span>
                                </div>
                                {r.reason && (
                                  <div className="text-gray-400 italic mt-1">"{r.reason}"</div>
                                )}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-2 shrink-0">
                                <ActionButton
                                  onClick={() => handleDDRequest(r.id, true)}
                                  loading={isLoading}
                                  variant="approve"
                                >
                                  Approve
                                </ActionButton>
                                <ActionButton
                                  onClick={() => handleDDRequest(r.id, false)}
                                  loading={isLoading}
                                  variant="reject"
                                >
                                  Reject
                                </ActionButton>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabPanel>

            {/* Reopen Requests */}
            <TabPanel>
              <AnimatePresence mode="wait">
                {filteredReopen.length === 0 ? (
                  <EmptyPanel message="No reopen requests pending." />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    {filteredReopen.map((r, i) => {
                      const isLoading = loadingId === r.id;
                      return (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">
                                {r.clientName || '--'} -- {r.workType || ''}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                <div>
                                  Requested by {r.requestedByName || '--'} - for {r.memberName || '--'}
                                </div>
                                {r.reason && (
                                  <div className="text-gray-400 italic mt-1">"{r.reason}"</div>
                                )}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-2 shrink-0">
                                <ActionButton
                                  onClick={() => handleReopenRequest(r.id, true)}
                                  loading={isLoading}
                                  variant="approve"
                                >
                                  Approve
                                </ActionButton>
                                <ActionButton
                                  onClick={() => handleReopenRequest(r.id, false)}
                                  loading={isLoading}
                                  variant="reject"
                                >
                                  Reject
                                </ActionButton>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      )}
    </div>
  );
}

// Reusable action button
function ActionButton({ onClick, loading, variant, children }) {
  const styles = {
    approve:
      'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600',
    reject:
      'bg-red-50 hover:bg-red-100 text-red-600 border-red-200',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

// Empty state for a tab panel
function EmptyPanel({ message }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center"
    >
      <Clock size={28} className="text-gray-300 mx-auto mb-2" />
      <div className="text-sm text-gray-400">{message}</div>
    </motion.div>
  );
}
