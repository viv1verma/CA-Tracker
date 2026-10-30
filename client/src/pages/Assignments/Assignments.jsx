import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Edit2, Trash2, ChevronUp, ChevronDown,
  ClipboardList, Filter, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { STATUS_OPTIONS, STATUS_COLORS } from '../../utils/constants';
import { isOverdue } from '../../utils/helpers';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import ProgressBar from '../../components/ui/ProgressBar';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import AssignmentForm from './AssignmentForm';
import AssignmentDetail from './AssignmentDetail';

const FILTER_TABS = ['All', ...STATUS_OPTIONS, 'Overdue'];

const TAB_COLORS = {
  All: '#3b82f6',
  Pending: '#d97706',
  'In Progress': '#2563eb',
  'Under Review': '#7c3aed',
  Completed: '#16a34a',
  'On Hold': '#6b7280',
  Overdue: '#dc2626',
};

export default function Assignments() {
  const { assignments, clients, users, refresh } = useData();
  const { isAdmin, user } = useAuth();
  const showToast = useToast();

  // Filters
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [sortField, setSortField] = useState('dueDate');
  const [sortDir, setSortDir] = useState('asc');

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c])),
    [clients],
  );

  // Filter + sort assignments
  const filtered = useMemo(() => {
    let list = assignments.filter((a) => a.assignmentType !== 'recurring');

    // Tab filter
    if (activeTab === 'Overdue') {
      list = list.filter((a) => isOverdue(a));
    } else if (activeTab !== 'All') {
      list = list.filter((a) => a.status === activeTab);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const clientName = clientMap[a.clientId]?.name || '';
        return (
          clientName.toLowerCase().includes(q) ||
          (a.workType || '').toLowerCase().includes(q) ||
          (a.memberName || '').toLowerCase().includes(q)
        );
      });
    }

    // Member filter
    if (memberFilter) {
      list = list.filter((a) => a.memberId === memberFilter);
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'client') {
        cmp = (clientMap[a.clientId]?.name || '').localeCompare(
          clientMap[b.clientId]?.name || '',
        );
      } else if (sortField === 'workType') {
        cmp = (a.workType || '').localeCompare(b.workType || '');
      } else if (sortField === 'member') {
        cmp = (a.memberName || '').localeCompare(b.memberName || '');
      } else if (sortField === 'dueDate') {
        cmp = (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      } else if (sortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      } else if (sortField === 'progress') {
        cmp = (a.completionPct || 0) - (b.completionPct || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [assignments, activeTab, search, memberFilter, sortField, sortDir, clientMap]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const nonRecurring = assignments.filter((a) => a.assignmentType !== 'recurring');
    const counts = { All: nonRecurring.length, Overdue: 0 };
    STATUS_OPTIONS.forEach((s) => { counts[s] = 0; });
    nonRecurring.forEach((a) => {
      if (a.status && counts[a.status] !== undefined) counts[a.status]++;
      if (isOverdue(a)) counts.Overdue++;
    });
    return counts;
  }, [assignments]);

  // Members (for filter dropdown)
  const members = useMemo(
    () => users.filter((u) => u.role === 'member').sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  // Column sort handler
  const handleSort = useCallback(
    (field) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  // Selection handlers
  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((a) => a.id)),
    );
  }, [filtered]);

  // Delete single
  const handleDelete = useCallback(
    async (id) => {
      setDeleting(true);
      try {
        await api('DELETE', `/assignments/${id}`);
        await refresh();
        showToast('Assignment deleted');
        setDeleteConfirm(null);
        setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      } catch (e) {
        showToast(e.message || 'Delete failed', 'error');
      } finally {
        setDeleting(false);
      }
    },
    [refresh, showToast],
  );

  // Bulk delete
  const handleBulkDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const ids = [...selected];
      await api('POST', '/assignments/bulk-delete', { ids });
      await refresh();
      showToast(`${ids.length} assignment${ids.length > 1 ? 's' : ''} deleted`);
      setSelected(new Set());
      setBulkDeleteConfirm(false);
    } catch (e) {
      showToast(e.message || 'Bulk delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }, [selected, refresh, showToast]);

  // Open edit
  const openEdit = useCallback((id) => {
    setEditId(id);
    setFormOpen(true);
  }, []);

  // Open new
  const openNew = useCallback(() => {
    setEditId(null);
    setFormOpen(true);
  }, []);

  // Close form and refresh
  const closeForm = useCallback(
    (didSave) => {
      setFormOpen(false);
      setEditId(null);
      if (didSave) refresh();
    },
    [refresh],
  );

  // Format date display
  const fmtDate = (d) => {
    if (!d) return '--';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Sort icon component
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={12} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-600" />
      : <ChevronDown size={12} className="text-blue-600" />;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} assignment{filtered.length !== 1 ? 's' : ''}
            {activeTab !== 'All' ? ` (${activeTab})` : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            New Assignment
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const color = TAB_COLORS[tab];
          const count = tabCounts[tab] || 0;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelected(new Set()); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
              style={
                isActive
                  ? { background: color, color: '#fff', borderColor: color }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
              }
            >
              {tab}
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1"
                style={
                  isActive
                    ? { background: 'rgba(255,255,255,0.3)', color: '#fff' }
                    : { background: '#f3f4f6', color: '#6b7280' }
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + member filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, work type, member..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isAdmin && members.length > 0 && (
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="pl-8 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {isAdmin && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                )}
                {[
                  { key: 'client', label: 'Client' },
                  { key: 'workType', label: 'Work Type' },
                  { key: 'member', label: 'Assigned To' },
                  { key: 'dueDate', label: 'Due Date' },
                  { key: 'status', label: 'Status' },
                  { key: 'progress', label: 'Progress' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                ))}
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((a, idx) => {
                const client = clientMap[a.clientId];
                const od = isOverdue(a);
                const isSelected = selected.has(a.id);

                return (
                  <motion.tr
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setDetailId(a.id)}
                    className={`
                      cursor-pointer transition-colors group
                      ${od ? 'border-l-3 border-l-red-400' : ''}
                      ${isSelected ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}
                      hover:bg-blue-50/60
                    `}
                    style={od ? { borderLeft: '3px solid #f87171' } : undefined}
                  >
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(a.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}

                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={client?.name || '?'} size={32} />
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate max-w-[160px]">
                            {client?.name || '--'}
                          </div>
                          {client?.pan && (
                            <div className="text-[10px] text-gray-400">{client.pan}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Work Type */}
                    <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">
                      {a.workType}
                    </td>

                    {/* Assigned To */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={a.memberName || '?'} size={24} />
                        <span className="text-gray-700 font-medium truncate max-w-[100px]">
                          {a.memberName || '--'}
                        </span>
                      </div>
                    </td>

                    {/* Due Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={od ? 'text-red-600 font-bold' : 'text-gray-600'}>
                        {fmtDate(a.dueDate)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge status={od ? 'Overdue' : a.status} />
                    </td>

                    {/* Progress */}
                    <td className="px-4 py-3 min-w-[120px]">
                      <ProgressBar value={a.completionPct || 0} />
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(a.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(a.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="py-16">
            <EmptyState
              icon={<ClipboardList size={48} className="text-gray-300 mx-auto" />}
              title={search || memberFilter || activeTab !== 'All' ? 'No matching assignments' : 'No assignments yet'}
              description={
                search || memberFilter || activeTab !== 'All'
                  ? 'Try adjusting your filters or search term.'
                  : isAdmin
                    ? 'Click "New Assignment" to create one.'
                    : 'Assignments will appear here when created.'
              }
            />
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && isAdmin && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4"
          >
            <span className="text-sm font-semibold">
              {selected.size} selected
            </span>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assignment Form Modal */}
      <AssignmentForm
        isOpen={formOpen}
        onClose={closeForm}
        editId={editId}
      />

      {/* Assignment Detail Modal */}
      <AssignmentDetail
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        assignmentId={detailId}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="Delete Assignment"
        message="This assignment will be permanently deleted. This cannot be undone."
        confirmText="Delete"
        confirmColor="red"
        loading={deleting}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Delete Selected Assignments"
        message={`${selected.size} assignment${selected.size > 1 ? 's' : ''} will be permanently deleted.`}
        confirmText={`Delete ${selected.size}`}
        confirmColor="red"
        loading={deleting}
      />
    </div>
  );
}
