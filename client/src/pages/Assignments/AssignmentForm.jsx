import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronDown, X, Loader2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { WORK_TYPES } from '../../utils/constants';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';

const PRIORITIES = [
  { value: 'Normal', color: '#6b7280', bg: '#f3f4f6' },
  { value: 'High', color: '#d97706', bg: '#fef3c7' },
  { value: 'Urgent', color: '#dc2626', bg: '#fee2e2' },
];

export default function AssignmentForm({ isOpen, onClose, editId }) {
  const { assignments, clients, users } = useData();
  const { isAdmin } = useAuth();
  const showToast = useToast();

  const isEdit = !!editId;
  const editAssignment = isEdit ? assignments.find((a) => a.id === editId) : null;

  // Form state
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [singleClient, setSingleClient] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [reportingTo, setReportingTo] = useState('');
  const [workType, setWorkType] = useState('');
  const [customWorkType, setCustomWorkType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Dropdown open states
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const clientDropdownRef = useRef(null);
  const memberDropdownRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) {
        setClientDropdownOpen(false);
      }
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target)) {
        setMemberDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset form when opening
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && editAssignment) {
      setSingleClient(editAssignment.clientId || '');
      setSelectedClients(new Set());
      setMemberId(editAssignment.memberId || '');
      setReportingTo(editAssignment.reportingPersonId || '');
      setDueDate(editAssignment.dueDate || '');
      setPriority(editAssignment.priority || 'Normal');
      setNotes(editAssignment.notes || '');
      // Check if work type is in WORK_TYPES
      if (WORK_TYPES.includes(editAssignment.workType)) {
        setWorkType(editAssignment.workType);
        setCustomWorkType('');
      } else {
        setWorkType('__manual__');
        setCustomWorkType(editAssignment.workType || '');
      }
    } else {
      setSelectedClients(new Set());
      setSingleClient('');
      setMemberId('');
      setReportingTo('');
      setWorkType('');
      setCustomWorkType('');
      setDueDate('');
      setPriority('Normal');
      setNotes('');
    }
    setClientSearch('');
    setMemberSearch('');
    setClientDropdownOpen(false);
    setMemberDropdownOpen(false);
  }, [isOpen, isEdit, editAssignment]);

  // Filtered clients for dropdown
  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    return clients
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.pan || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, clientSearch]);

  // Members for dropdown
  const membersList = useMemo(
    () => users
      .filter((u) => u.role === 'member')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return membersList.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || (m.designation || '').toLowerCase().includes(q),
    );
  }, [membersList, memberSearch]);

  // Selected member/client for display
  const selectedMember = membersList.find((m) => m.id === memberId);
  const selectedClientObj = clients.find((c) => c.id === singleClient);

  // Toggle client in multi-select
  const toggleClient = (id) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!memberId) { showToast('Select a team member', 'error'); return; }
    const finalWorkType = workType === '__manual__' ? customWorkType.trim() : workType;
    if (!finalWorkType) { showToast('Select or enter a work type', 'error'); return; }

    const member = membersList.find((u) => u.id === memberId);
    const repUser = membersList.find((u) => u.id === reportingTo);

    const baseData = {
      memberId,
      memberName: member?.name || '',
      reportingPersonId: reportingTo || null,
      reportingPersonName: repUser?.name || null,
      workType: finalWorkType,
      priority,
      dueDate,
      notes,
    };

    setSaving(true);
    try {
      if (isEdit) {
        if (!singleClient) { showToast('Select a client', 'error'); setSaving(false); return; }
        await api('PUT', `/assignments/${editId}`, { ...baseData, clientId: singleClient });
        showToast('Assignment updated');
      } else {
        const clientIds = [...selectedClients];
        if (!clientIds.length) { showToast('Select at least one client', 'error'); setSaving(false); return; }
        let created = 0;
        for (const clientId of clientIds) {
          await api('POST', '/assignments', { ...baseData, clientId });
          created++;
        }
        showToast(`${created} assignment${created > 1 ? 's' : ''} created`);
      }
      onClose(true);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title={isEdit ? 'Edit Assignment' : 'New Assignment'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Client selection */}
        {isEdit ? (
          /* Single client dropdown for edit mode */
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Client
            </label>
            <div className="relative" ref={clientDropdownRef}>
              <button
                type="button"
                onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white hover:border-gray-300 transition-colors text-left"
              >
                {selectedClientObj ? (
                  <div className="flex items-center gap-2">
                    <Avatar name={selectedClientObj.name} size={24} />
                    <span className="font-medium text-gray-900">{selectedClientObj.name}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">Select Client</span>
                )}
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
              </button>
              {clientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Search clients..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSingleClient(c.id); setClientDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-blue-50 transition-colors ${singleClient === c.id ? 'bg-blue-50' : ''}`}
                      >
                        <Avatar name={c.name} size={28} />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{c.name}</div>
                          {c.pan && <div className="text-[10px] text-gray-400">{c.pan}</div>}
                        </div>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-400">No clients found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Multi-client selection for create mode */
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Clients ({selectedClients.size} selected)
            </label>
            <div className="relative" ref={clientDropdownRef}>
              <button
                type="button"
                onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white hover:border-gray-300 transition-colors text-left"
              >
                {selectedClients.size > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-w-full">
                    {[...selectedClients].slice(0, 3).map((id) => {
                      const c = clients.find((cl) => cl.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                          {c?.name || '?'}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleClient(id); }}
                            className="hover:text-red-500"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                    {selectedClients.size > 3 && (
                      <span className="text-xs text-gray-400 self-center">+{selectedClients.size - 3} more</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">Select Clients</span>
                )}
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
              </button>
              {clientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Search clients..."
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredClients.map((c) => {
                      const isChecked = selectedClients.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleClient(c.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-blue-50 transition-colors ${isChecked ? 'bg-blue-50' : ''}`}
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                          >
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <Avatar name={c.name} size={28} />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{c.name}</div>
                            {c.pan && <div className="text-[10px] text-gray-400">{c.pan}</div>}
                          </div>
                        </button>
                      );
                    })}
                    {filteredClients.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-400">No clients found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Work Type */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Work Type
          </label>
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select Work Type</option>
            {WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>{wt}</option>
            ))}
            <option value="__manual__">Other (type manually)</option>
          </select>
          {workType === '__manual__' && (
            <input
              type="text"
              value={customWorkType}
              onChange={(e) => setCustomWorkType(e.target.value)}
              placeholder="Enter custom work type..."
              className="w-full mt-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Assigned To */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Assigned To
          </label>
          <div className="relative" ref={memberDropdownRef}>
            <button
              type="button"
              onClick={() => setMemberDropdownOpen(!memberDropdownOpen)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white hover:border-gray-300 transition-colors text-left"
            >
              {selectedMember ? (
                <div className="flex items-center gap-2">
                  <Avatar name={selectedMember.name} size={24} />
                  <div>
                    <span className="font-medium text-gray-900">{selectedMember.name}</span>
                    {selectedMember.designation && (
                      <span className="text-gray-400 ml-1 text-xs">({selectedMember.designation})</span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-gray-400">Select Team Member</span>
              )}
              <ChevronDown size={16} className="text-gray-400 shrink-0" />
            </button>
            {memberDropdownOpen && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members..."
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setMemberId(m.id); setMemberDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-blue-50 transition-colors ${memberId === m.id ? 'bg-blue-50' : ''}`}
                    >
                      <Avatar name={m.name} size={28} />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{m.name}</div>
                        {m.designation && <div className="text-[10px] text-gray-400">{m.designation}</div>}
                      </div>
                    </button>
                  ))}
                  {filteredMembers.length === 0 && (
                    <div className="p-4 text-center text-sm text-gray-400">No members found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reporting To */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Reporting To (optional)
          </label>
          <select
            value={reportingTo}
            onChange={(e) => setReportingTo(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">No Reporting Person</option>
            {membersList.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Priority
          </label>
          <div className="flex gap-3">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  priority === p.value
                    ? 'shadow-sm'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}
                style={
                  priority === p.value
                    ? { background: p.bg, color: p.color, borderColor: p.color }
                    : undefined
                }
              >
                {p.value}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any notes..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Saving...' : isEdit ? 'Update Assignment' : 'Create Assignment'}
        </button>
      </form>
    </Modal>
  );
}
