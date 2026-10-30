import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Building2 } from 'lucide-react';

const LEAD_STATUSES = [
  'Generated POC',
  'Contacted POC',
  'Fixed Meeting with POC',
  'Met with POC',
  'Got the Assignment',
  'Lost the Assignment',
];

const STATUS_COLORS = {
  'Generated POC':          { bg: '#f1f5f9', text: '#475569', ring: '#94a3b8' },
  'Contacted POC':          { bg: '#dbeafe', text: '#1e40af', ring: '#60a5fa' },
  'Fixed Meeting with POC': { bg: '#fef3c7', text: '#92400e', ring: '#f59e0b' },
  'Met with POC':           { bg: '#e0e7ff', text: '#4338ca', ring: '#818cf8' },
  'Got the Assignment':     { bg: '#dcfce7', text: '#15803d', ring: '#4ade80' },
  'Lost the Assignment':    { bg: '#fee2e2', text: '#991b1b', ring: '#f87171' },
};

export default function LeadForm({ isOpen, onClose, lead, onSaved }) {
  const showToast = useToast();
  const isEdit = !!lead;

  const [form, setForm] = useState({
    name: '', poc: '', pocDesignation: '', phone: '', email: '',
    source: '', status: 'Generated POC', note: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name || '',
        poc: lead.poc || '',
        pocDesignation: lead.pocDesignation || '',
        phone: lead.phone || '',
        email: lead.email || '',
        source: lead.source || '',
        status: lead.status || 'Generated POC',
        note: '',
      });
    } else {
      setForm({
        name: '', poc: '', pocDesignation: '', phone: '', email: '',
        source: '', status: 'Generated POC', note: '',
      });
    }
  }, [lead, isOpen]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Lead name is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        poc: form.poc.trim(),
        pocDesignation: form.pocDesignation.trim(),
      };

      let result;
      if (isEdit) {
        result = await api('PUT', `/leads/${lead.id}`, payload);
        showToast('Lead updated');
      } else {
        payload.status = form.status;
        payload.note = form.note.trim();
        result = await api('POST', '/leads', payload);
        showToast('Lead added');
      }
      onSaved(result, isEdit);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Lead' : 'Add Lead'} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company */}
        <div>
          <label className={labelCls}>Company / Lead Name *</label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Company or person name" />
        </div>

        {/* POC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Point of Contact</label>
            <input type="text" value={form.poc} onChange={e => set('poc', e.target.value)} className={inputCls} placeholder="Contact person" />
          </div>
          <div>
            <label className={labelCls}>POC Designation</label>
            <input type="text" value={form.pocDesignation} onChange={e => set('pocDesignation', e.target.value)} className={inputCls} placeholder="e.g. Director" />
          </div>
        </div>

        {/* Status (only for new leads) */}
        {!isEdit && (
          <>
            <div>
              <label className={labelCls}>Status</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {LEAD_STATUSES.map(s => {
                  const sc = STATUS_COLORS[s] || STATUS_COLORS['Generated POC'];
                  const selected = form.status === s;
                  return (
                    <label
                      key={s}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${
                        selected
                          ? 'shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{
                        borderColor: selected ? sc.ring : undefined,
                        background: selected ? sc.bg : undefined,
                        color: selected ? sc.text : '#374151',
                      }}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        checked={selected}
                        onChange={e => set('status', e.target.value)}
                        className="sr-only"
                      />
                      <span
                        className="w-3 h-3 rounded-full border-2 shrink-0"
                        style={{
                          borderColor: sc.ring,
                          background: selected ? sc.ring : 'transparent',
                        }}
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className={labelCls}>Initial Note</label>
              <textarea
                value={form.note}
                onChange={e => set('note', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="e.g. Met at a conference, discussed potential audit engagement"
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
