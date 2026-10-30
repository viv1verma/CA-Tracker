import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Filter, Search, MessageSquare, Send,
  Clock, CheckCircle2, AlertCircle, Loader2, X, ChevronDown,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { STATUS_COLORS } from '../../utils/constants';
import { fmtDT, fmtPeriod } from '../../utils/format';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';

const STATUS_ICONS = {
  Completed: CheckCircle2,
  'In Progress': Loader2,
  Pending: Clock,
  'Under Review': AlertCircle,
  'On Hold': AlertCircle,
};

export default function ClientPortal() {
  const { user } = useAuth();
  const showToast = useToast();
  const detailModal = useModal();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadAssignments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (periodFilter) params.set('period', periodFilter);
      if (companyFilter) params.set('company', companyFilter);
      const res = await api('GET', `/client/assignments?${params.toString()}`);
      if (res) setAssignments(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('Failed to load assignments:', e);
    } finally {
      setLoading(false);
    }
  }, [periodFilter, companyFilter]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  // Derived data
  const periods = useMemo(() => {
    const set = new Set(assignments.map(a => a.period).filter(Boolean));
    return [...set].sort().reverse();
  }, [assignments]);

  const companies = useMemo(() => {
    const set = new Set(assignments.map(a => a.companyName || a.clientName).filter(Boolean));
    return [...set].sort();
  }, [assignments]);

  const filtered = useMemo(() => {
    let list = assignments;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.workType || '').toLowerCase().includes(q) ||
        (a.memberName || '').toLowerCase().includes(q) ||
        (a.clientName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [assignments, search]);

  const handleComment = useCallback(async (assignmentId) => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    try {
      await api('POST', `/assignments/${assignmentId}/comments`, { text: comment.trim() });
      showToast('Comment added');
      setComment('');
      await loadAssignments();
      // Update modal data
      if (detailModal.data) {
        const updated = assignments.find(a => a.id === assignmentId);
        if (updated) {
          detailModal.open({
            ...updated,
            comments: [...(updated.comments || []), { text: comment.trim(), author: user?.name, createdAt: new Date().toISOString() }],
          });
        }
      }
    } catch (e) {
      showToast(e.message || 'Comment failed', 'error');
    } finally {
      setSubmittingComment(false);
    }
  }, [comment, assignments, detailModal, loadAssignments, showToast, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">Track your assignments and communicate with the team</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        {periods.length > 0 && (
          <select
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Periods</option>
            {periods.map(p => (
              <option key={p} value={p}>{fmtPeriod(p)}</option>
            ))}
          </select>
        )}
        {companies.length > 1 && (
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Companies</option>
            {companies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Task Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={48} className="text-gray-300 mx-auto" />}
          title="No tasks found"
          description="Your assigned tasks will appear here."
        />
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filtered.map((a) => {
            const colors = STATUS_COLORS[a.status] || STATUS_COLORS['On Hold'];
            const Icon = STATUS_ICONS[a.status] || Clock;
            const commentCount = a.comments?.length || 0;
            return (
              <motion.div
                key={a.id}
                variants={{
                  hidden: { opacity: 0, y: 15 },
                  visible: { opacity: 1, y: 0 },
                }}
                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                onClick={() => detailModal.open(a)}
                className="bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-sm truncate">{a.workType}</h3>
                    {a.clientName && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{a.clientName}</p>
                    )}
                  </div>
                  <Badge status={a.status} />
                </div>

                {/* Details */}
                <div className="space-y-2 mb-3">
                  {a.memberName && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Avatar name={a.memberName} size={20} />
                      <span>{a.memberName}</span>
                    </div>
                  )}
                  {a.period && (
                    <div className="text-xs text-gray-400">Period: {fmtPeriod(a.period)}</div>
                  )}
                </div>

                {/* Progress */}
                {a.completionPct != null && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{a.completionPct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${a.completionPct}%`, background: colors.bar }}
                      />
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <MessageSquare size={12} />
                    {commentCount} comment{commentCount !== 1 ? 's' : ''}
                  </div>
                  {a.remark && (
                    <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{a.remark}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={detailModal.isOpen}
        onClose={() => { detailModal.close(); setComment(''); }}
        title={detailModal.data?.workType || 'Task Details'}
        maxWidth="xl"
      >
        {detailModal.data && (
          <div className="space-y-5">
            {/* Info */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl">
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Status</div>
                <Badge status={detailModal.data.status} />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Progress</div>
                <div className="font-semibold text-gray-900">{detailModal.data.completionPct || 0}%</div>
              </div>
              {detailModal.data.memberName && (
                <div>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">Assigned To</div>
                  <div className="text-sm text-gray-700">{detailModal.data.memberName}</div>
                </div>
              )}
              {detailModal.data.period && (
                <div>
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">Period</div>
                  <div className="text-sm text-gray-700">{fmtPeriod(detailModal.data.period)}</div>
                </div>
              )}
            </div>

            {/* Remark History */}
            {detailModal.data.remark && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-[10px] text-amber-600 font-semibold uppercase mb-1">Latest Remark</div>
                <p className="text-sm text-amber-800">{detailModal.data.remark}</p>
              </div>
            )}

            {/* Comments */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <MessageSquare size={16} />
                Comments
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                {(detailModal.data.comments || []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No comments yet</p>
                )}
                {(detailModal.data.comments || []).map((c, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                    <Avatar name={c.authorName || c.author || 'User'} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{c.authorName || c.author || 'User'}</span>
                        <span className="text-[10px] text-gray-400">{fmtDT(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={e => { e.preventDefault(); handleComment(detailModal.data.id); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !comment.trim()}
                  className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
