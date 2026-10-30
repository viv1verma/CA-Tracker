import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { useData } from '../../context/DataContext';
import { fmtAny } from '../../utils/format';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import LeadForm from './LeadForm';
import TenderDetail from './TenderDetail';
import {
  Plus, Search, ArrowUpDown, Briefcase, Building2,
  TrendingUp, Download, Calendar, DollarSign,
  AlertTriangle, ChevronRight, Loader2, Filter,
} from 'lucide-react';

/* ---------- Lead constants ---------- */

const LEAD_STATUSES = [
  'Generated POC', 'Contacted POC', 'Fixed Meeting with POC',
  'Met with POC', 'Got the Assignment', 'Lost the Assignment',
];

const LEAD_STATUS_COLORS = {
  'Generated POC':          { bg: '#f1f5f9', text: '#475569' },
  'Contacted POC':          { bg: '#dbeafe', text: '#1e40af' },
  'Fixed Meeting with POC': { bg: '#fef3c7', text: '#92400e' },
  'Met with POC':           { bg: '#e0e7ff', text: '#4338ca' },
  'Got the Assignment':     { bg: '#dcfce7', text: '#15803d' },
  'Lost the Assignment':    { bg: '#fee2e2', text: '#991b1b' },
};

/* ---------- Tender constants ---------- */

const TENDER_STATUS_COLORS = {
  'Identified':                 { bg: '#eef2ff', text: '#4338ca' },
  'Bid Submitted':              { bg: '#e0f2fe', text: '#0369a1' },
  'Technical Evaluation':       { bg: '#fef9c3', text: '#854d0e' },
  'Financial Bid Opened':       { bg: '#f3e8ff', text: '#7e22ce' },
  'Under Evaluation':           { bg: '#ffedd5', text: '#c2410c' },
  'Awarded':                    { bg: '#dcfce7', text: '#15803d' },
  'Lost':                       { bg: '#fee2e2', text: '#b91c1c' },
  'Cancelled / Retendered':     { bg: '#f3f4f6', text: '#6b7280' },
};

const ELIG_COLORS = {
  'Eligible':      { bg: '#dcfce7', text: '#15803d' },
  'Not Eligible':  { bg: '#fee2e2', text: '#b91c1c' },
  'Needs Review':  { bg: '#fef3c7', text: '#92400e' },
};

function fmtMoney(v) {
  const n = Number(v) || 0;
  if (!n) return '\u2014';
  return '\u20B9' + n.toLocaleString('en-IN');
}

