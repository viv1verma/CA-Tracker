import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Download } from 'lucide-react';
import { api, getToken } from '../../api/client';
import EmptyState from '../../components/ui/EmptyState';

const CODE_COLORS = {
  P: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Present' },
  A: { bg: 'bg-red-100', text: 'text-red-700', label: 'Absent' },
  HD: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Half Day' },
  L: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Late' },
  PL: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Paid Leave' },
  SV: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Site Visit' },
  EL: { bg: 'bg-green-200', text: 'text-green-800', label: 'Earned Leave' },
  CL: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Casual Leave' },
  WFH: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Work From Home' },
  LWP: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Leave Without Pay' },
  '\u2013': { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Weekly Off' },
  '-': { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Weekly Off' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AttendanceReport() {
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api('GET', `/attendance/report?month=${month}&year=${year}`);
        if (mounted && res) setData(res);
      } catch (e) {
        console.error('Failed to load attendance report:', e);
        if (mounted) setError(e.message || 'Failed to load data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [month, year]);

  const days = useMemo(() => data?.days || [], [data]);
  const rows = useMemo(() => data?.rows || [], [data]);

  const handleDownload = () => {
    const token = getToken();
    let url = `/api/attendance/report.xlsx?month=${month}&year=${year}`;
    if (token) url += `&token=${token}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance-${MONTHS[month - 1]}-${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const yearOptions = [];
  const currentYear = now.getFullYear();
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
        <EmptyState icon={<Clock size={48} className="text-gray-300 mx-auto" />} title="Error loading report" description={error} />
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
            <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
            <p className="text-sm text-gray-500 mt-1">Daily attendance grid with summary totals</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
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

      {/* Attendance Grid */}
      {rows.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="text-xs w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left font-bold text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[160px]">Employee</th>
                  {days.map((d, i) => (
                    <th key={i} className={`px-1 py-2 text-center font-medium min-w-[32px] ${d.isOff ? 'bg-gray-100 text-gray-400' : 'text-gray-600'}`}>
                      <div className="leading-tight">
                        <div className="text-[10px] uppercase">{d.dow}</div>
                        <div className="font-bold">{d.day}</div>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-bold text-gray-700 bg-blue-50 min-w-[40px]">PRES</th>
                  <th className="px-2 py-2 text-center font-bold text-gray-700 bg-red-50 min-w-[40px]">ABS</th>
                  <th className="px-2 py-2 text-center font-bold text-gray-700 bg-orange-50 min-w-[40px]">LATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr key={row.userId || idx} className={idx % 2 === 1 ? 'bg-gray-50/40' : ''}>
                    <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                      <div className="font-semibold text-gray-900 truncate max-w-[140px]">{row.userName}</div>
                      <div className="text-[10px] text-gray-500 truncate">{row.designation}</div>
                    </td>
                    {(row.cells || []).map((cell, ci) => {
                      const code = cell?.code || '-';
                      const colors = CODE_COLORS[code] || CODE_COLORS['-'];
                      return (
                        <td key={ci} className="px-0.5 py-1 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-6 rounded text-[10px] font-bold ${colors.bg} ${colors.text}`}
                            title={`${cell?.status || code}${cell?.punchIn ? ` (${cell.punchIn} - ${cell.punchOut || '?'})` : ''}`}
                          >
                            {code}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center font-bold text-blue-700 bg-blue-50/50">{row.presentDays ?? row.present ?? 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-red-700 bg-red-50/50">{row.absent ?? 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-orange-700 bg-orange-50/50">{row.late ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        <div className="py-12">
          <EmptyState icon={<Clock size={48} className="text-gray-300 mx-auto" />} title="No attendance data" description="No records found for the selected month." />
        </div>
      )}

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-200 p-4"
      >
        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Legend</h4>
        <div className="flex flex-wrap gap-3">
          {Object.entries(CODE_COLORS).filter(([code]) => code !== '\u2013').map(([code, val]) => (
            <div key={code} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold ${val.bg} ${val.text}`}>
                {code}
              </span>
              <span className="text-xs text-gray-600">{val.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
