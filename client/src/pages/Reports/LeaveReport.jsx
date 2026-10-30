import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarOff, Download, Filter } from 'lucide-react';
import { api, getToken } from '../../api/client';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function LeaveReport() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterMember, setFilterMember] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api('GET', `/leave-report?year=${year}`);
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load leave report:', e);
        if (mounted) setError(e.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [year]);

  const summaryRows = useMemo(() => data?.summary || [], [data]);
  const totals = useMemo(() => data?.totals || {}, [data]);
  const detail = useMemo(() => data?.detail || [], [data]);

  const filteredDetail = useMemo(() => {
    let result = detail;
    if (filterMember) result = result.filter(d => d.memberId === filterMember || d.memberName === filterMember);
    if (filterType) result = result.filter(d => d.type === filterType);
    if (filterStatus) result = result.filter(d => d.status === filterStatus);
    return result;
  }, [detail, filterMember, filterType, filterStatus]);

  const memberOptions = useMemo(() => {
    const set = new Map();
    detail.forEach(d => { if (d.memberName && d.memberId) set.set(d.memberId, d.memberName); });
    return Array.from(set.entries());
  }, [detail]);

  const typeOptions = useMemo(() => {
    const set = new Set();
    detail.forEach(d => { if (d.type) set.add(d.type); });
    return Array.from(set);
  }, [detail]);

  const handleDownload = () => {
    const token = getToken();
    const url = `/api/leave-report.xlsx?year=${year}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leave-report-${year}.xlsx`);
    if (token) link.href = url + `&token=${token}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 5; y--) yearOptions.push(y);

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
        <EmptyState icon={<CalendarOff size={48} className="text-gray-300 mx-auto" />} title="Error loading report" description={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/reports')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Report</h1>
            <p className="text-sm text-gray-500 mt-1">Leave balance, usage patterns, and team availability</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download size={16} /> Download Excel
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Applied" value={totals.applied || 0} color="blue" />
        <StatCard label="Approved" value={totals.approved || 0} color="green" />
        <StatCard label="Rejected" value={totals.rejected || 0} color="red" />
        <StatCard label="Total Days (Paid/Unpaid)" value={`${totals.paidDays || 0} / ${totals.unpaidDays || 0}`} color="blue" />
      </motion.div>

      {/* Summary Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Member-wise Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Applied</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Approved</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Rejected</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Pending</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Days</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Unpaid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summaryRows.map((m, idx) => (
                <tr key={m.id || idx} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} size={28} />
                      <span className="font-semibold text-gray-900">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.applied || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-emerald-600">{m.approved || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-red-600">{m.rejected || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-amber-600">{m.pending || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.approvedDays || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-emerald-600">{m.paidDays || 0}</td>
                  <td className="px-4 py-3 text-center font-semibold text-red-600">{m.unpaidDays || 0}</td>
                </tr>
              ))}
              {/* Totals row */}
              {summaryRows.length > 0 && (
                <tr className="bg-gray-100 font-bold">
                  <td className="px-5 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-center text-gray-800">{totals.applied || 0}</td>
                  <td className="px-4 py-3 text-center text-emerald-700">{totals.approved || 0}</td>
                  <td className="px-4 py-3 text-center text-red-700">{totals.rejected || 0}</td>
                  <td className="px-4 py-3 text-center text-amber-700">{totals.pending || 0}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{totals.approvedDays || 0}</td>
                  <td className="px-4 py-3 text-center text-emerald-700">{totals.paidDays || 0}</td>
                  <td className="px-4 py-3 text-center text-red-700">{totals.unpaidDays || 0}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {summaryRows.length === 0 && (
          <div className="py-12">
            <EmptyState title="No leave data" description="No leave records for the selected year." />
          </div>
        )}
      </motion.div>

      {/* Detail Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-bold text-gray-900">Leave Applications</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Members</option>
              {memberOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">From</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">To</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Days</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredDetail.map((d, idx) => (
                <tr key={d.id || idx} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                  <td className="px-5 py-3 font-medium text-gray-900">{d.memberName || '--'}</td>
                  <td className="px-4 py-3 text-gray-700">{d.type || '--'}</td>
                  <td className="px-4 py-3 text-center text-gray-600 text-xs">{formatDate(d.fromDate)}</td>
                  <td className="px-4 py-3 text-center text-gray-600 text-xs">{formatDate(d.toDate)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-700">{d.days || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[d.status] || STATUS_STYLES.pending}`}>
                      {d.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{d.reason || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredDetail.length === 0 && (
          <div className="py-12">
            <EmptyState title="No leave applications" description="No records match the current filters." />
          </div>
        )}
      </motion.div>
    </div>
  );
}
