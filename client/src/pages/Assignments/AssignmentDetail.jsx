import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, User, UserCheck, Flag, Clock, CheckCircle2,
  ArrowLeftCircle, Trash2, MessageSquare, Send, Bell,
  Activity, Loader2, ChevronRight,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { isOverdue, daysOld } from '../../utils/helpers';
import { STATUS_COLORS } from '../../utils/constants';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import ProgressBar from '../../components/ui/ProgressBar';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function AssignmentDetail({ isOpen, onClose, assignmentId }) {
  const { assignments, clients, refresh } = useData();
  const { user, isAdmin } = useAuth();
  const showToast = useToast();

  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const assignment = assignments.find((a) => a.id === assignmentId);
  const client = assignment ? clients.find((c) => c.id === assignment.clientId) : null;

  const od = assignment ? isOverdue(assignment) : false;
  const age = assignment ? daysOld(assignment) : 0;
  const pct = assignment?.completionPct || 0;

  const isMine = assignment?.memberId === user?.id;
  const isReporter = assignment?.reportingPersonId === user?.id;
  const canComment = isMine || isReporter || isAdmin;
  const isApprover = (assignment?.reportingPersonId && assignment?.reportingPersonId === user?.id) || isAdmin;
  const showApprove = assignment?.awaitingApproval && isApprover;
  const showUnderReviewApprove = assignment?.status === 'Under Review' && isApprover;

  const activityLog = useMemo(
    () => (assignment?.activityLog || []).slice().reverse(),
    [assignment?.activityLog],
  );

  const comments = useMemo(
    () => assignment?.comments || [],
    [assignment?.comments],
  );

  // Sub-assignments
  const subAssignments = useMemo(
    () => assignments.filter((a) => a.parentAssignmentId === assignmentId),
    [assignments, assignmentId],
  );

  // Format date
  const fmtDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d.includes('T') ? d : d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fmtDateTime = (d) => {
    if (!d) return '--';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Approve completion
  const handleApprove = useCallback(async () => {
    setActionLoading(true);
    try {
      await api('POST', `/assignments/${assignmentId}/approve-completion`, { approve: true });
      await refresh();
      showToast('Completion approved');
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [assignmentId, refresh, showToast]);

  // Approve under-review (legacy path: set status to Completed)
  const handleApproveUnderReview = useCallback(async () => {
    setActionLoading(true);
    try {
      await api('PUT', `/assignments/${assignmentId}`, { status: 'Completed', completionPct: 100 });
      await refresh();
      showToast('Approved and marked Completed');
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [assignmentId, refresh, showToast]);

  // Send back
  const handleSendBack = useCallback(async () => {
    setActionLoading(true);
    try {
      if (assignment?.awaitingApproval) {
        await api('POST', `/assignments/${assignmentId}/approve-completion`, { approve: false, remark: '' });
      } else {
        await api('PUT', `/assignments/${assignmentId}`, { status: 'In Progress' });
      }
      await refresh();
      showToast('Sent back to In Progress');
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [assignmentId, assignment, refresh, showToast]);

  // Delete
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await api('DELETE', `/assignments/${assignmentId}`);
      await refresh();
      showToast('Assignment deleted');
      setDeleteOpen(false);
      onClose();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }, [assignmentId, refresh, showToast, onClose]);

  // Add comment
  const handleComment = useCallback(async () => {
    if (!commentText.trim()) { showToast('Type a comment', 'error'); return; }
    setCommentLoading(true);
    try {
      await api('POST', `/assignments/${assignmentId}/comments`, { text: commentText.trim() });
      setCommentText('');
      await refresh();
      showToast('Comment added');
    } catch (e) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setCommentLoading(false);
    }
  }, [assignmentId, commentText, refresh, showToast]);

  if (!assignment) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Assignment Details" maxWidth="2xl">
        <div className="py-12 text-center text-gray-400">Assignment not found</div>
      </Modal>
    );
  }

  const priorityColor = assignment.priority === 'Urgent' ? 'text-red-600' : assignment.priority === 'High' ? 'text-amber-600' : 'text-gray-600';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={null} maxWidth="2xl">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">
                  {client?.name || '--'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {assignment.workType}
                  {assignment.assignmentType === 'recurring' && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded">
                      Recurring
                    </span>
                  )}
                </p>
              </div>
              <Badge status={od ? 'Overdue' : assignment.status} />
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem
              icon={<User size={14} />}
              label="Assigned To"
              value={assignment.memberName || '--'}
            />
            <InfoItem
              icon={<UserCheck size={14} />}
              label="Reporting To"
              value={assignment.reportingPersonName || '--'}
            />
            <InfoItem
              icon={<Calendar size={14} />}
              label="Due Date"
              value={fmtDate(assignment.dueDate)}
              valueClass={od ? 'text-red-600 font-bold' : ''}
            />
            <InfoItem
              icon={<Flag size={14} />}
              label="Priority"
              value={assignment.priority || 'Normal'}
              valueClass={priorityColor}
            />
            <InfoItem
              icon={<Clock size={14} />}
              label="Age"
              value={`${age} days`}
            />
            {assignment.status === 'Completed' && assignment.completedAt && (
              <InfoItem
                icon={<CheckCircle2 size={14} />}
                label="Completed On"
                value={fmtDate(assignment.completedAt)}
                valueClass="text-emerald-600 font-bold"
              />
            )}
          </div>

          {/* Notes */}
          {assignment.notes && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
              {assignment.notes}
            </div>
          )}

          {/* Progress */}
          {pct > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Progress</span>
                <span className="text-2xl font-black text-blue-600">{pct}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: pct >= 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706' }}
                />
              </div>
            </div>
          )}

          {/* Remark */}
          {assignment.remark && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wide mb-1">Member's Remark</div>
              <p className="text-sm text-blue-800 italic">{assignment.remark}</p>
            </div>
          )}

          {/* Activity log */}
          {activityLog.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Activity Log</span>
              </div>
              <div className="space-y-0 border-l-2 border-gray-100 ml-2">
                <AnimatePresence>
                  {activityLog.slice(0, 8).map((log, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative pl-5 pb-4"
                    >
                      <div
                        className={`absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${log.isBackward ? 'bg-red-500' : 'bg-emerald-500'}`}
                      />
                      <div className={`text-sm font-semibold ${log.isBackward ? 'text-red-600' : 'text-gray-900'}`}>
                        {log.prevPct}% → {log.completionPct}%
                        <span className="ml-2 text-gray-400 font-normal">{log.status}</span>
                      </div>
                      {log.remark && (
                        <div className="text-xs text-blue-600 italic mt-0.5">{log.remark}</div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {fmtDateTime(log.date)} - {log.updatedByName || '--'}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Comments thread */}
          {comments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={14} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Comments</span>
              </div>
              <div className="space-y-2">
                {comments.map((m, i) => {
                  const isClientComment = m.role === 'client';
                  const isOwnComment = m.authorId === user?.id;
                  return (
                    <motion.div
                      key={m.id || i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`flex ${isOwnComment ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          isClientComment
                            ? 'bg-orange-50 border border-orange-200'
                            : isOwnComment
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <div className={`text-[11px] font-bold mb-0.5 ${
                          isOwnComment ? 'text-blue-200' : isClientComment ? 'text-orange-700' : 'text-gray-500'
                        }`}>
                          {m.authorName || m.author || 'Unknown'}
                          {isClientComment && ' - Client'}
                          {m.isReminder && ' (Reminder)'}
                        </div>
                        <div className={`text-sm leading-relaxed whitespace-pre-wrap ${
                          isOwnComment ? 'text-white' : 'text-gray-800'
                        }`}>
                          {m.text}
                        </div>
                        <div className={`text-[10px] mt-1 ${
                          isOwnComment ? 'text-blue-200' : 'text-gray-400'
                        }`}>
                          {fmtDateTime(m.date)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comment input */}
          {canComment && (
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
                placeholder="Add a comment..."
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleComment}
                disabled={commentLoading || !commentText.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
              >
                {commentLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          )}

          {/* Sub-assignments */}
          {subAssignments.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Sub-Assignments ({subAssignments.length})
              </div>
              <div className="space-y-2">
                {subAssignments.map((sa) => {
                  const saColors = STATUS_COLORS[sa.status] || STATUS_COLORS['On Hold'];
                  return (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between p-3 border border-gray-100 rounded-xl bg-gray-50/50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ChevronRight size={14} className="text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{sa.workType}</div>
                          <div className="text-[11px] text-gray-400">
                            {sa.memberName || '--'} - {fmtDate(sa.dueDate)}
                          </div>
                        </div>
                      </div>
                      <Badge status={sa.status} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {(showApprove || showUnderReviewApprove) && (
              <button
                onClick={showApprove ? handleApprove : handleApproveUnderReview}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Approve
              </button>
            )}
            {(showApprove || showUnderReviewApprove) && (
              <button
                onClick={handleSendBack}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <ArrowLeftCircle size={14} />
                Send Back
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors ml-auto"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Assignment"
        message="This assignment will be permanently deleted. This cannot be undone."
        confirmText="Delete"
        confirmColor="red"
        loading={deleting}
      />
    </>
  );
}

// Sub-component for the info grid items
function InfoItem({ icon, label, value, valueClass = '' }) {
  return (
    <div className="flex items-start gap-2">
      <div className="p-1.5 rounded-lg bg-gray-50 text-gray-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
        <div className={`text-sm font-semibold text-gray-900 truncate ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}
