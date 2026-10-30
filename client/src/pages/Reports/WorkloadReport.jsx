import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { api } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';
import ProgressBar from '../../components/ui/ProgressBar';

export default function WorkloadReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api('GET', '/reports/workload');
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load workload data:', e);
        if (mounted) setError(e.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sorted = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => (b.active || 0) - (a.active || 0));
  }, [data]);

  const summary = useMemo(() => {
    if (!sorted.length) return { total: 0, active: 0, done: 0, overdue: 0 };
    return sorted.reduce((acc, m) => ({
      total: acc.total + (m.total || 0),
      active: acc.active + (m.active || 0),
      done: acc.done + (m.done || 0),
      overdue: acc.overdue + (m.overdue || 0),
    }), { total: 0, active: 0, done: 0, overdue: 0 });
  }, [sorted]);

  const chartData = useMemo(() => {
    return sorted.map(m => ({
      name: m.name?.split(' ')[0] || m.name,
      fullName: m.name,
      active: m.active || 0,
      done: m.done || 0,
      overdue: m.overdue || 0,
    }));
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
        <EmptyState icon={<BarChart3 size={48} className="text-gray-300 mx-auto" />} title="Error loading report" description={error} />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/reports')} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Reports
        </button>
        <EmptyState icon={<BarChart3 size={48} className="text-gray-300 mx-auto" />} title="No workload data" description="Workload data will appear once assignments are created." />
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
          <h1 className="text-2xl font-bold text-gray-900">Workload Report</h1>
          <p className="text-sm text-gray-500 mt-1">Team member workload distribution and task allocation</p>
        </div>
      </div>

      {/* Summary Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={summary.total} color="blue" />
        <StatCard label="Active" value={summary.active} color="blue" />
        <StatCard label="Completed" value={summary.done} color="green" />
        <StatCard label="Overdue" value={summary.overdue} color="red" highlight={summary.overdue > 0} />
      </motion.div>

      {/* Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-200 p-5"
      >
        <h3 className="font-bold text-gray-900 mb-4">Active Tasks per Member</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="active" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Active" />
            <Bar dataKey="done" fill="#10b981" radius={[4, 4, 0, 0]} name="Done" />
            <Bar dataKey="overdue" fill="#ef4444" radius={[4, 4, 0, 0]} name="Overdue" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Member Workload Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Designation</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Active</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Done</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Overdue</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Completion</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((m, idx) => (
                <motion.tr
                  key={m.id || idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + idx * 0.03 }}
                  className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} size={30} />
                      <span className="font-semibold text-gray-900">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.designation || '--'}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.total || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-blue-600">{m.active || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-emerald-600">{m.done || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-red-600">{m.overdue || 0}</td>
                  <td className="px-4 py-3">
                    <ProgressBar value={m.completionRate || 0} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {m.byPriority && Object.entries(m.byPriority).map(([pri, count]) => (
                        <span key={pri} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          pri === 'High' ? 'bg-red-100 text-red-700' :
                          pri === 'Urgent' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {pri}: {count}
                        </span>
                      ))}
                      {(!m.byPriority || Object.keys(m.byPriority).length === 0) && (
                        <span className="text-gray-400">--</span>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
