import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Upload, Download, FileText, Filter, X,
  CheckCircle2, Clock, FileCheck, AlertCircle, CircleDot,
  Send, Bell, Trash2, MessageSquare, User, Phone, Mail,
  Check, Circle, ChevronRight,
} from 'lucide-react';
import { api } from '../../api/client';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { fmtDT } from '../../utils/format';

const ITR_STAGES = [
  { key: 'Not Started', label: 'Not Started', color: 'bg-gray-400', textColor: 'text-gray-600', bgLight: 'bg-gray-100' },
  { key: 'Docs Received', label: 'Docs Received', color: 'bg-blue-500', textColor: 'text-blue-600', bgLight: 'bg-blue-100' },
  { key: 'In Preparation', label: 'In Preparation', color: 'bg-amber-500', textColor: 'text-amber-600', bgLight: 'bg-amber-100' },
  { key: 'Filed', label: 'Filed', color: 'bg-emerald-500', textColor: 'text-emerald-600', bgLight: 'bg-emerald-100' },
  { key: 'Verified', label: 'Verified', color: 'bg-teal-600', textColor: 'text-teal-700', bgLight: 'bg-teal-100' },
];

const STAGE_MAP = Object.fromEntries(ITR_STAGES.map(s => [s.key, s]));

const FILING_DECISIONS = [
  { key: 'Confirmed', label: 'Confirmed', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-100 border-emerald-300' },
  { key: 'Parked', label: 'Parked', icon: Clock, color: 'text-amber-600 bg-amber-100 border-amber-300' },
  { key: 'Undecided', label: 'Undecided', icon: CircleDot, color: 'text-gray-500 bg-gray-100 border-gray-300' },
];

const AY_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const options = [];
  for (let y = current + 1; y >= current - 3; y--) {
    options.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return options;
})();

const ITR_TYPES = ['Individual', 'HUF', 'Firm', 'Company', 'Trust', 'AOP/BOI', 'Other'];

const EMPTY_PARTY = {
  name: '', pan: '', ay: AY_OPTIONS[0], type: 'Individual',
  email: '', mobile: '', memberId: '', reportingTo: '',
  stage: 'Not Started', filingDecision: 'Undecided', notify: false,
};

