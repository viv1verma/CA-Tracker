import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthlyReport() {
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('GET', `/monthly-report?month=${month}&year=${year}`);
      if (res) setData(res);
    } catch (e) {
      console.error('Failed to load monthly report:', e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadData(); }, [loadData]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Backend returns { month, year, monthKey, report } where report is
  // an array of member performance objects for that month.
  const memberBreakdown = useMemo(() => {
    if (!data?.report) return [];
    return data.report.map(m => ({
      id: m.memberId,
      name: m.memberName,
      designation: m.designation,
      assigned: m.totalAssignments || 0,
      completed: m.assignments ? m.assignments.filter(a => a.status === 'Completed').length : 0,
      inProgress: m.assignments ? m.assignments.filter(a => ['In Progress', 'Under Review'].includes(a.status)).length : 0,
      totalUpdates: m.totalUpdatesThisMonth || 0,
    }));
  }, [data]);

  const clientBreakdown = useMemo(() => {
    if (!data?.report) return [];
    const byClient = {};
    data.report.forEach(m => {
      (m.assignments || []).forEach(a => {
        const key = a.clientName || '--';
        if (!byClient[key]) byClient[key] = { clientName: key, total: 0, completed: 0 };
        byClient[key].total++;
        if (a.status === 'Completed') byClient[key].completed++;
      });
    });
    return Object.values(byClient).sort((a, b) => b.total - a.total);
  }, [data]);

  const memberChartData = useMemo(() => {
    return memberBreakdown.map(m => ({
      name: m.name?.split(' ')[0] || m.name,
      fullName: m.name,
      assigned: m.assigned || 0,
      completed: m.completed || 0,
    }));
  }, [memberBreakdown]);

  const summary = useMemo(() => {
    if (!memberBreakdown.length) return {};
    const totalAssigned = memberBreakdown.reduce((s, m) => s + m.assigned, 0);
    const completed = memberBreakdown.reduce((s, m) => s + m.completed, 0);
    return { totalAssigned, completed, newClients: 0, revenue: null };
  }, [memberBreakdown]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Monthly Report</h1>
          <p className="text-sm text-gray-500 mt-1">Detailed monthly performance breakdown</p>
        </div>
      </div>

      {/* Month/Year Selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <EmptyState icon={<CalendarDays size={48} className="text-gray-300 mx-auto" />} title="No data for this month" description="Select a different month to view the report." />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Assigned" value={summary.totalAssigned || 0} color="blue" />
            <StatCard label="Completed" value={summary.completed || 0} color="green" />
            <StatCard label="New Clients" value={summary.newClients || 0} color="blue" />
            <StatCard
              label="Revenue"
              value={summary.revenue != null ? `${(summary.revenue / 1000).toFixed(0)}K` : '--'}
              subtitle={summary.revenue != null ? `INR ${summary.revenue.toLocaleString('en-IN')}` : 'Not tracked'}
              color="green"
            />
          </div>

          {/* Member Breakdown Chart */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Assignment Breakdown by Member</h3>
            {memberChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={memberChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(value, name) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="assigned" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Assigned" />
                  <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No member data</div>
            )}
          </div>

          {/* Member Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h3 className="font-bold text-gray-900">Member Details - {MONTH_NAMES[month - 1]} {year}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Completed</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">In Progress</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Completion %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(memberBreakdown || []).map((m, idx) => {
                    const pct = m.assigned > 0 ? Math.round((m.completed / m.assigned) * 100) : 0;
                    return (
                      <tr key={m.id || idx} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={m.name} size={28} />
                            <span className="font-semibold text-gray-900">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-semibold">{m.assigned || 0}</td>
                        <td className="px-4 py-3 text-center text-emerald-600 font-semibold">{m.completed || 0}</td>
                        <td className="px-4 py-3 text-center text-blue-600 font-semibold">{m.inProgress || 0}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(!memberBreakdown || memberBreakdown.length === 0) && (
              <div className="py-12">
                <EmptyState title="No data for this period" />
              </div>
            )}
          </div>

          {/* Client-wise Table */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h3 className="font-bold text-gray-900">Client-wise Completion</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Completed</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Pending</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(clientBreakdown || []).map((c, idx) => {
                    const allDone = c.total > 0 && c.completed === c.total;
                    return (
                      <tr key={c.clientId || idx} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={c.clientName || c.name} size={28} />
                            <span className="font-semibold text-gray-900 truncate max-w-[200px]">{c.clientName || c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-semibold">{c.total || 0}</td>
                        <td className="px-4 py-3 text-center text-emerald-600 font-semibold">{c.completed || 0}</td>
                        <td className="px-4 py-3 text-center text-amber-600 font-semibold">{(c.total || 0) - (c.completed || 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {allDone ? 'All Done' : 'In Progress'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(!clientBreakdown || clientBreakdown.length === 0) && (
              <div className="py-12">
                <EmptyState title="No client data for this period" />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