function StatusBadge({ status, colors }) {
  const c = colors[status] || { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

function tabCls({ selected }) {
  return `flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-colors outline-none ${
    selected
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
  }`;
}

/* ========== LEADS TAB ========== */

function LeadsTab() {
  const showToast = useToast();
  const leadFormModal = useModal();

  const [leads, setLeads] = useState([]);
  const [statuses, setStatuses] = useState(LEAD_STATUSES);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailLead, setDetailLead] = useState(null);

  const loadLeads = useCallback(async () => {
    try {
      const r = await api('GET', '/leads');
      setLeads(r.leads || []);
      if (r.statuses?.length) setStatuses(r.statuses);
    } catch (err) {
      showToast(err.message || 'Could not load leads', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return leads;
    return leads.filter(l => l.status === statusFilter);
  }, [leads, statusFilter]);

  // Count by status
  const counts = useMemo(() => {
    const c = {};
    statuses.forEach(s => c[s] = 0);
    leads.forEach(l => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [leads, statuses]);

  const handleLeadSaved = (result, isEdit) => {
    if (isEdit) {
      setLeads(prev => prev.map(l => l.id === result.id ? result : l));
    } else {
      setLeads(prev => [result, ...prev]);
    }
  };

  // Lead detail event handlers
  const handleAddLeadEvent = async (leadId, status, note) => {
    try {
      const updated = await api('POST', `/leads/${leadId}/event`, { status, note });
      setLeads(prev => prev.map(l => l.id === leadId ? updated : l));
      setDetailLead(updated);
      showToast('Event added');
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  };

  const handleDeleteLead = async (id) => {
    if (!window.confirm('Delete this lead and its entire trail?')) return;
    try {
      await api('DELETE', `/leads/${id}`);
      setLeads(prev => prev.filter(l => l.id !== id));
      setDetailLead(null);
      showToast('Lead deleted');
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={28} />
      </div>
    );
  }

  return (
    <div>
      {/* Stats row */}
      <div className="flex gap-3 overflow-x-auto pb-3 mb-5 -mx-1 px-1">
        <div className="min-w-[100px] bg-white border border-gray-200 rounded-xl p-3 text-center shrink-0">
          <div className="text-xl font-black text-blue-700">{leads.length}</div>
          <div className="text-[9px] font-bold text-gray-500 uppercase">Total Leads</div>
        </div>
        {statuses.map(s => {
          const c = LEAD_STATUS_COLORS[s] || { bg: '#f3f4f6', text: '#6b7280' };
          return (
            <div key={s} className="min-w-[110px] bg-white border border-gray-200 rounded-xl p-3 text-center shrink-0">
              <div className="text-xl font-black" style={{ color: c.text }}>{counts[s] || 0}</div>
              <div className="text-[9px] font-bold text-gray-500 uppercase whitespace-nowrap">{s}</div>
            </div>
          );
        })}
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-gray-200 rounded-lg text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button
          onClick={() => leadFormModal.open(null)}
          className="inline-flex items-center gap-2 h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={15} /> Add Lead
        </button>
      </div>

      {/* Leads table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={48} className="text-gray-300 mx-auto" />}
          title={statusFilter !== 'all' ? 'No leads with this status' : 'No leads yet'}
          description='Click "+ Add Lead" to add one'
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Lead Name</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Point of Contact</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Designation</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Latest Event</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const ev = (l.events || [])[(l.events || []).length - 1];
                return (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setDetailLead(l)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${i % 2 ? 'bg-gray-50/30' : ''}`}
                  >
                    <td className="px-4 py-3 font-bold text-blue-700">{l.name}</td>
                    <td className="px-4 py-3 text-gray-600">{l.poc || '\u2014'}</td>
                    <td className="px-4 py-3 text-gray-500">{l.pocDesignation || '\u2014'}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} colors={LEAD_STATUS_COLORS} /></td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {ev ? (
                        <div>
                          <p className="text-xs text-gray-700 truncate">{ev.note || `Moved to ${ev.status}`}</p>
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                            {ev.byName || ''} {ev.date ? '\u00B7 ' + fmtAny(ev.date) : ''}
                          </p>
                        </div>
                      ) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtAny(l.updatedAt || l.createdAt)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead detail modal */}
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          statuses={statuses}
          onClose={() => setDetailLead(null)}
          onEvent={handleAddLeadEvent}
          onDelete={handleDeleteLead}
          onEdit={(l) => { setDetailLead(null); setTimeout(() => leadFormModal.open(l), 200); }}
          onUpdated={(updated) => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            setDetailLead(updated);
          }}
        />
      )}

      <LeadForm
        isOpen={leadFormModal.isOpen}
        onClose={leadFormModal.close}
        lead={leadFormModal.data}
        onSaved={handleLeadSaved}
      />
    </div>
  );
}

/* ---- Lead Detail Modal (inline) ---- */

function LeadDetailModal({ lead, statuses, onClose, onUpdated, onEdit, onDelete }) {
  const showToast = useToast();
  const [eventStatus, setEventStatus] = useState(lead.status);
  const [eventNote, setEventNote] = useState('');
  const [adding, setAdding] = useState(false);

  const events = [...(lead.events || [])].reverse();

  const handleAdd = async () => {
    if (!eventNote.trim() && eventStatus === lead.status) {
      showToast('Add a note or change status', 'error');
      return;
    }
    setAdding(true);
    try {
      const updated = await api('POST', `/leads/${lead.id}/event`, { status: eventStatus, note: eventNote.trim() });
      onUpdated(updated);
      setEventNote('');
      setEventStatus(updated.status);
      showToast('Event added');
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDel = async () => {
    if (!window.confirm(`Delete lead "${lead.name}" and all events?`)) return;
    try {
      await api('DELETE', `/leads/${lead.id}`);
      showToast('Lead deleted');
      onDelete(lead.id);
      onClose();
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={lead.name} maxWidth="2xl">
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-gray-50 rounded-xl">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Point of Contact</p>
          <p className="text-sm font-semibold text-gray-800">{lead.poc || '\u2014'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Designation</p>
          <p className="text-sm font-semibold text-gray-800">{lead.pocDesignation || '\u2014'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Current Status</p>
          <StatusBadge status={lead.status} colors={LEAD_STATUS_COLORS} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase">Added By</p>
          <p className="text-sm font-semibold text-gray-800">{lead.createdByName || '\u2014'}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => onEdit(lead)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          Edit Lead
        </button>
        <button onClick={handleDel} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100">
          Delete Lead
        </button>
      </div>

      {/* Add event */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <h4 className="text-xs font-bold text-blue-700 uppercase mb-3">Add Event / Update Status</h4>
        <select
          value={eventStatus}
          onChange={e => setEventStatus(e.target.value)}
          className="w-full h-9 px-3 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
        >
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <textarea
          value={eventNote}
          onChange={e => setEventNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-2"
          placeholder="e.g. Met Mr. Sharma at their office, discussed audit scope"
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add to Trail
        </button>
      </div>

      {/* Timeline */}
      <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Trail of Events</h4>
      {events.length === 0 ? (
        <p className="text-center py-6 text-gray-400 text-sm">No events yet</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev, i) => {
            const c = LEAD_STATUS_COLORS[ev.status] || { bg: '#f3f4f6', text: '#6b7280' };
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-3"
              >
                <div className="flex flex-col items-center pt-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.text }} />
                  {i < events.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={ev.status} colors={LEAD_STATUS_COLORS} />
                    <span className="text-[10px] text-gray-400 font-medium">
                      {ev.date ? new Date(ev.date).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      }) : ''}
                    </span>
                    {ev.byName && <span className="text-[10px] text-gray-400">by {ev.byName}</span>}
                  </div>
                  {ev.note && <p className="text-sm text-gray-700 mt-1">{ev.note}</p>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ========== TENDERS TAB ========== */

function TendersTab() {
  const showToast = useToast();
  const { users } = useData();
  const { user: me } = useAuth();

  const [tenders, setTenders] = useState([]);
  const [tdStatuses, setTdStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [category, setCategory] = useState('psu_company');

  const tenderDetailModal = useModal();
  const tenderFormModal = useModal();

  const loadTenders = useCallback(async () => {
    try {
      const r = await api('GET', '/tenders');
      setTenders(r.tenders || []);
      if (r.statuses?.length) setTdStatuses(r.statuses);
    } catch (err) {
      showToast(err.message || 'Could not load tenders', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenders(); }, [loadTenders]);

  const filtered = useMemo(() => {
    let list = tenders.filter(t => t.category === category);
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    // Sort by due date (soonest first), overdue on top
    list.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    return list;
  }, [tenders, statusFilter, category]);

  const handleTenderUpdated = (updated) => {
    setTenders(prev => prev.map(t => t.id === updated.id ? updated : t));
    tenderDetailModal.open(updated);
  };

  const handleTenderDeleted = (id) => {
    setTenders(prev => prev.filter(t => t.id !== id));
  };

  // Tender form (add/edit) -- inline simple form
  const openAddTender = () => {
    tenderFormModal.open({ _isNew: true, category });
  };

  const openEditTender = (tender) => {
    tenderDetailModal.close();
    setTimeout(() => tenderFormModal.open(tender), 200);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={28} />
      </div>
    );
  }

  const isOpenStatus = (s) => s !== 'Awarded' && s !== 'Lost' && s !== 'Cancelled / Retendered';

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { value: 'psu_company', label: 'PSU Companies' },
          { value: 'psu_bank', label: 'PSU Banks' },
        ].map(c => (
          <button
            key={c.value}
            onClick={() => { setCategory(c.value); setStatusFilter('all'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              category === c.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filters + Add */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-gray-200 rounded-lg text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            {tdStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAddTender}
            className="inline-flex items-center gap-2 h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={15} /> Add Tender
          </button>
        </div>
      </div>

      {/* Tenders table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} className="text-gray-300 mx-auto" />}
          title="No tenders in this category"
          description='Click "+ Add Tender" to add one'
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-800 text-white">
                {['PSU Name', 'Nature of Work', 'Eligibility', 'Due Date', 'Tender Value', 'EMD', 'Partner', 'Status', 'Latest Remark'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const sc = TENDER_STATUS_COLORS[t.status] || { bg: '#f3f4f6', text: '#6b7280' };
                const ev = (t.eligibility && t.eligibility.verdict) || '';
                const ec = ELIG_COLORS[ev] || null;
                const lastEvt = (t.events || [])[(t.events || []).length - 1];

                // Due date styling
                let dueCls = 'text-gray-600';
                let dueTag = '';
                if (t.dueDate && isOpenStatus(t.status)) {
                  const d = new Date(t.dueDate + 'T00:00:00');
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const days = Math.round((d - today) / 86400000);
                  if (days < 0) { dueCls = 'text-red-600 font-bold'; dueTag = 'OVERDUE'; }
                  else if (days <= 7) { dueCls = 'text-amber-600 font-bold'; dueTag = `${days}d`; }
                }

                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => tenderDetailModal.open(t)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${i % 2 ? 'bg-gray-50/30' : ''}`}
                  >
                    <td className="px-3 py-2.5 font-bold text-blue-700">{t.psuName}</td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[150px] whitespace-normal text-xs">{t.natureOfWork || '\u2014'}</td>
                    <td className="px-3 py-2.5">
                      {ev && ec ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: ec.bg, color: ec.text }}>
                          {ev}
                        </span>
                      ) : <span className="text-gray-300">\u2014</span>}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap text-xs ${dueCls}`}>
                      {fmtAny(t.dueDate)}
                      {dueTag && <span className="ml-1 text-[9px] font-bold">{dueTag}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">{fmtMoney(t.tenderValue)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {fmtMoney(t.emdAmount)}
                      {t.emdStatus && <div className="text-[9px] text-gray-400 font-medium">{t.emdStatus}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">{t.partnerName || '\u2014'}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={t.status} colors={TENDER_STATUS_COLORS} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {lastEvt && lastEvt.note ? (
                        <div>
                          <p className="text-xs text-gray-700 truncate">{lastEvt.note}</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            {lastEvt.byName || ''} {lastEvt.date ? '\u00B7 ' + fmtAny(lastEvt.date) : ''}
                          </p>
                        </div>
                      ) : <span className="text-gray-300">\u2014</span>}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tender detail */}
      <TenderDetail
        isOpen={tenderDetailModal.isOpen}
        onClose={tenderDetailModal.close}
        tender={tenderDetailModal.data}
        statuses={tdStatuses}
        onUpdated={handleTenderUpdated}
        onEdit={openEditTender}
        onDelete={handleTenderDeleted}
      />

      {/* Tender form (add/edit) */}
      <TenderFormModal
        isOpen={tenderFormModal.isOpen}
        onClose={tenderFormModal.close}
        tender={tenderFormModal.data}
        statuses={tdStatuses}
        users={users}
        me={me}
        onSaved={(result, isEdit) => {
          if (isEdit) {
            setTenders(prev => prev.map(t => t.id === result.id ? result : t));
          } else {
            setTenders(prev => [result, ...prev]);
          }
        }}
      />
    </div>
  );
}

/* ---- Tender Add/Edit Form Modal ---- */

function TenderFormModal({ isOpen, onClose, tender, statuses, users, me, onSaved }) {
  const showToast = useToast();
  const isEdit = tender && !tender._isNew;

  const partners = useMemo(() => {
    const list = (users || []).filter(u => u.role === 'admin' || (u.designation || '').toLowerCase().includes('partner'));
    if (me && !list.some(p => p.id === me.id)) list.unshift(me);
    return list;
  }, [users, me]);

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tender) return;
    if (tender._isNew) {
      setForm({
        category: tender.category || 'psu_company',
        tenderRef: '', psuName: '', natureOfWork: '',
        applicationDate: new Date().toISOString().slice(0, 10),
        dueDate: '', tenderValue: '', quotationValue: '',
        emdAmount: '', emdStatus: '', source: '',
        tenderFee: '', bidOpeningDate: '', l1Value: '',
        partnerId: me?.id || '', partnerName: me?.name || '',
        status: 'Identified', note: '',
      });
    } else {
      setForm({
        category: tender.category || 'psu_company',
        tenderRef: tender.tenderRef || '',
        psuName: tender.psuName || '',
        natureOfWork: tender.natureOfWork || '',
        applicationDate: tender.applicationDate || '',
        dueDate: tender.dueDate || '',
        tenderValue: tender.tenderValue || '',
        quotationValue: tender.quotationValue || '',
        emdAmount: tender.emdAmount || '',
        emdStatus: tender.emdStatus || '',
        source: tender.source || '',
        tenderFee: tender.tenderFee || '',
        bidOpeningDate: tender.bidOpeningDate || '',
        l1Value: tender.l1Value || '',
        partnerId: tender.partnerId || '',
        partnerName: tender.partnerName || '',
        status: tender.status || 'Identified',
        note: '',
      });
    }
  }, [tender, me]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.psuName?.trim()) { showToast('PSU name is required', 'error'); return; }
    setSaving(true);
    try {
      const selPartner = partners.find(p => p.id === form.partnerId);
      const payload = {
        category: form.category,
        psuName: form.psuName.trim(),
        tenderRef: form.tenderRef.trim(),
        natureOfWork: form.natureOfWork.trim(),
        applicationDate: form.applicationDate,
        dueDate: form.dueDate,
        tenderValue: form.tenderValue,
        quotationValue: form.quotationValue,
        emdAmount: form.emdAmount,
        emdStatus: form.emdStatus,
        source: form.source.trim(),
        tenderFee: form.tenderFee,
        bidOpeningDate: form.bidOpeningDate,
        l1Value: form.l1Value,
        partnerId: form.partnerId,
        partnerName: selPartner?.name || '',
      };

      let result;
      if (isEdit) {
        result = await api('PUT', `/tenders/${tender.id}`, payload);
        showToast('Tender updated');
      } else {
        payload.status = form.status;
        payload.note = form.note?.trim() || '';
        result = await api('POST', '/tenders', payload);
        showToast('Tender added');
      }
      onSaved(result, isEdit);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Tender' : 'Add Tender'} maxWidth="2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>PSU Name *</label>
            <input type="text" value={form.psuName || ''} onChange={e => set('psuName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tender Ref</label>
            <input type="text" value={form.tenderRef || ''} onChange={e => set('tenderRef', e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Nature of Work</label>
            <input type="text" value={form.natureOfWork || ''} onChange={e => set('natureOfWork', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={form.category || 'psu_company'} onChange={e => set('category', e.target.value)} className={`${inputCls} bg-white`}>
              <option value="psu_company">PSU Company</option>
              <option value="psu_bank">PSU Bank</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Partner Following Up</label>
            <select value={form.partnerId || ''} onChange={e => set('partnerId', e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">Select Partner</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Application Date</label>
            <input type="date" value={form.applicationDate || ''} onChange={e => set('applicationDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="date" value={form.dueDate || ''} onChange={e => set('dueDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tender Value</label>
            <input type="number" value={form.tenderValue || ''} onChange={e => set('tenderValue', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Quotation Value</label>
            <input type="number" value={form.quotationValue || ''} onChange={e => set('quotationValue', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>EMD Amount</label>
            <input type="number" value={form.emdAmount || ''} onChange={e => set('emdAmount', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>EMD Status</label>
            <input type="text" value={form.emdStatus || ''} onChange={e => set('emdStatus', e.target.value)} className={inputCls} placeholder="e.g. Submitted / Refunded" />
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <input type="text" value={form.source || ''} onChange={e => set('source', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tender Fee</label>
            <input type="number" value={form.tenderFee || ''} onChange={e => set('tenderFee', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Bid Opening Date</label>
            <input type="date" value={form.bidOpeningDate || ''} onChange={e => set('bidOpeningDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>L1 Value</label>
            <input type="number" value={form.l1Value || ''} onChange={e => set('l1Value', e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Status + Note (new only) */}
        {!isEdit && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status || 'Identified'} onChange={e => set('status', e.target.value)} className={`${inputCls} bg-white`}>
                {(statuses || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Initial Note</label>
              <input type="text" value={form.note || ''} onChange={e => set('note', e.target.value)} className={inputCls} placeholder="Optional remark" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-sm">
            {saving ? 'Saving...' : isEdit ? 'Update Tender' : 'Add Tender'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ========== MAIN BIZDEV PAGE ========== */

export default function BizDev() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Business Development</h1>
      <p className="text-sm text-gray-500 mb-6">Manage leads and government tenders</p>

      <TabGroup>
        <TabList className="flex gap-2 mb-6">
          <Tab className={tabCls}>
            <TrendingUp size={16} /> Leads
          </Tab>
          <Tab className={tabCls}>
            <Building2 size={16} /> Tenders
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel><LeadsTab /></TabPanel>
          <TabPanel><TendersTab /></TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
