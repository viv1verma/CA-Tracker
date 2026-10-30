import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, TrendingUp, Users, Target, Clock } from 'lucide-react';
import { api } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const STATUS_PIE_COLORS = {
  Completed: '#10b981',
  'In Progress': '#3b82f6',
  Pending: '#f59e0b',
  'Under Review': '#8b5cf6',
  'On Hold': '#6b7280',
  Overdue: '#ef4444',
};

export default function PerformanceReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api('GET', '/performance');
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load performance data:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // The backend returns a flat array of member performance objects.
  // We reshape it into the structure our UI expects.
  const members = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data.map(m => ({
      id: m.memberId,
      name: m.memberName,
      designation: m.designation,
      total: m.total || 0,
      completed: m.completed || 0,
      inProgress: m.inProgress || 0,
      overdue: m.overdue || 0,
      onTimeRate: m.performancePct || 0,
      avgDays: '--',
    }));
  }, [data]);

  const summary = useMemo(() => {
    if (!members.length) return {};
    const total = members.reduce((s, m) => s + m.total, 0);
    const completed = members.reduce((s, m) => s + m.completed, 0);
    const onTimeTotal = Array.isArray(data) ? data.reduce((s, m) => s + (m.completedOnTime || 0), 0) : 0;
    const onTimeRate = total > 0 ? Math.round((onTimeTotal / total) * 100) : 0;
    return { total, completed, onTimeRate, avgDays: '--' };
  }, [members, data]);

  const barData = useMemo(() => {
    return members.map(m => ({
      name: m.name?.split(' ')[0] || m.name,
      fullName: m.name,
      completed: m.completed || 0,
      inProgress: m.inProgress || 0,
      overdue: m.overdue || 0,
    }));
  }, [members]);

  const pieData = useMemo(() => {
    if (!members.length) return [];
    const dist = {};
    members.forEach(m => {
      dist['Completed'] = (dist['Completed'] || 0) + m.completed;
      dist['In Progress'] = (dist['In Progress'] || 0) + m.inProgress;
      dist['Overdue'] = (dist['Overdue'] || 0) + m.overdue;
    });
    // Compute Pending as total - completed - inProgress - overdue
    const totalAll = members.reduce((s, m) => s + m.total, 0);
    const accounted = (dist['Completed'] || 0) + (dist['In Progress'] || 0) + (dist['Overdue'] || 0);
    const pending = totalAll - accounted;
    if (pending > 0) dist['Pending'] = pending;
    return Object.entries(dist).filter(([, v]) => v > 0).map(([name, value]) => ({
      name,
      value,
      color: STATUS_PIE_COLORS[name] || '#6b7280',
    }));
  }, [members]);

  const lineData = useMemo(() => {
    // No monthly trend data from backend; return empty
    return [];
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/reports')} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Reports
        </button>
        <EmptyState icon={<TrendingUp size={48} className="text-gray-300 mx-auto" />} title="No data available" description="Performance data is not yet available." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/reports')}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Team performance metrics and completion analysis</p>
        </div>
      </div>

      {/* Summary Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard label="Total Assignments" value={summary.total || 0} color="blue" />
        <StatCard label="Completed" value={summary.completed || 0} color="green" />
        <StatCard label="On-Time Rate" value={`${summary.onTimeRate || 0}%`} color="green" />
        <StatCard label="Avg. Days" value={summary.avgDays || 0} subtitle="to complete" color="blue" />
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-200 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Assignments per Member</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(value, name) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="inProgress" fill="#3b82f6" radius={[4, 4, 0, 0]} name="In Progress" />
                <Bar dataKey="overdue" fill="#ef4444" radius={[4, 4, 0, 0]} name="Overdue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </motion.div>

        {/* Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-200 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Status Distribution</h3>
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
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span className="text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </motion.div>
      </div>

      {/* Line Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-gray-200 p-5"
      >
        <h3 className="font-bold text-gray-900 mb-4">Monthly Completion Trend</h3>
        {lineData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} name="Completed" />
              <Line type="monotone" dataKey="assigned" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} name="Assigned" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No trend data</div>
        )}
      </motion.div>

      {/* Members Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Member Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Completed</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">In Progress</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Overdue</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">On-Time %</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Avg Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(members || []).map((m, idx) => (
                <motion.tr
                  key={m.id || idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + idx * 0.03 }}
                  className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} size={30} />
                      <span className="font-semibold text-gray-900">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.total || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-emerald-600">{m.completed || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-blue-600">{m.inProgress || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-red-600">{m.overdue || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      (m.onTimeRate || 0) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      (m.onTimeRate || 0) >= 50 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {m.onTimeRate || 0}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{m.avgDays || '--'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!members || members.length === 0) && (
          <div className="py-12">
            <EmptyState title="No member data" description="Performance data will appear as assignments are tracked." />
          </div>
        )}
      </motion.div>
    </div>
  );
}
