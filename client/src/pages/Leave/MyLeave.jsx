import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import {
  Calendar, ChevronDown, ChevronUp, Clock, Plus, Send, Check,
  X, AlertCircle, Briefcase, Coffee, Heart, Umbrella, Moon,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../utils/format';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LEAVE_TYPES = [
  { value: 'Casual Leave',       label: 'Casual Leave',       icon: Coffee },
  { value: 'Sick Leave',         label: 'Sick Leave',          icon: Heart },
  { value: 'Earned Leave',       label: 'Earned Leave',        icon: Briefcase },
  { value: 'Work from Home',     label: 'Work from Home',      icon: Moon },
  { value: 'Half Day',           label: 'Half Day',            icon: Clock },
  { value: 'Leave Without Pay',  label: 'Leave Without Pay',   icon: Umbrella },
];

const STATUS_BADGE = {
  pending:  { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

const FILTER_TABS = ['All', 'pending', 'approved', 'rejected'];

/* ------------------------------------------------------------------ */
/*  Balance Ring Component                                             */
/* ------------------------------------------------------------------ */

function BalanceRing({ available, total, label, color, accent }) {
  const used = Math.max(0, total - available);
  const data = [
    { name: 'Available', value: available },
    { name: 'Used', value: used },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border p-5 ${accent}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={26}
                outerRadius={36}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={0}
              >
                <Cell fill={color} />
                <Cell fill="#e5e7eb" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-gray-900">{available}</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {available} available / {total} total
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{used} used</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Apply Leave Form                                                   */
/* ------------------------------------------------------------------ */

function ApplyLeaveForm({ onSubmit, loading: submitting }) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState('Casual Leave');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  // Calculate working days (Mon-Sat)
  const workingDays = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const start = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    if (end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0) count++; // Skip only Sunday
      cur.setDate(cur.getDate() + 1);
    }
    if (type === 'Half Day') return 0.5;
    return count;
  }, [fromDate, toDate, type]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fromDate || !toDate || !reason.trim()) return;
    onSubmit({ type, fromDate, toDate, reason, days: workingDays });
    setType('Casual Leave');
    setFromDate('');
    setToDate('');
    setReason('');
    setExpanded(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
    >
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
            <Plus size={18} />
          </div>
          <span className="text-sm font-bold text-gray-900">Apply for Leave</span>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={18} className="text-gray-400" />
        </motion.div>
      </button>

      {/* Expandable form */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
              {/* Leave Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Leave Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LEAVE_TYPES.map(lt => {
                    const Icon = lt.icon;
                    const active = type === lt.value;
                    return (
                      <button
                        key={lt.value}
                        type="button"
                        onClick={() => setType(lt.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <Icon size={14} />
                        {lt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => {
                      setFromDate(e.target.value);
                      if (!toDate || e.target.value > toDate) setToDate(e.target.value);
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    min={fromDate}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Days calculator */}
              {workingDays > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg"
                >
                  <Calendar size={14} className="text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">
                    {workingDays} working day{workingDays !== 1 ? 's' : ''}
                  </span>
                </motion.div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reason</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="Briefly explain the reason..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !fromDate || !toDate || !reason.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Submit Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function MyLeave() {
  const { user, isAdmin, isHrAdmin } = useAuth();
  const { leaveRequests, setLeaveRequests, refresh } = useData();
  const toast = useToast();

  const [balance, setBalance] = useState(null);
  const [compOffs, setCompOffs] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState(0); // 0=All, 1=Pending, 2=Approved, 3=Rejected
  const [actionLoading, setActionLoading] = useState(null);

  // Fetch leave balance (includes compOff data)
  useEffect(() => {
    async function load() {
      try {
        const bal = await api('GET', '/leaves/balance');
        if (bal) {
          setBalance(bal);
          // compOff is included in the balance response
          setCompOffs(bal.compOff?.available || 0);
        }
      } catch {
        // fallback
      } finally {
        setLoadingBalance(false);
      }
    }
    load();
  }, []);

  // Submit leave request
  const handleApply = async (formData) => {
    setSubmitting(true);
    try {
      const res = await api('POST', '/leave-requests', {
        type: formData.type,
        fromDate: formData.fromDate,
        toDate: formData.toDate,
        reason: formData.reason,
        days: formData.days,
      });
      toast('Leave request submitted!');
      refresh();
    } catch (err) {
      toast(err.message || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Approve / Reject (admin)
  const handleAction = async (id, action, note = '') => {
    setActionLoading(id);
    try {
      await api('PUT', `/leave-requests/${id}`, { status: action, adminNote: note });
      toast(`Leave ${action.toLowerCase()}`);
      refresh();
    } catch (err) {
      toast(err.message || `Failed to ${action.toLowerCase()}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Filter leave history
  const filteredRequests = useMemo(() => {
    const filter = FILTER_TABS[filterTab];
    let list = leaveRequests || [];
    // If not admin, only show own requests
    if (!isAdmin && !isHrAdmin) {
      list = list.filter(r => r.memberId === user?.id || r.userId === user?.id);
    }
    if (filter !== 'All') {
      list = list.filter(r => r.status === filter);
    }
    return list.sort((a, b) => new Date(b.createdAt || b.fromDate) - new Date(a.createdAt || a.fromDate));
  }, [leaveRequests, filterTab, isAdmin, isHrAdmin, user]);

  // Balance defaults - backend returns { accrued, used, remaining, openingLeave, adjustments, compOff }
  // Display remaining as available, and accrued as total (unified paid leave pool)
  const paidLeave = balance ? { available: balance.remaining || 0, total: balance.accrued || 18 } : { available: 0, total: 18 };
  const sickLeave = { available: 0, total: 0 }; // Backend uses unified pool, no separate sick leave
  const earnedLeave = { available: 0, total: 0 }; // Backend uses unified pool

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/*  Leave Balance Cards                                          */}
      {/* ============================================================ */}
      {loadingBalance ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BalanceRing
            available={typeof paidLeave === 'object' ? paidLeave.available : paidLeave}
            total={typeof paidLeave === 'object' ? paidLeave.total : 12}
            label="Paid Leave"
            color="#2563eb"
            accent="border-blue-200 bg-blue-50/30"
          />
          <BalanceRing
            available={typeof sickLeave === 'object' ? sickLeave.available : sickLeave}
            total={typeof sickLeave === 'object' ? sickLeave.total : 6}
            label="Sick Leave"
            color="#dc2626"
            accent="border-red-200 bg-red-50/30"
          />
          <BalanceRing
            available={typeof earnedLeave === 'object' ? earnedLeave.available : earnedLeave}
            total={typeof earnedLeave === 'object' ? earnedLeave.total : 15}
            label="Earned Leave"
            color="#7c3aed"
            accent="border-purple-200 bg-purple-50/30"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 flex items-center gap-4"
          >
            <div className="w-20 h-20 flex items-center justify-center rounded-full bg-emerald-100">
              <span className="text-2xl font-bold text-emerald-700">{compOffs}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Comp-Off</p>
              <p className="text-xs text-gray-500 mt-0.5">{compOffs} available</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Apply Leave Form                                             */}
      {/* ============================================================ */}
      <ApplyLeaveForm onSubmit={handleApply} loading={submitting} />

      {/* ============================================================ */}
      {/*  Leave History                                                */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-gray-200 bg-white"
      >
        {/* Tabs */}
        <TabGroup selectedIndex={filterTab} onChange={setFilterTab}>
          <TabList className="flex gap-1 px-5 pt-4">
            {FILTER_TABS.map(tab => (
              <Tab key={tab} className="outline-none">
                {({ selected }) => (
                  <span className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors capitalize ${
                    selected
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}>
                    {tab === 'All' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab !== 'All' && (
                      <span className="ml-1.5 text-xs">
                        ({(leaveRequests || []).filter(r => {
                          const matchStatus = r.status === tab;
                          const matchUser = isAdmin || isHrAdmin || r.memberId === user?.id || r.userId === user?.id;
                          return matchStatus && matchUser;
                        }).length})
                      </span>
                    )}
                  </span>
                )}
              </Tab>
            ))}
          </TabList>

          <TabPanels className="p-5">
            {FILTER_TABS.map((tab, tabIdx) => (
              <TabPanel key={tab}>
                {filteredRequests.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Calendar size={36} className="mx-auto mb-3 opacity-50" />
                    <p className="font-semibold text-gray-500">No {tab === 'All' ? '' : tab + ' '}leave requests</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {(isAdmin || isHrAdmin) && (
                            <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Employee</th>
                          )}
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">From</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">To</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Days</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Type</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Reason</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Note</th>
                          {(isAdmin || isHrAdmin) && (
                            <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {filteredRequests.map((req, i) => {
                            const sBadge = STATUS_BADGE[req.status] || STATUS_BADGE.pending;
                            const typeLabel = LEAVE_TYPES.find(t => t.value === req.type)?.label || req.type;

                            return (
                              <motion.tr
                                key={req.id || i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ delay: i * 0.03 }}
                                className="border-b border-gray-50 hover:bg-gray-50"
                              >
                                {(isAdmin || isHrAdmin) && (
                                  <td className="py-2.5 px-3 font-medium text-gray-700">
                                    {req.memberName || req.userName || '--'}
                                  </td>
                                )}
                                <td className="py-2.5 px-3 text-gray-600">{fmt(req.fromDate)}</td>
                                <td className="py-2.5 px-3 text-gray-600">{fmt(req.toDate)}</td>
                                <td className="py-2.5 px-3 font-semibold text-gray-700">{req.days || '--'}</td>
                                <td className="py-2.5 px-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                                    {typeLabel}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[180px] truncate">{req.reason || '--'}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${sBadge.bg} ${sBadge.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${sBadge.dot}`} />
                                    {req.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[150px] truncate">
                                  {req.adminNote || '--'}
                                </td>
                                {(isAdmin || isHrAdmin) && (
                                  <td className="py-2.5 px-3 text-right">
                                    {req.status === 'pending' && (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => handleAction(req.id, 'approved')}
                                          disabled={actionLoading === req.id}
                                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                                          title="Approve"
                                        >
                                          <Check size={16} />
                                        </button>
                                        <button
                                          onClick={() => handleAction(req.id, 'rejected')}
                                          disabled={actionLoading === req.id}
                                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                          title="Reject"
                                        >
                                          <X size={16} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </TabPanel>
            ))}
          </TabPanels>
        </TabGroup>
      </motion.div>
    </div>
  );
}