/* ------ Stage Pipeline Component ------ */
function StagePipeline({ current, onChange }) {
  const currentIdx = ITR_STAGES.findIndex(s => s.key === current);

  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto py-2">
      {ITR_STAGES.map((stage, idx) => {
        const isActive = idx === currentIdx;
        const isCompleted = idx < currentIdx;
        const isClickable = true;

        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => onChange(stage.key)}
              className={`
                relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all w-full min-w-[80px]
                ${isActive ? `${stage.bgLight} ring-2 ring-offset-1 ring-current ${stage.textColor} scale-105` : ''}
                ${isCompleted ? 'opacity-90' : ''}
                ${!isActive && !isCompleted ? 'opacity-60 hover:opacity-80' : ''}
                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
              `}
            >
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold
                ${isCompleted ? 'bg-emerald-500' : isActive ? stage.color : 'bg-gray-300'}
              `}>
                {isCompleted ? <Check size={16} /> : idx + 1}
              </div>
              <span className={`text-[10px] font-semibold text-center leading-tight ${isActive ? stage.textColor : 'text-gray-500'}`}>
                {stage.label}
              </span>
            </button>
            {idx < ITR_STAGES.length - 1 && (
              <div className={`h-0.5 w-4 flex-shrink-0 ${idx < currentIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------ ITR Detail Modal ------ */
function ItrDetailModal({ isOpen, onClose, party, users, onRefresh }) {
  const showToast = useToast();
  const { isAdmin } = useAuth();
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(party?.comments || []);
  const [submitting, setSubmitting] = useState(false);
  const [localParty, setLocalParty] = useState(party);
  const deleteModal = useModal();

  useEffect(() => {
    if (party) {
      setLocalParty(party);
      setComments(party.comments || []);
    }
  }, [party]);

  if (!localParty) return null;

  const handleStageChange = async (stage) => {
    try {
      await api('PUT', `/itr/parties/${localParty.id}/stage`, { stage });
      setLocalParty(prev => ({ ...prev, stage }));
      showToast(`Stage updated to ${stage}`);
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleAssignChange = async (field, value) => {
    try {
      await api('PUT', `/itr/parties/${localParty.id}/assign`, { [field]: value });
      setLocalParty(prev => ({ ...prev, [field]: value }));
      showToast('Assignment updated');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleDecisionChange = async (decision) => {
    try {
      await api('PUT', `/itr/parties/${localParty.id}/decision`, { filingDecision: decision });
      setLocalParty(prev => ({ ...prev, filingDecision: decision }));
      showToast('Filing decision updated');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await api('POST', `/itr/parties/${localParty.id}/comments`, { text: comment.trim() });
      setComments(prev => [...prev, res || { text: comment.trim(), createdAt: new Date().toISOString(), author: 'You' }]);
      setComment('');
      onRefresh();
    } catch (e) {
      showToast(e.message || 'Comment failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api('DELETE', `/itr/parties/${localParty.id}`);
      showToast('Party deleted');
      onRefresh();
      deleteModal.close();
      onClose();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  const members = users.filter(u => u.role === 'member' || u.role === 'admin').sort((a, b) => a.name.localeCompare(b.name));
  const stageInfo = STAGE_MAP[localParty.stage] || STAGE_MAP['Not Started'];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ITR Party Details" maxWidth="3xl">
      <div className="space-y-6">
        {/* Party Info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase">Name</div>
            <div className="font-semibold text-gray-900 mt-0.5">{localParty.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase">PAN</div>
            <div className="font-mono text-sm text-gray-700 mt-0.5">{localParty.pan || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase">AY</div>
            <div className="text-sm text-gray-700 mt-0.5">{localParty.ay}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase">Type</div>
            <div className="text-sm text-gray-700 mt-0.5">{localParty.type || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-1"><Mail size={10} /> Email</div>
            <div className="text-sm text-gray-700 mt-0.5">{localParty.email || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-1"><Phone size={10} /> Mobile</div>
            <div className="text-sm text-gray-700 mt-0.5">{localParty.mobile || '--'}</div>
          </div>
        </div>

        {/* Stage Pipeline */}
        <div>
          <h4 className="text-sm font-bold text-gray-700 mb-2">Filing Stage</h4>
          <StagePipeline current={localParty.stage} onChange={handleStageChange} />
        </div>

        {/* Assignment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned To</label>
            <select
              value={localParty.memberId || ''}
              onChange={e => handleAssignChange('memberId', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Reporting To</label>
            <select
              value={localParty.reportingTo || ''}
              onChange={e => handleAssignChange('reportingTo', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">None</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {/* Filing Decision */}
        <div>
          <h4 className="text-sm font-bold text-gray-700 mb-2">Filing Decision</h4>
          <div className="flex gap-3">
            {FILING_DECISIONS.map(d => {
              const Icon = d.icon;
              const isSelected = localParty.filingDecision === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => handleDecisionChange(d.key)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                    ${isSelected ? d.color : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'}
                  `}
                >
                  <Icon size={16} />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comments */}
        <div>
          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <MessageSquare size={16} />
            Comments
          </h4>
          <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
            {comments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No comments yet</p>
            )}
            {comments.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <Avatar name={c.authorName || c.author || 'User'} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{c.authorName || c.author || 'User'}</span>
                    <span className="text-[10px] text-gray-400">{fmtDT(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{c.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <form onSubmit={handleComment} className="flex gap-2">
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <button
              type="submit"
              disabled={submitting || !comment.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={localParty.notify || false}
                onChange={async (e) => {
                  try {
                    await api('PUT', `/itr/parties/${localParty.id}/assign`, { notify: e.target.checked });
                    setLocalParty(prev => ({ ...prev, notify: e.target.checked }));
                  } catch {}
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <Bell size={14} />
              Notify Client
            </label>
          </div>
          {isAdmin && (
            <button
              onClick={() => deleteModal.open()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 size={14} />
              Delete Party
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={handleDelete}
        title="Delete ITR Party"
        message={`"${localParty.name}" will be permanently removed from ITR tracking.`}
        confirmText="Delete"
        confirmColor="red"
      />
    </Modal>
  );
}

/* ------ Main ITR Dashboard ------ */
export default function ItrDashboard() {
  const { itrParties, users, refresh } = useData();
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const formModal = useModal();
  const detailModal = useModal();

  const [search, setSearch] = useState('');
  const [ayFilter, setAyFilter] = useState(AY_OPTIONS[0]);
  const [stageFilter, setStageFilter] = useState('');
  const [form, setForm] = useState(EMPTY_PARTY);
  const [saving, setSaving] = useState(false);

  const parties = useMemo(() => {
    return itrParties.filter(p => !ayFilter || p.ay === ayFilter);
  }, [itrParties, ayFilter]);

  const filtered = useMemo(() => {
    let list = parties;
    if (stageFilter) list = list.filter(p => p.stage === stageFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.pan || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [parties, stageFilter, search]);

  const stats = useMemo(() => {
    const total = parties.length;
    const filed = parties.filter(p => p.stage === 'Filed' || p.stage === 'Verified').length;
    const inPrep = parties.filter(p => p.stage === 'In Preparation').length;
    const notStarted = parties.filter(p => p.stage === 'Not Started').length;
    const docsReceived = parties.filter(p => p.stage === 'Docs Received').length;
    return { total, filed, inPrep, notStarted, docsReceived };
  }, [parties]);

  const memberMap = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u])),
    [users],
  );

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.name) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api('POST', '/itr/parties', { ...form, ay: ayFilter || form.ay });
      showToast('Party added');
      await refresh();
      formModal.close();
      setForm(EMPTY_PARTY);
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, ayFilter, formModal, refresh, showToast]);

  const handleExportExcel = useCallback(async () => {
    try {
      const token = localStorage.getItem('garp_tok');
      const res = await fetch(`/api/itr/export.xlsx?ay=${ayFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ITR_${ayFilter}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Excel exported');
    } catch (e) {
      showToast(e.message || 'Export failed', 'error');
    }
  }, [ayFilter, showToast]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ITR Filing</h1>
          <p className="text-sm text-gray-500 mt-1">Track income tax return filing status for all parties</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ayFilter}
            onChange={e => setAyFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {AY_OPTIONS.map(ay => (
              <option key={ay} value={ay}>AY {ay}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total Parties" value={stats.total} color="blue" />
        <StatCard label="Filed" value={stats.filed} color="green" />
        <StatCard label="In Preparation" value={stats.inPrep} color="blue" />
        <StatCard label="Not Started" value={stats.notStarted} color="red" highlight={stats.notStarted > 0} />
        <StatCard label="Docs Received" value={stats.docsReceived} color="blue" />
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or PAN..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Stages</option>
            {ITR_STAGES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            Export Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => { setForm({ ...EMPTY_PARTY, ay: ayFilter }); formModal.open(); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} />
              Add Party
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">PAN</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">AY</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned To</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Decision</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Last Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {filtered.map((p, idx) => {
                  const stageInfo = STAGE_MAP[p.stage] || STAGE_MAP['Not Started'];
                  const member = memberMap[p.memberId];
                  const lastComment = p.comments?.length > 0 ? p.comments[p.comments.length - 1] : null;
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => detailModal.open(p)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={p.name} size={30} />
                          <span className="font-semibold text-gray-900 truncate max-w-[160px]">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.pan || '--'}</td>
                      <td className="px-4 py-3 text-center text-gray-600 text-xs font-semibold">{p.ay}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{p.type || '--'}</td>
                      <td className="px-4 py-3">
                        {member ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar name={member.name} size={22} />
                            <span className="text-xs text-gray-700">{member.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${stageInfo.bgLight} ${stageInfo.textColor}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stageInfo.color}`} />
                          {stageInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold ${
                          p.filingDecision === 'Confirmed' ? 'text-emerald-600' :
                          p.filingDecision === 'Parked' ? 'text-amber-600' : 'text-gray-400'
                        }`}>
                          {p.filingDecision || 'Undecided'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        {lastComment ? (
                          <p className="text-xs text-gray-500 truncate">{lastComment.text}</p>
                        ) : (
                          <span className="text-xs text-gray-300">--</span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16">
            <EmptyState
              icon={<FileText size={48} className="text-gray-300 mx-auto" />}
              title={search || stageFilter ? 'No matching parties' : 'No ITR parties yet'}
              description={search || stageFilter ? 'Try adjusting your filters.' : 'Click "Add Party" to start tracking ITR filings.'}
            />
          </div>
        )}
      </div>

      {/* Add Party Modal */}
      <Modal isOpen={formModal.isOpen} onClose={formModal.close} title="Add ITR Party" maxWidth="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">PAN</label>
              <input
                type="text"
                value={form.pan}
                onChange={e => updateField('pan', e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assessment Year</label>
              <select
                value={form.ay}
                onChange={e => updateField('ay', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {AY_OPTIONS.map(ay => <option key={ay} value={ay}>AY {ay}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => updateField('type', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {ITR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => updateField('email', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={e => updateField('mobile', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={formModal.close} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Party'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <ItrDetailModal
        isOpen={detailModal.isOpen}
        onClose={detailModal.close}
        party={detailModal.data}
        users={users}
        onRefresh={refresh}
      />
    </div>
  );
}
