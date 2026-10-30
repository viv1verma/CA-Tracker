import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ArrowLeft, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import ProgressBar from '../../components/ui/ProgressBar';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

export default function ClientReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api('GET', '/reports/clients');
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load client report:', e);
        if (mounted) setError(e.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sorted = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => (b.total || 0) - (a.total || 0));
  }, [data]);

  const summary = useMemo(() => {
    if (!sorted.length) return { clients: 0, total: 0, completed: 0, overdue: 0 };
    return {
      clients: sorted.length,
      total: sorted.reduce((s, c) => s + (c.total || 0), 0),
      completed: sorted.reduce((s, c) => s + (c.completed || 0), 0),
      overdue: sorted.reduce((s, c) => s + (c.overdue || 0), 0),
    };
  }, [sorted]);

  const pieData = useMemo(() => {
    return sorted.slice(0, 10).map((c, i) => ({
      name: c.name,
      value: c.total || 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [sorted]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
        <EmptyState icon={<Users size={48} className="text-gray-300 mx-auto" />} title="Error loading report" description={error} />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/reports')} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Reports
        </button>
        <EmptyState icon={<Users size={48} className="text-gray-300 mx-auto" />} title="No client data" description="Client data will appear once assignments are tracked." />
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
          <h1 className="text-2xl font-bold text-gray-900">Client Report</h1>
          <p className="text-sm text-gray-500 mt-1">Client-wise completion statistics and service delivery</p>
        </div>
      </div>

      {/* Summary Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={summary.clients} color="blue" />
        <StatCard label="Total Tasks" value={summary.total} color="blue" />
        <StatCard label="Completed" value={summary.completed} color="green" />
        <StatCard label="Overdue" value={summary.overdue} color="red" highlight={summary.overdue > 0} />
      </motion.div>

      {/* Pie Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-200 p-5"
      >
        <h3 className="font-bold text-gray-900 mb-4">Top Clients by Task Count</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(value, name) => [value + ' tasks', name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span className="text-gray-600">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No data</div>
        )}
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Client Details</h3>
          <p className="text-xs text-gray-500 mt-0.5">Click a row to see work type breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Pending</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Overdue</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((c, idx) => {
                const isExpanded = expandedRows[c.id];
                const workEntries = c.workTypes ? Object.entries(c.workTypes) : [];
                return (
                  <motion.tr
                    key={c.id || idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + idx * 0.02 }}
                    className="group"
                    style={{ display: 'contents' }}
                  >
                    <td colSpan={8} className="p-0">
                      <div
                        className={`grid grid-cols-[2rem_1fr_5rem_4rem_5rem_4.5rem_4.5rem_9rem] items-center cursor-pointer hover:bg-gray-50/60 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}
                        onClick={() => toggleRow(c.id)}
                      >
                        <div className="px-5 py-3 flex items-center">
                          {workEntries.length > 0 && (
                            isExpanded
                              ? <ChevronDown size={14} className="text-gray-400" />
                              : <ChevronRight size={14} className="text-gray-400" />
                          )}
                        </div>
                        <div className="px-4 py-3 font-semibold text-gray-900">{c.name}</div>
                        <div className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">
                            {c.type || '--'}
                          </span>
                        </div>
                        <div className="px-4 py-3 text-center font-semibold text-gray-700">{c.total || 0}</div>
                        <div className="px-4 py-3 text-center font-semibold text-emerald-600">{c.completed || 0}</div>
                        <div className="px-4 py-3 text-center font-semibold text-amber-600">{c.pending || 0}</div>
                        <div className="px-4 py-3 text-center font-semibold text-red-600">{c.overdue || 0}</div>
                        <div className="px-4 py-3">
                          <ProgressBar value={c.completionRate || 0} />
                        </div>
                      </div>
                      {/* Expanded work type breakdown */}
                      {isExpanded && workEntries.length > 0 && (
                        <div className="px-10 pb-3 bg-gray-50/60">
                          <div className="flex flex-wrap gap-2 py-2">
                            {workEntries.map(([type, count]) => (
                              <span key={type} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700">
                                {type}: <span className="font-bold">{count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
