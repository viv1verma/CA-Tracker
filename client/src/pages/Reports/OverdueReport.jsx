import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import ProgressBar from '../../components/ui/ProgressBar';

function severityClass(daysOverdue) {
  if (daysOverdue > 14) return 'bg-red-50';
  if (daysOverdue > 7) return 'bg-orange-50';
  return 'bg-yellow-50';
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OverdueReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api('GET', '/reports/overdue');
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load overdue data:', e);
        if (mounted) setError(e.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sorted = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
  }, [data]);

  const summary = useMemo(() => {
    if (!sorted.length) return { total: 0, critical: 0, moderate: 0, mild: 0 };
    return {
      total: sorted.length,
      critical: sorted.filter(a => a.daysOverdue > 14).length,
      moderate: sorted.filter(a => a.daysOverdue > 7 && a.daysOverdue <= 14).length,
      mild: sorted.filter(a => a.daysOverdue <= 7).length,
    };
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/reports')} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Reports
        </button>
        <EmptyState icon={<AlertTriangle size={48} className="text-gray-300 mx-auto" />} title="Error loading report" description={error} />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/reports')} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Reports
        </button>
        <EmptyState icon={<AlertTriangle size={48} className="text-emerald-300 mx-auto" />} title="No overdue assignments" description="All assignments are on track. Great work!" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overdue Report</h1>
          <p className="text-sm text-gray-500 mt-1">All overdue assignments with aging analysis</p>
        </div>
      </div>

      {/* Summary Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Overdue" value={summary.total} color="red" highlight />
        <StatCard label="Critical (>14 days)" value={summary.critical} color="red" />
        <StatCard label="Moderate (8-14 days)" value={summary.moderate} color="blue" />
        <StatCard label="Mild (1-7 days)" value={summary.mild} color="blue" />
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Overdue Assignments</h3>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by days overdue (most overdue first)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Work Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned To</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Days Overdue</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((a, idx) => (
                <motion.tr
                  key={a.id || idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 + idx * 0.02 }}
                  className={severityClass(a.daysOverdue)}
                >
                  <td className="px-5 py-3 font-semibold text-gray-900">{a.clientName || '--'}</td>
                  <td className="px-4 py-3 text-gray-700">{a.workType || '--'}</td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-800">{a.memberName || '--'}</div>
                      <div className="text-xs text-gray-500">{a.designation || ''}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-red-600 font-medium text-xs">{formatDate(a.dueDate)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                      {a.daysOverdue || 0} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge status={a.status || 'Pending'} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.priority === 'High' ? 'bg-red-100 text-red-700' :
                      a.priority === 'Urgent' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {a.priority || 'Normal'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar value={a.completionPct || 0} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Critical (&gt;14 days)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-200" /> Moderate (8-14 days)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200" /> Mild (1-7 days)</span>
      </div>
    </div>
  );
}
