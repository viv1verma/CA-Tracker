import { useState, useMemo } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { motion } from 'framer-motion';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { fmt } from '../../utils/format';
import { isOverdue } from '../../utils/helpers';
import {
  Mail, Phone, MapPin, CreditCard, Building2, Hash,
  Pencil, Trash2, ClipboardList, FileCheck, FileText,
  Clock, CheckCircle, AlertTriangle, Loader2,
} from 'lucide-react';

function InfoItem({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-gray-400" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function tabClasses({ selected }) {
  return `px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors outline-none ${
    selected
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
  }`;
}

export default function ClientProfile({ isOpen, onClose, client, onEdit, onDelete }) {
  const { assignments } = useData();
  const { canManage } = useAuth();
  const showToast = useToast();
  const [deleting, setDeleting] = useState(false);

  const clientAssignments = useMemo(() => {
    if (!client) return [];
    return assignments.filter(a => a.clientId === client.id);
  }, [assignments, client]);

  const stats = useMemo(() => {
    const total = clientAssignments.length;
    const pending = clientAssignments.filter(a => a.status === 'Pending').length;
    const inProgress = clientAssignments.filter(a => a.status === 'In Progress').length;
    const completed = clientAssignments.filter(a => a.status === 'Completed').length;
    const overdue = clientAssignments.filter(a => isOverdue(a)).length;
    return { total, pending, inProgress, completed, overdue };
  }, [clientAssignments]);

  const handleDelete = async () => {
    if (!client) return;
    if (!window.confirm(`Delete "${client.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api('DELETE', `/clients/${client.id}`);
      showToast('Client deleted');
      onDelete(client.id);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!client) return null;

  const typeBadge = {
    Individual: { bg: '#dbeafe', text: '#1e40af' },
    Company: { bg: '#dcfce7', text: '#15803d' },
    LLP: { bg: '#fef3c7', text: '#92400e' },
    Partnership: { bg: '#ede9fe', text: '#7c3aed' },
    HUF: { bg: '#fce7f3', text: '#be185d' },
    Trust: { bg: '#ccfbf1', text: '#0f766e' },
  };
  const tb = typeBadge[client.type] || { bg: '#f3f4f6', text: '#374151' };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl">
      {/* Client Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        <Avatar name={client.name} size={64} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: tb.bg, color: tb.text }}
            >
              {client.type || 'Individual'}
            </span>
            {client.pan && (
              <span className="text-xs font-mono font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                PAN: {client.pan}
              </span>
            )}
            {client.gst && (
              <span className="text-xs font-mono font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                GST: {client.gst}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onEdit(client)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: '#1e40af', bg: '#eff6ff' },
          { label: 'Pending', value: stats.pending, color: '#d97706', bg: '#fffbeb' },
          { label: 'In Progress', value: stats.inProgress, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Completed', value: stats.completed, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Overdue', value: stats.overdue, color: '#dc2626', bg: '#fef2f2' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg }}>
            <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Contact Info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <InfoItem icon={Phone} label="Contact" value={client.contact} />
          <InfoItem icon={MapPin} label="Address" value={client.address} />
          <InfoItem icon={CreditCard} label="Portal Login" value={client.clientUsername ? `@${client.clientUsername}` : null} />
        </div>
      </div>

      {/* Tabs */}
      <TabGroup>
        <TabList className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
          <Tab className={tabClasses}>
            <span className="flex items-center gap-1.5"><ClipboardList size={14} /> Assignments</span>
          </Tab>
          <Tab className={tabClasses}>
            <span className="flex items-center gap-1.5"><FileCheck size={14} /> Compliance</span>
          </Tab>
          <Tab className={tabClasses}>
            <span className="flex items-center gap-1.5"><FileText size={14} /> Invoices</span>
          </Tab>
        </TabList>

        <TabPanels>
          {/* Assignments Tab */}
          <TabPanel>
            {clientAssignments.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">No assignments yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Work Type</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Assigned To</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Due Date</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Status</th>
                      <th className="text-center px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientAssignments.map((a, i) => {
                      const od = isOverdue(a);
                      return (
                        <motion.tr
                          key={a.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className={`border-b border-gray-50 ${od ? 'bg-red-50/50' : i % 2 ? 'bg-gray-50/30' : ''}`}
                        >
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{a.workType}</td>
                          <td className="px-4 py-2.5 text-gray-600">{a.memberName || '\u2014'}</td>
                          <td className="px-4 py-2.5">
                            <span className={od ? 'text-red-600 font-bold' : 'text-gray-600'}>
                              {fmt(a.dueDate)}
                              {od && <AlertTriangle size={12} className="inline ml-1" />}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><Badge status={a.status} /></td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${a.completionPct || 0}%`,
                                    background: (a.completionPct || 0) >= 100 ? '#16a34a' : '#2563eb',
                                  }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-7">{a.completionPct || 0}%</span>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabPanel>

          {/* Compliance Tab */}
          <TabPanel>
            <div className="text-center py-14 text-gray-400">
              <FileCheck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-gray-500">Compliance Calendar</p>
              <p className="text-sm mt-1">Coming soon</p>
            </div>
          </TabPanel>

          {/* Invoices Tab */}
          <TabPanel>
            <div className="text-center py-14 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-gray-500">Invoices</p>
              <p className="text-sm mt-1">Coming soon</p>
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </Modal>
  );
}
