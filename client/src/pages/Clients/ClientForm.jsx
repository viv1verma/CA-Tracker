import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { User, Building2, CreditCard, Phone, Mail, MapPin, KeyRound } from 'lucide-react';

const CLIENT_TYPES = ['Individual', 'Company', 'LLP', 'Partnership', 'HUF', 'Trust'];

export default function ClientForm({ isOpen, onClose, client, onSaved }) {
  const showToast = useToast();
  const isEdit = !!client;

  const [form, setForm] = useState({
    name: '', type: 'Individual', pan: '', gst: '',
    contact: '', email: '', phone: '', address: '',
    clientUsername: '', clientPassword: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name || '',
        type: client.type || 'Individual',
        pan: client.pan || '',
        gst: client.gstin || client.gst || '',
        contact: client.contact || '',
        email: client.email || client.contactEmail || '',
        phone: client.phone || '',
        address: client.address || '',
        clientUsername: client.clientUsername || '',
        clientPassword: '',
      });
    } else {
      setForm({
        name: '', type: 'Individual', pan: '', gst: '',
        contact: '', email: '', phone: '', address: '',
        clientUsername: '', clientPassword: '',
      });
    }
  }, [client, isOpen]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Client name is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        pan: form.pan.trim(),
        gstin: form.gst.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      };
      if (form.clientUsername.trim()) payload.clientUsername = form.clientUsername.trim();
      if (form.clientPassword) payload.clientPassword = form.clientPassword;

      let result;
      if (isEdit) {
        result = await api('PUT', `/clients/${client.id}`, payload);
        showToast('Client updated');
      } else {
        result = await api('POST', '/clients', payload);
        showToast('Client added');
      }
      onSaved(result, isEdit);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Client' : 'Add Client'} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 size={16} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Basic Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter client name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {CLIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PAN</label>
              <input
                type="text"
                value={form.pan}
                onChange={e => set('pan', e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ABCDE1234F"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">GSTIN</label>
              <input
                type="text"
                value={form.gst}
                onChange={e => set('gst', e.target.value.toUpperCase())}
                maxLength={15}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="22ABCDE1234F1Z5"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Contact Info */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Phone size={16} className="text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Contact Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contact Person</label>
              <input
                type="text"
                value={form.contact}
                onChange={e => set('contact', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contact name / phone / email"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Office address"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Portal Login */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <KeyRound size={16} className="text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Portal Login</h3>
            <span className="text-xs text-gray-400">(optional)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Username</label>
              <input
                type="text"
                value={form.clientUsername}
                onChange={e => set('clientUsername', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Client login username"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {isEdit ? 'New Password' : 'Password'}
              </label>
              <input
                type="password"
                value={form.clientPassword}
                onChange={e => set('clientPassword', e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={isEdit ? 'Leave blank to keep current' : 'Set password'}
              />
            </div>
          </div>
          {isEdit && client?.hasLogin && (
            <p className="text-xs text-emerald-600 font-medium mt-2">Client portal login is active</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
