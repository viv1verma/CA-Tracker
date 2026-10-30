import { useState } from 'react';
import { motion } from 'framer-motion';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { fmtAny } from '../../utils/format';
import {
  Calendar, DollarSign, FileText, Building2, MapPin,
  User, AlertTriangle, CheckCircle, Clock, Send,
  Pencil, Trash2, Loader2,
} from 'lucide-react';

const STATUS_COLORS = {
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

function InfoBlock({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-gray-400" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">{value || '\u2014'}</p>
      </div>
    </div>
  );
}

export default function TenderDetail({ isOpen, onClose, tender, statuses, onUpdated, onEdit, onDelete }) {
  const showToast = useToast();
  const [eventStatus, setEventStatus] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!tender) return null;

  const sc = STATUS_COLORS[tender.status] || { bg: '#f3f4f6', text: '#6b7280' };
  const ev = (tender.eligibility && tender.eligibility.verdict) || '';
  const ec = ELIG_COLORS[ev] || null;

  const isOpen_ = tender.status !== 'Awarded' && tender.status !== 'Lost' && tender.status !== 'Cancelled / Retendered';
  let dueWarning = null;
  if (tender.dueDate && isOpen_) {
    const d = new Date(tender.dueDate + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    if (days < 0) dueWarning = { text: 'OVERDUE', color: '#dc2626' };
    else if (days <= 7) dueWarning = { text: `${days}d left`, color: '#d97706' };
  }

  const events = [...(tender.events || [])].reverse(); // newest first

  const handleAddEvent = async () => {
    const status = eventStatus || tender.status;
    const note = eventNote.trim();
    if (!note && status === tender.status) {
      showToast('Add a note or change the status', 'error');
      return;
    }
    setAdding(true);
    try {
      const updated = await api('POST', `/tenders/${tender.id}/event`, { status, note });
      showToast('Event added');
      setEventNote('');
      setEventStatus('');
      onUpdated(updated);
    } catch (err) {
      showToast(err.message || 'Could not add event', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete tender "${tender.psuName}"?`)) return;
    setDeleting(true);
    try {
      await api('DELETE', `/tenders/${tender.id}`);
      showToast('Tender deleted');
      onDelete(tender.id);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{tender.psuName}</h2>
          {tender.natureOfWork && (
            <p className="text-sm text-gray-500 mt-0.5">{tender.natureOfWork}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: sc.bg, color: sc.text }}
          >
            {tender.status}
          </span>
          {ev && ec && (
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: ec.bg, color: ec.text }}
            >
              {ev}
            </span>
          )}
          <button
            onClick={() => onEdit(tender)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
        <InfoBlock icon={DollarSign} label="EMD Amount" value={fmtMoney(tender.emdAmount)} />
        <InfoBlock icon={DollarSign} label="Tender Fee" value={fmtMoney(tender.tenderFee)} />
        <InfoBlock icon={DollarSign} label="Tender Value" value={fmtMoney(tender.tenderValue)} />
        <InfoBlock icon={DollarSign} label="Quotation Value" value={fmtMoney(tender.quotationValue)} />
        <InfoBlock
          icon={Calendar}
          label="Due Date"
          value={
            <span>
              {fmtAny(tender.dueDate)}
              {dueWarning && (
                <span className="ml-1.5 text-[10px] font-bold" style={{ color: dueWarning.color }}>
                  {dueWarning.text}
                </span>
              )}
            </span>
          }
        />
        <InfoBlock icon={Calendar} label="Application Date" value={fmtAny(tender.applicationDate)} />
        <InfoBlock icon={User} label="Partner Following Up" value={tender.partnerName} />
        <InfoBlock icon={FileText} label="Tender Ref" value={tender.tenderRef} />
        <InfoBlock icon={FileText} label="EMD Status" value={tender.emdStatus} />
      </div>

      {/* Add Event form */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h4 className="text-xs font-bold text-blue-700 uppercase mb-3">Add Event / Update Status</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Status</label>
            <select
              value={eventStatus || tender.status}
              onChange={e => setEventStatus(e.target.value)}
              className="w-full h-9 px-3 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
            >
              {(statuses || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Note / Remark</label>
          <textarea
            value={eventNote}
            onChange={e => setEventNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1 resize-none"
            placeholder="e.g. Submitted bid documents, waiting for technical evaluation"
          />
        </div>
        <button
          onClick={handleAddEvent}
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Add to Trail
        </button>
      </div>

      {/* Event timeline */}
      <div>
        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Trail of Events</h4>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No events yet</div>
        ) : (
          <div className="space-y-3">
            {events.map((ev, i) => {
              const evSc = STATUS_COLORS[ev.status] || { bg: '#f3f4f6', text: '#6b7280' };
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-3"
                >
                  {/* Timeline dot + line */}
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: evSc.text }} />
                    {i < events.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: evSc.bg, color: evSc.text }}
                      >
                        {ev.status}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {ev.date ? new Date(ev.date).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        }) : ''}
                      </span>
                      {ev.byName && (
                        <span className="text-[10px] text-gray-400 font-medium">by {ev.byName}</span>
                      )}
                    </div>
                    {ev.note && (
                      <p className="text-sm text-gray-700 mt-1">{ev.note}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
