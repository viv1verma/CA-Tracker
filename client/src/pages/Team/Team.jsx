import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { api } from '../../api/client';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import UserForm from './UserForm';
import MemberProfile from './MemberProfile';
import { isOverdue } from '../../utils/helpers';
import { fmt } from '../../utils/format';
import {
  Search, Plus, ArrowUpDown, Mail, Phone,
  Users, ClipboardList, Clock, AlertTriangle,
  GraduationCap, Building2, Calendar,
} from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'pending', label: 'Pending' },
  { value: 'joining', label: 'Joining Date' },
];

const QUAL_STYLE = {
  CA:  { bg: '#ede9fe', text: '#7c3aed' },
  CS:  { bg: '#dcfce7', text: '#15803d' },
  CMA: { bg: '#fef3c7', text: '#b45309' },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 },
  }),
};

function MiniProgressCircle({ pct }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="relative w-10 h-10 flex items-center justify-center">
      <svg width={36} height={36} className="-rotate-90">
        <circle cx={18} cy={18} r={r} fill="none" stroke="#f3f4f6" strokeWidth={3} />
        <circle
          cx={18} cy={18} r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[9px] font-black" style={{ color }}>{pct}%</span>
    </div>
  );
}

export default function Team() {
  const { users, assignments, setUsers, loading } = useData();
  const { isAdmin, isHrAdmin, canManage } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [branchFilter, setBranchFilter] = useState('');
  const [qualFilter, setQualFilter] = useState('');

  const formModal = useModal();
  const profileModal = useModal();

  const canManageTeam = isAdmin || canManage || isHrAdmin;

  // All non-admin users (team members)
  const allMembers = useMemo(() => users.filter(u => u.role !== 'admin'), [users]);

  // Extract unique branches & qualifications for filter dropdowns
  const branches = useMemo(() => {
    const set = new Set();
    allMembers.forEach(u => { if (u.branch) set.add(u.branch); });
    return [...set].sort();
  }, [allMembers]);

  const qualifications = useMemo(() => {
    const set = new Set();
    allMembers.forEach(u => { if (u.qualification) set.add(u.qualification); });
    return [...set].sort();
  }, [allMembers]);

  // Build member stats
  const memberStats = useMemo(() => {
    const map = {};
    allMembers.forEach(u => {
      const ma = assignments.filter(a => a.memberId === u.id);
      const total = ma.length;
      const pending = ma.filter(a => a.status === 'Pending').length;
      const completed = ma.filter(a => a.status === 'Completed').length;
      const overdue = ma.filter(a => isOverdue(a)).length;
      const rate = total ? Math.round(completed / total * 100) : 0;
      map[u.id] = { total, pending, completed, overdue, rate };
    });
    return map;
  }, [allMembers, assignments]);

  // Filter & sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = allMembers.filter(u => {
      if (q && !u.name.toLowerCase().includes(q) && !(u.designation || '').toLowerCase().includes(q) && !(u.branch || '').toLowerCase().includes(q)) return false;
      if (branchFilter && u.branch !== branchFilter) return false;
      if (qualFilter && u.qualification !== qualFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'tasks') return (memberStats[b.id]?.total || 0) - (memberStats[a.id]?.total || 0);
      if (sort === 'pending') return (memberStats[b.id]?.pending || 0) - (memberStats[a.id]?.pending || 0);
      if (sort === 'joining') return (a.joiningDate || '').localeCompare(b.joiningDate || '');
      return 0;
    });

    return list;
  }, [allMembers, search, sort, branchFilter, qualFilter, memberStats]);

  const handleSaved = (result, isEdit) => {
    if (isEdit) {
      setUsers(prev => prev.map(u => u.id === result.id ? { ...u, ...result } : u));
    } else {
      setUsers(prev => [...prev, result]);
    }
  };

  const handleDelete = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleEditFromProfile = (member) => {
    profileModal.close();
    setTimeout(() => formModal.open(member), 200);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} of {allMembers.length} employees
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search team..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 pl-9 pr-4 w-48 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {/* Branch filter */}
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {/* Qualification filter */}
          <select
            value={qualFilter}
            onChange={e => setQualFilter(e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
          >
            <option value="">All Qualifications</option>
            {qualifications.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          {/* Sort */}
          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="h-10 pl-8 pr-8 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* Add button */}
          {canManageTeam && (
            <button
              onClick={() => formModal.open(null)}
              className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> Add Member
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} className="text-gray-300 mx-auto" />}
          title={search || branchFilter || qualFilter ? 'No employees match filter' : 'No team members yet'}
          description="Add your first team member to get started"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((u, i) => {
              const stats = memberStats[u.id] || { total: 0, pending: 0, completed: 0, overdue: 0, rate: 0 };
              const qs = QUAL_STYLE[u.qualification] || { bg: '#f3f4f6', text: '#374151' };

              return (
                <motion.div
                  key={u.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  layout
                  whileHover={{ y: -3, boxShadow: '0 12px 28px -6px rgba(0,0,0,0.1)' }}
                  onClick={() => profileModal.open(u)}
                  className="group relative bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer transition-shadow"
                >
                  {/* Top row: avatar + info + progress circle */}
                  <div className="flex items-start gap-3.5 mb-4">
                    <Avatar name={u.name} size={52} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate">{u.name}</h3>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{u.designation || 'Team Member'}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: qs.bg, color: qs.text }}
                        >
                          {u.qualification || '\u2014'}
                        </span>
                        {u.branch && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">
                            {u.branch}
                          </span>
                        )}
                      </div>
                    </div>
                    <MiniProgressCircle pct={stats.rate} />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs">
                      <ClipboardList size={13} className="text-blue-500" />
                      <span className="font-bold text-gray-700">{stats.total}</span>
                      <span className="text-gray-400">tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Clock size={13} className="text-amber-500" />
                      <span className="font-bold text-gray-700">{stats.pending}</span>
                      <span className="text-gray-400">pending</span>
                    </div>
                    {stats.overdue > 0 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <AlertTriangle size={13} className="text-red-500" />
                        <span className="font-bold text-red-600">{stats.overdue}</span>
                        <span className="text-red-400">overdue</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom row: contact + joined */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                    <div className="flex items-center gap-2">
                      {u.email && (
                        <div
                          title={u.email}
                          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Mail size={12} />
                        </div>
                      )}
                      {u.mobile && (
                        <div
                          title={u.mobile}
                          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <Phone size={12} />
                        </div>
                      )}
                    </div>
                    {u.joiningDate && (
                      <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                        <Calendar size={10} /> Joined {fmt(u.joiningDate)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modals */}
      <UserForm
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        user={formModal.data}
        onSaved={handleSaved}
      />
      <MemberProfile
        isOpen={profileModal.isOpen}
        onClose={profileModal.close}
        member={profileModal.data}
        onEdit={handleEditFromProfile}
        onDelete={handleDelete}
      />
    </div>
  );
}
