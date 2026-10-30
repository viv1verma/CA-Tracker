import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { api } from '../../api/client';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import ClientForm from './ClientForm';
import ClientProfile from './ClientProfile';
import {
  Search, Plus, ArrowUpDown, Pencil, Trash2,
  ClipboardList, Clock, CheckCircle, Building2,
  Users, Loader2,
} from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'pending', label: 'Pending' },
];

const TYPE_COLORS = {
  Individual: { bg: '#dbeafe', text: '#1e40af' },
  Company:    { bg: '#dcfce7', text: '#15803d' },
  LLP:        { bg: '#fef3c7', text: '#92400e' },
  Partnership:{ bg: '#ede9fe', text: '#7c3aed' },
  HUF:        { bg: '#fce7f3', text: '#be185d' },
  Trust:      { bg: '#ccfbf1', text: '#0f766e' },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 },
  }),
};

export default function Clients() {
  const { clients, assignments, setClients, loading } = useData();
  const { canManage } = useAuth();
  const showToast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');

  const formModal = useModal();
  const profileModal = useModal();

  // Build stats map for each client
  const clientStats = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      const ca = assignments.filter(a => a.clientId === c.id);
      map[c.id] = {
        total: ca.length,
        pending: ca.filter(a => a.status === 'Pending').length,
        completed: ca.filter(a => a.status === 'Completed').length,
      };
    });
    return map;
  }, [clients, assignments]);

  // Filter & sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = clients.filter(c =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.pan || '').toLowerCase().includes(q) ||
      (c.gstin || c.gst || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q)
    );

    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'type') return (a.type || '').localeCompare(b.type || '');
      if (sort === 'tasks') return (clientStats[b.id]?.total || 0) - (clientStats[a.id]?.total || 0);
      if (sort === 'pending') return (clientStats[b.id]?.pending || 0) - (clientStats[a.id]?.pending || 0);
      return 0;
    });

    return list;
  }, [clients, search, sort, clientStats]);

  const handleSaved = (result, isEdit) => {
    if (isEdit) {
      setClients(prev => prev.map(c => c.id === result.id ? { ...c, ...result } : c));
    } else {
      setClients(prev => [...prev, result]);
    }
  };

  const handleDelete = (id) => {
    setClients(prev => prev.filter(c => c.id !== id));
  };

  const handleEditFromProfile = (client) => {
    profileModal.close();
    setTimeout(() => formModal.open(client), 200);
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
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} {search ? 'results' : `client${clients.length !== 1 ? 's' : ''}`}
            {search && ` of ${clients.length}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 pl-9 pr-4 w-56 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
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
          {canManage && (
            <button
              onClick={() => formModal.open(null)}
              className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> Add Client
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} className="text-gray-300 mx-auto" />}
          title={search ? 'No clients found' : 'No clients yet'}
          description={search ? 'Try a different search term' : 'Add your first client to get started'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((c, i) => {
              const stats = clientStats[c.id] || { total: 0, pending: 0, completed: 0 };
              const tc = TYPE_COLORS[c.type] || TYPE_COLORS.Individual;

              return (
                <motion.div
                  key={c.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  layout
                  whileHover={{ y: -3, boxShadow: '0 12px 28px -6px rgba(0,0,0,0.1)' }}
                  onClick={() => profileModal.open(c)}
                  className="group relative bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer transition-shadow"
                >
                  {/* Edit/Delete on hover */}
                  {canManage && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <button
                        onClick={e => { e.stopPropagation(); formModal.open(c); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete "${c.name}"?`)) return;
                          try {
                            await api('DELETE', `/clients/${c.id}`);
                            handleDelete(c.id);
                            showToast('Client deleted');
                          } catch (err) {
                            showToast(err.message || 'Error', 'error');
                          }
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  )}

                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <Avatar name={c.name} size={48} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate">{c.name}</h3>
                      {c.pan && (
                        <p className="text-xs text-gray-400 font-mono font-semibold mt-0.5">{c.pan}</p>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: tc.bg, color: tc.text }}
                    >
                      {c.type || 'Individual'}
                    </span>
                    {c.address && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 max-w-[140px] truncate">
                        {c.address}
                      </span>
                    )}
                  </div>

                  {/* Mini stats row */}
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
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle size={13} className="text-emerald-500" />
                      <span className="font-bold text-gray-700">{stats.completed}</span>
                      <span className="text-gray-400">done</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modals */}
      <ClientForm
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        client={formModal.data}
        onSaved={handleSaved}
      />
      <ClientProfile
        isOpen={profileModal.isOpen}
        onClose={profileModal.close}
        client={profileModal.data}
        onEdit={handleEditFromProfile}
        onDelete={handleDelete}
      />
    </div>
  );
}
