import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, Download, Mail, Calendar, Users, TrendingUp,
  ChevronUp, ChevronDown, ArrowUpDown, IndianRupee,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/ui/Avatar';
import SalarySlip from './SalarySlip';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function currency(n) {
  if (n == null) return '--';
  return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function currencyShort(n) {
  if (n == null) return '--';
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return currency(n);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function Salary() {
  const { user, hasPayrollAccess } = useAuth();
  const toast = useToast();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [emailingAll, setEmailingAll] = useState(false);

  // Generate year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);
    return years;
  }, []);

  // Fetch salary data - salary-config returns { id, name, designation, branch, basicSalary, hra, ... }
  // Normalize field names for the table
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('GET', '/salary-config');
      const raw = Array.isArray(data) ? data : data?.records || [];
      // Normalize fields: salary-config uses 'name' and 'basicSalary'
      const normalized = raw.map(r => ({
        ...r,
        userId: r.id,
        userName: r.name || r.userName || '',
        basic: r.basicSalary || r.basic || 0,
        grossSalary: (r.basicSalary || 0) + (r.hra || 0) + (r.conveyance || 0) + (r.otherAllowance || 0),
        netPay: (r.basicSalary || 0) + (r.hra || 0) + (r.conveyance || 0) + (r.otherAllowance || 0), // approximate (no deductions in config)
        month,
        year,
      }));
      setRecords(normalized);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sort logic
  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortedRecords = useMemo(() => {
    if (!sortCol) return records;
    return [...records].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = (vb || '').toLowerCase();
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = Number(va) || 0;
      vb = Number(vb) || 0;
      return sortAsc ? va - vb : vb - va;
    });
  }, [records, sortCol, sortAsc]);

  // Summary calculations — salary-config returns structure only (basic, hra, etc.)
  // netPay requires per-user computation. Show gross salary totals here.
  const totalPayroll = records.reduce((s, r) => s + ((r.basicSalary || 0) + (r.hra || 0) + (r.conveyance || 0) + (r.otherAllowance || 0)), 0);
  const avgSalary = records.length ? totalPayroll / records.length : 0;
  const totalWorkingDays = 26;
  const totalPresent = 0;
  const attendanceRate = 0;

  // Email all slips
  const handleEmailAll = async () => {
    setEmailingAll(true);
    try {
      await api('POST', `/salary/${year}/${month}/email-all`);
      toast('All salary slips emailed');
    } catch (err) {
      toast(err.message || 'Failed to email slips', 'error');
    } finally {
      setEmailingAll(false);
    }
  };

  // Download report — generate a CSV from the current data
  const handleDownload = () => {
    if (!records.length) { toast('No data to download', 'error'); return; }
    const header = ['Employee', 'Designation', 'Branch', 'Basic', 'HRA', 'Conveyance', 'Other Allowance', 'Gross'];
    const rows = records.map(r => [
      r.userName || r.name, r.designation || '', r.branch || '',
      r.basicSalary || r.basic || 0, r.hra || 0, r.conveyance || 0, r.otherAllowance || 0,
      r.grossSalary || ((r.basicSalary || r.basic || 0) + (r.hra || 0) + (r.conveyance || 0) + (r.otherAllowance || 0))
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salary-report-${MONTHS[month - 1]}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Report downloaded');
  };

  // Month label for slip
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  // Sort header helper
  const SortHeader = ({ col, children, className = '' }) => (
    <th
      onClick={() => handleSort(col)}
      className={`text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase cursor-pointer select-none hover:text-gray-600 transition-colors ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortCol === col ? (
          sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );

  if (!hasPayrollAccess) {
    return (
      <div className="text-center py-20 text-gray-400">
        <IndianRupee size={48} className="mx-auto mb-4 opacity-30" />
        <p className="font-semibold text-gray-500 text-lg">Access Restricted</p>
        <p className="text-sm mt-1">You do not have permission to view payroll data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/*  Header — Selectors + Actions                                 */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleEmailAll}
            disabled={emailingAll || records.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {emailingAll ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Mail size={16} />
            )}
            {emailingAll ? 'Sending...' : 'Email All Slips'}
          </button>
          <button
            onClick={handleDownload}
            disabled={records.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            Download Report
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Summary Cards                                                */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <IndianRupee size={16} />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Payroll</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currency(totalPayroll)}</div>
          <p className="text-xs text-gray-500 mt-1">{records.length} employees</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
              <TrendingUp size={16} />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Salary</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{currency(avgSalary)}</div>
          <p className="text-xs text-gray-500 mt-1">Per employee</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
              <Users size={16} />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendance Rate</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{attendanceRate}%</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${attendanceRate}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-emerald-500"
            />
          </div>
        </motion.div>
      </div>

      {/* ============================================================ */}
      {/*  Salary Table                                                 */}
      {/* ============================================================ */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          <IndianRupee size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-gray-500">No salary data for {monthLabel}</p>
          <p className="text-sm mt-1">Salary records will appear here once processed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortHeader col="userName">Employee</SortHeader>
                  <SortHeader col="designation">Designation</SortHeader>
                  <SortHeader col="workingDays">Working</SortHeader>
                  <SortHeader col="presentDays">Present</SortHeader>
                  <SortHeader col="leaveDays">Leaves</SortHeader>
                  <SortHeader col="basic">Basic</SortHeader>
                  <SortHeader col="hra">HRA</SortHeader>
                  <SortHeader col="grossSalary">Gross</SortHeader>
                  <SortHeader col="totalDeductions">Deductions</SortHeader>
                  <SortHeader col="netPay" className="text-right">Net Pay</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((rec, i) => {
                  const lowAttendance = rec.presentDays && rec.workingDays && (rec.presentDays / rec.workingDays) < 0.75;
                  return (
                    <motion.tr
                      key={rec.id || rec.userId || i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedSlip(rec)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${
                        lowAttendance ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={rec.userName} size={32} />
                          <span className="font-medium text-gray-900 text-sm">{rec.userName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-600 text-xs">{rec.designation || '--'}</td>
                      <td className="py-3 px-3 text-gray-700 font-medium">{rec.workingDays || '--'}</td>
                      <td className="py-3 px-3">
                        <span className={`font-medium ${lowAttendance ? 'text-amber-700' : 'text-gray-700'}`}>
                          {rec.presentDays || '--'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-600">{rec.leaveDays || 0}</td>
                      <td className="py-3 px-3 text-gray-700">{currency(rec.basic)}</td>
                      <td className="py-3 px-3 text-gray-700">{currency(rec.hra)}</td>
                      <td className="py-3 px-3 font-semibold text-gray-800">{currency(rec.grossSalary || (rec.basic + (rec.hra || 0) + (rec.conveyance || 0) + (rec.otherAllowance || 0)))}</td>
                      <td className="py-3 px-3 text-red-600">{currency(rec.totalDeductions || ((rec.pf || 0) + (rec.esi || 0) + (rec.tds || 0) + (rec.otherDeduction || 0)))}</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">{currency(rec.netPay)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                  <td className="py-3 px-3 font-bold text-gray-700" colSpan={5}>Total ({records.length} employees)</td>
                  <td className="py-3 px-3 font-bold text-gray-700">
                    {currency(records.reduce((s, r) => s + (r.basic || 0), 0))}
                  </td>
                  <td className="py-3 px-3 font-bold text-gray-700">
                    {currency(records.reduce((s, r) => s + (r.hra || 0), 0))}
                  </td>
                  <td className="py-3 px-3 font-bold text-gray-800">
                    {currency(records.reduce((s, r) => s + (r.grossSalary || (r.basic + (r.hra || 0) + (r.conveyance || 0) + (r.otherAllowance || 0)) || 0), 0))}
                  </td>
                  <td className="py-3 px-3 font-bold text-red-600">
                    {currency(records.reduce((s, r) => s + (r.totalDeductions || ((r.pf || 0) + (r.esi || 0) + (r.tds || 0) + (r.otherDeduction || 0)) || 0), 0))}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-gray-900">
                    {currency(totalPayroll)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Salary Slip Modal                                            */}
      {/* ============================================================ */}
      <SalarySlip
        isOpen={!!selectedSlip}
        onClose={() => setSelectedSlip(null)}
        data={selectedSlip}
        monthLabel={monthLabel}
      />
    </div>
  );
}
