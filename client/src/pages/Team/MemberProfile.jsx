import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { fmt } from '../../utils/format';
import { isOverdue } from '../../utils/helpers';
import {
  Mail, Phone, Calendar, MapPin, Heart, Droplet,
  Briefcase, GraduationCap, Building2, KeyRound,
  Pencil, Trash2, RotateCcw, AlertTriangle, Loader2,
  UserCircle, Shield,
} from 'lucide-react';

const QUAL_STYLE = {
  CA:  { bg: '#ede9fe', text: '#7c3aed' },
  CS:  { bg: '#dcfce7', text: '#15803d' },
  CMA: { bg: '#fef3c7', text: '#b45309' },
};

const PIE_COLORS = {
  Pending: '#d97706',
  'In Progress': '#2563eb',
  'Under Review': '#7c3aed',
  Completed: '#16a34a',
  'On Hold': '#6b7280',
};

function InfoRow({ icon: Icon, label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon size={14} className="text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}

export default function MemberProfile({ isOpen, onClose, member, onEdit, onDelete }) {
  const { assignments, clients } = useData();
  const { isAdmin, isHrAdmin, hasPayrollAccess, user: me } = useAuth();
  const showToast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);

  const memberAssignments = useMemo(() => {
    if (!member) return [];
    return assignments.filter(a => a.memberId === member.id);
  }, [assignments, member]);

  const stats = useMemo(() => {
    const total = memberAssignments.length;
    const pending = memberAssignments.filter(a => a.status === 'Pending').length;
    const inProgress = memberAssignments.filter(a => a.status === 'In Progress').length;
    const underReview = memberAssignments.filter(a => a.status === 'Under Review').length;
    const completed = memberAssignments.filter(a => a.status === 'Completed').length;
    const onHold = memberAssignments.filter(a => a.status === 'On Hold').length;
    const overdue = memberAssignments.filter(a => isOverdue(a)).length;
    const rate = total ? Math.round(completed / total * 100) : 0;
    return { total, pending, inProgress, underReview, completed, onHold, overdue, rate };
  }, [memberAssignments]);

  const pieData = useMemo(() => {
    const d = [
      { name: 'Pending', value: stats.pending },
      { name: 'In Progress', value: stats.inProgress },
      { name: 'Under Review', value: stats.underReview },
      { name: 'Completed', value: stats.completed },
      { name: 'On Hold', value: stats.onHold },
    ].filter(x => x.value > 0);
    return d;
  }, [stats]);

  const handleDelete = async () => {
    if (!member) return;
    if (!window.confirm(`Delete "${member.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api('DELETE', `/users/${member.id}`);
      showToast('Member deleted');
      onDelete(member.id);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPw || newPw.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setResettingPw(true);
    try {
      await api('PUT', `/users/${member.id}`, { password: newPw });
      showToast('Password reset successfully');
      setShowResetForm(false);
      setNewPw('');
    } catch (err) {
      showToast(err.message || 'Could not reset', 'error');
    } finally {
      setResettingPw(false);
    }
  };

  if (!member) return null;

  const qs = QUAL_STYLE[member.qualification] || { bg: '#f3f4f6', text: '#374151' };
  const canEdit = isAdmin || isHrAdmin || member.id === me?.id;
  const canDelete = (isAdmin || isHrAdmin) && member.id !== me?.id;

  const gross = (member.basicSalary || 0) + (member.hra || 0) + (member.conveyance || 0) + (member.otherAllowance || 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <Avatar name={member.name} size={64} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{member.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{member.designation || 'Team Member'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: qs.bg, color: qs.text }}
            >
              {member.qualification || '\u2014'}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
              {member.role === 'admin' ? 'Admin' : 'Member'}
            </span>
            {member.branch && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">
                {member.branch}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {canEdit && (
            <button
              onClick={() => onEdit(member)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </button>
          )}
          {(isAdmin || isHrAdmin) && (
            <button
              onClick={() => setShowResetForm(!showResetForm)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              <RotateCcw size={13} /> Reset Password
            </button>
          )}
        </div>
      </div>

      {/* Reset PW form */}
      {showResetForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6"
        >
          <p className="text-sm font-semibold text-amber-800 mb-2">Reset password for {member.name}</p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="New password (min 6 chars)"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="flex-1 h-9 px-3 rounded-lg border border-amber-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={handleResetPassword}
              disabled={resettingPw}
              className="px-4 h-9 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {resettingPw ? 'Resetting...' : 'Reset'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Stats and chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Tasks', value: stats.total, color: '#1e40af', bg: '#eff6ff' },
            { label: 'Pending', value: stats.pending, color: '#d97706', bg: '#fffbeb' },
            { label: 'Completed', value: stats.completed, color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Overdue', value: stats.overdue, color: '#dc2626', bg: '#fef2f2' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg }}>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{s.label}</div>
            </div>
          ))}
          {/* Completion rate */}
          <div className="col-span-2 bg-gray-50 rounded-xl p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 font-semibold">Completion Rate</span>
              <span className="text-lg font-black" style={{ color: stats.rate >= 80 ? '#16a34a' : stats.rate >= 50 ? '#d97706' : '#dc2626' }}>
                {stats.rate}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${stats.rate}%`,
                  background: stats.rate >= 80 ? '#16a34a' : stats.rate >= 50 ? '#d97706' : '#dc2626',
                }}
              />
            </div>
          </div>
        </div>

        {/* Pie chart */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Task Distribution</h4>
          {pieData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No tasks assigned
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[d.name] }} />
                <span className="text-gray-600 font-medium">{d.name}: {d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Contact & Personal */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Contact & Personal</h4>
          <InfoRow icon={Mail} label="Email" value={member.email} />
          <InfoRow icon={Phone} label="Mobile" value={member.mobile} />
          <InfoRow icon={Calendar} label="Date of Birth" value={fmt(member.dob)} />
          <InfoRow icon={Heart} label="Anniversary" value={fmt(member.anniversary)} />
          <InfoRow icon={Droplet} label="Blood Group" value={member.bloodGroup} />
        </div>

        {/* Work */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Employment</h4>
          <InfoRow icon={Briefcase} label="Designation" value={member.designation} />
          <InfoRow icon={GraduationCap} label="Qualification" value={member.qualification} />
          <InfoRow icon={Building2} label="Branch" value={member.branch} />
          <InfoRow icon={Calendar} label="Joining Date" value={fmt(member.joiningDate)} />
          <InfoRow icon={KeyRound} label="Username" value={member.username ? `@${member.username}` : null} />
          <InfoRow icon={Shield} label="Role" value={member.role === 'admin' ? 'Administrator' : 'Team Member'} />
        </div>
      </div>

      {/* Emergency Contact */}
      {(member.emergencyName || member.emergencyPhone) && (
        <div className="bg-red-50 rounded-xl p-4 mb-6">
          <h4 className="text-xs font-bold text-red-600 uppercase mb-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Emergency Contact
          </h4>
          <InfoRow icon={UserCircle} label="Name" value={member.emergencyName} />
          <InfoRow icon={Phone} label="Phone" value={member.emergencyPhone} />
        </div>
      )}

      {/* Salary */}
      {hasPayrollAccess && gross > 0 && (
        <div className="bg-emerald-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-emerald-700 uppercase mb-3">Salary Breakdown</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Basic', value: member.basicSalary },
              { label: 'HRA', value: member.hra },
              { label: 'Conveyance', value: member.conveyance },
              { label: 'Other', value: member.otherAllowance },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-3 text-center">
                <div className="text-base font-bold text-gray-800">
                  {'\u20B9'}{(s.value || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-gray-500 font-semibold uppercase mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-sm font-bold text-emerald-700">
            Gross: {'\u20B9'}{gross.toLocaleString('en-IN')}/month
          </div>
        </div>
      )}
    </Modal>
  );
}
