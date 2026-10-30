import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarCheck, ChevronLeft, ChevronRight, Edit2, Check, X,
} from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';

const MONTH_NAMES = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const COMPLIANCE_STATUSES = ['filed', 'pending', 'overdue', 'na'];

const STATUS_STYLES = {
  filed: { bg: 'bg-emerald-500', label: 'Filed', ring: 'ring-emerald-200', textBg: 'bg-emerald-100 text-emerald-700' },
  pending: { bg: 'bg-amber-400', label: 'Pending', ring: 'ring-amber-200', textBg: 'bg-amber-100 text-amber-700' },
  overdue: { bg: 'bg-red-500', label: 'Overdue', ring: 'ring-red-200', textBg: 'bg-red-100 text-red-700' },
  na: { bg: 'bg-gray-200', label: 'N/A', ring: 'ring-gray-100', textBg: 'bg-gray-100 text-gray-500' },
};

const FY_OPTIONS = (() => {
  const yr = new Date().getFullYear();
  const opts = [];
  for (let y = yr; y >= yr - 3; y--) {
    opts.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return opts;
})();

export default function ClientCompliance() {
  const showToast = useToast();
  const editModal = useModal();

  const [complianceData, setComplianceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fyFilter, setFyFilter] = useState(FY_OPTIONS[0]);
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('GET', `/client/compliance?fy=${fyFilter}`);
      if (res) setComplianceData(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('Failed to load compliance data:', e);
    } finally {
      setLoading(false);
    }
  }, [fyFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCellClick = useCallback((obligation, monthIdx) => {
    const currentStatus = obligation.months?.[monthIdx] || 'na';
    setEditStatus(currentStatus);
    editModal.open({ obligation, monthIdx });
  }, [editModal]);

  const handleStatusUpdate = useCallback(async () => {
    if (!editModal.data) return;
    const { obligation, monthIdx } = editModal.data;
    setSaving(true);
    try {
      await api('PUT', `/client/compliance/${obligation.id}`, {
        monthIndex: monthIdx,
        status: editStatus,
      });
      showToast('Compliance status updated');
      await loadData();
      editModal.close();
    } catch (e) {
      showToast(e.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [editModal, editStatus, loadData, showToast]);

  // Legend
  const Legend = () => (
    <div className="flex flex-wrap gap-4 text-xs">
      {Object.entries(STATUS_STYLES).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${val.bg}`} />
          <span className="text-gray-600">{val.label}</span>
        </div>
      ))}
    </div>
  );

  // Summary stats
  const stats = useMemo(() => {
    let filed = 0, pending = 0, overdue = 0, total = 0;
    complianceData.forEach(ob => {
      (ob.months || []).forEach(status => {
        if (status === 'na') return;
        total++;
        if (status === 'filed') filed++;
        else if (status === 'pending') pending++;
        else if (status === 'overdue') overdue++;
      });
    });
    return { filed, pending, overdue, total };
  }, [complianceData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Track filing status across all compliance obligations</p>
        </div>
        <select
          value={fyFilter}
          onChange={e => setFyFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {FY_OPTIONS.map(fy => (
            <option key={fy} value={fy}>FY {fy}</option>
          ))}
        </select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Total Returns</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{stats.filed}</div>
          <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Filed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Pending</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Overdue</div>
        </div>
      </div>

      {/* Legend */}
      <Legend />

      {/* Compliance Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : complianceData.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={48} className="text-gray-300 mx-auto" />}
          title="No compliance data"
          description="Compliance obligations will be displayed here once configured."
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40 sticky left-0 bg-gray-50/60 z-10">
                    Obligation
                  </th>
                  {MONTH_NAMES.map((m, i) => (
                    <th key={i} className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[56px]">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {complianceData.map((ob, idx) => (
                  <tr key={ob.id || idx} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                    <td className="px-4 py-3 font-semibold text-gray-900 sticky left-0 bg-inherit z-10">
                      {ob.name || ob.obligation}
                    </td>
                    {MONTH_NAMES.map((_, mi) => {
                      const status = ob.months?.[mi] || 'na';
                      const style = STATUS_STYLES[status] || STATUS_STYLES.na;
                      return (
                        <td key={mi} className="px-2 py-3 text-center">
                          <button
                            onClick={() => handleCellClick(ob, mi)}
                            className={`w-8 h-8 rounded-lg mx-auto ${style.bg} ring-2 ${style.ring} hover:ring-4 transition-all cursor-pointer`}
                            title={`${ob.name || ob.obligation} - ${MONTH_NAMES[mi]}: ${style.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Edit Status Modal */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        title="Update Compliance Status"
        maxWidth="sm"
      >
        {editModal.data && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-400 font-semibold uppercase">Obligation</div>
              <div className="font-semibold text-gray-900 mt-0.5">
                {editModal.data.obligation.name || editModal.data.obligation.obligation}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Month: {MONTH_NAMES[editModal.data.monthIdx]}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {COMPLIANCE_STATUSES.map(s => {
                  const style = STATUS_STYLES[s];
                  const isSelected = editStatus === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setEditStatus(s)}
                      className={`
                        flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                        ${isSelected ? `${style.textBg} border-current` : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}
                      `}
                    >
                      <span className={`w-3 h-3 rounded-sm ${style.bg}`} />
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={editModal.close}
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
