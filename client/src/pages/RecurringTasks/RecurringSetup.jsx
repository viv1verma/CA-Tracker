import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit2, Trash2, Play, Pause, Zap, Search, X,
  RefreshCw, CalendarClock,
} from 'lucide-react';
import { api } from '../../api/client';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { WORK_TYPES } from '../../utils/constants';
import { freqLabel } from '../../utils/format';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';

const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annually'];
const PRIORITIES = ['Low', 'Medium', 'High'];

const FREQ_COLORS = {
  Monthly: 'bg-blue-100 text-blue-700',
  Quarterly: 'bg-violet-100 text-violet-700',
  'Half-Yearly': 'bg-amber-100 text-amber-700',
  Annually: 'bg-emerald-100 text-emerald-700',
};

const EMPTY_FORM = {
  clientId: '',
  workType: '',
  memberId: '',
  reportingTo: '',
  frequency: 'Monthly',
  dueDay: 10,
  priority: 'Medium',
  notes: '',
};

export default function RecurringSetup() {
  const { recurringTemplates, clients, users, refresh } = useData();
  const { isAdmin } = useAuth();
  const showToast = useToast();
  const formModal = useModal();
  const deleteModal = useModal();

  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);

  const members = useMemo(
    () => users.filter(u => u.role === 'member' || u.role === 'admin').sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map(c => [c.id, c])),
    [clients],
  );

  const memberMap = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u])),
    [users],
  );

  const filtered = useMemo(() => {
    if (!search) return recurringTemplates;
    const q = search.toLowerCase();
    return recurringTemplates.filter(t => {
      const cName = clientMap[t.clientId]?.name || '';
      return (
        cName.toLowerCase().includes(q) ||
        (t.workType || '').toLowerCase().includes(q) ||
        (memberMap[t.memberId]?.name || '').toLowerCase().includes(q)
      );
    });
  }, [recurringTemplates, search, clientMap, memberMap]);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    formModal.open();
  }, [formModal]);

  const openEdit = useCallback((template) => {
    setForm({
      clientId: template.clientId || '',
      workType: template.workType || '',
      memberId: template.memberId || '',
      reportingTo: template.reportingPersonId || template.reportingTo || '',
      frequency: template.frequency || 'Monthly',
      dueDay: template.dueDayOfMonth || template.dueDay || 10,
      priority: template.priority || 'Normal',
      notes: template.notes || '',
    });
    formModal.open(template);
  }, [formModal]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.clientId || !form.workType || !form.memberId) {
      showToast('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      // Map form fields to backend field names
      const member = memberMap[form.memberId];
      const reporter = form.reportingTo ? memberMap[form.reportingTo] : null;
      const payload = {
        clientId: form.clientId,
        workType: form.workType,
        memberId: form.memberId,
        memberName: member?.name || '',
        reportingPersonId: form.reportingTo || null,
        reportingPersonName: reporter?.name || null,
        frequency: form.frequency,
        dueDayOfMonth: parseInt(form.dueDay) || 10,
        priority: form.priority || 'Normal',
        notes: form.notes || '',
        active: true,
      };
      if (formModal.data) {
        await api('PUT', `/recurring-templates/${formModal.data.id}`, payload);
        showToast('Template updated');
      } else {
        await api('POST', '/recurring-templates', payload);
        showToast('Template created');
      }
      await refresh();
      formModal.close();
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, formModal, refresh, showToast, memberMap]);

  const handleDelete = useCallback(async () => {
    if (!deleteModal.data) return;
    setDeleting(true);
    try {
      await api('DELETE', `/recurring-templates/${deleteModal.data.id}`);
      showToast('Template deleted');
      await refresh();
      deleteModal.close();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteModal, refresh, showToast]);

  const toggleStatus = useCallback(async (template) => {
    try {
      const newActive = template.active === false ? true : false;
      await api('PUT', `/recurring-templates/${template.id}`, { active: newActive });
      showToast(`Template ${newActive ? 'activated' : 'paused'}`);
      await refresh();
    } catch (e) {
      showToast(e.message || 'Update failed', 'error');
    }
  }, [refresh, showToast]);

  const generateNow = useCallback(async (templateId) => {
    setGenerating(templateId);
    try {
      await api('POST', `/recurring-templates/${templateId}/generate`);
      showToast('Task generated successfully');
      await refresh();
    } catch (e) {
      showToast(e.message || 'Generation failed', 'error');
    } finally {
      setGenerating(null);
    }
  }, [refresh, showToast]);

  const bulkGenerate = useCallback(async () => {
    setBulkGenerating(true);
    try {
      const activeTemplates = recurringTemplates.filter(t => t.active !== false);
      await Promise.all(
        activeTemplates.map(t => api('POST', `/recurring-templates/${t.id}/generate`))
      );
      showToast(`Generated tasks for ${activeTemplates.length} templates`);
      await refresh();
    } catch (e) {
      showToast(e.message || 'Bulk generation failed', 'error');
    } finally {
      setBulkGenerating(false);
    }
  }, [recurringTemplates, refresh, showToast]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={bulkGenerate}
            disabled={bulkGenerating}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            <Zap size={16} />
            {bulkGenerating ? 'Generating...' : 'Generate All Active'}
          </button>
          {isAdmin && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} />
              Add Template
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
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Work Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned To</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Frequency</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Due Day</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {filtered.map((t, idx) => {
                  const client = clientMap[t.clientId];
                  const member = memberMap[t.memberId];
                  const isActive = t.active !== false;
                  return (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={`${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'} hover:bg-blue-50/40 transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={client?.name || '?'} size={30} />
                          <span className="font-semibold text-gray-900 truncate max-w-[160px]">
                            {client?.name || '--'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.workType}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={member?.name || '?'} size={24} />
                          <span className="text-gray-700 text-sm">{member?.name || '--'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${FREQ_COLORS[t.frequency] || 'bg-gray-100 text-gray-600'}`}>
                          {freqLabel(t.frequency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 font-medium">
                        {t.dueDay || '--'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleStatus(t)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {isActive ? <Play size={12} /> : <Pause size={12} />}
                          {isActive ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => generateNow(t.id)}
                            disabled={generating === t.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                            title="Generate Now"
                          >
                            {generating === t.id ? (
                              <RefreshCw size={14} className="animate-spin" />
                            ) : (
                              <Zap size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteModal.open(t)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
              icon={<CalendarClock size={48} className="text-gray-300 mx-auto" />}
              title={search ? 'No matching templates' : 'No recurring templates'}
              description={search ? 'Try a different search term.' : 'Click "Add Template" to create your first recurring task template.'}
            />
          </div>
        )}
      </div>

      {/* Template Form Modal */}
      <Modal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        title={formModal.data ? 'Edit Template' : 'Add Recurring Template'}
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Client *</label>
              <select
                value={form.clientId}
                onChange={e => updateField('clientId', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Select client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Work Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Work Type *</label>
              <select
                value={form.workType}
                onChange={e => updateField('workType', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Select work type...</option>
                {WORK_TYPES.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned To *</label>
              <select
                value={form.memberId}
                onChange={e => updateField('memberId', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Select member...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Reporting To */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Reporting Person</label>
              <select
                value={form.reportingTo}
                onChange={e => updateField('reportingTo', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Select person...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Frequency *</label>
              <select
                value={form.frequency}
                onChange={e => updateField('frequency', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {FREQUENCIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Due Day */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Due Day of Month</label>
              <input
                type="number"
                min={1}
                max={28}
                value={form.dueDay}
                onChange={e => updateField('dueDay', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => updateField('priority', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
              placeholder="Optional notes about this recurring task..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={formModal.close}
              className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : formModal.data ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={handleDelete}
        title="Delete Template"
        message="This recurring template will be permanently deleted. Existing generated tasks will not be affected."
        confirmText="Delete"
        confirmColor="red"
        loading={deleting}
      />
    </motion.div>
  );
}
