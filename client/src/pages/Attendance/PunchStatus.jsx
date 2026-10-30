import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Clock, Users, CheckCircle, XCircle,
  AlertCircle, MapPin, Edit3, UserCheck, Trash2, Download,
  Eye, EyeOff, MessageSquare, Calendar,
} from 'lucide-react';
import { api, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_BADGE = {
  Present:          { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500', border: 'border-emerald-200' },
  Late:             { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500',   border: 'border-amber-200' },
  Absent:           { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500',     border: 'border-red-200' },
  'Not Marked':     { bg: 'bg-gray-50',     text: 'text-gray-500',     dot: 'bg-gray-400',    border: 'border-gray-200' },
  'Work from Home': { bg: 'bg-violet-50',   text: 'text-violet-700',   dot: 'bg-violet-500',  border: 'border-violet-200' },
  WFH:              { bg: 'bg-violet-50',   text: 'text-violet-700',   dot: 'bg-violet-500',  border: 'border-violet-200' },
  'Site Visit':     { bg: 'bg-teal-50',     text: 'text-teal-700',     dot: 'bg-teal-500',    border: 'border-teal-200' },
  'Half Day':       { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500',    border: 'border-blue-200' },
  'Casual Leave':   { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500',    border: 'border-blue-200' },
  'Sick Leave':     { bg: 'bg-pink-50',     text: 'text-pink-700',     dot: 'bg-pink-500',    border: 'border-pink-200' },
  'Earned Leave':   { bg: 'bg-violet-50',   text: 'text-violet-700',   dot: 'bg-violet-500',  border: 'border-violet-200' },
  'Paid Leave':     { bg: 'bg-purple-50',   text: 'text-purple-700',   dot: 'bg-purple-500',  border: 'border-purple-200' },
  'Leave Without Pay': { bg: 'bg-gray-50',  text: 'text-gray-600',     dot: 'bg-gray-500',    border: 'border-gray-200' },
  Leave:            { bg: 'bg-red-50',      text: 'text-red-600',      dot: 'bg-red-400',     border: 'border-red-200' },
  Holiday:          { bg: 'bg-gray-50',     text: 'text-gray-500',     dot: 'bg-gray-400',    border: 'border-gray-200' },
  Done:             { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'In Office':      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500',   border: 'border-amber-200' },
};

const CELL_COLORS = {
  P:   'bg-emerald-100 text-emerald-800',
  L:   'bg-yellow-100 text-yellow-800',
  A:   'bg-red-100 text-red-800',
  HD:  'bg-orange-100 text-orange-800',
  WFH: 'bg-violet-100 text-violet-800',
  SV:  'bg-teal-100 text-teal-800',
  CL:  'bg-blue-100 text-blue-800',
  SL:  'bg-pink-100 text-pink-800',
  EL:  'bg-violet-100 text-violet-800',
  LWP: 'bg-gray-100 text-gray-600',
  PL:  'bg-violet-100 text-violet-800',
  LV:  'bg-violet-100 text-violet-800',
  '\u2013': 'bg-slate-100 text-slate-400',
};

const LEGEND_ITEMS = [
  { code: 'P',   label: 'Present',        color: 'bg-emerald-100 text-emerald-800' },
  { code: 'L',   label: 'Late',           color: 'bg-yellow-100 text-yellow-800' },
  { code: 'A',   label: 'Absent',         color: 'bg-red-100 text-red-800' },
  { code: 'HD',  label: 'Half Day',       color: 'bg-orange-100 text-orange-800' },
  { code: 'WFH', label: 'Work from Home', color: 'bg-violet-100 text-violet-800' },
  { code: 'SV',  label: 'Site Visit',     color: 'bg-teal-100 text-teal-800' },
  { code: 'CL',  label: 'Casual Leave',   color: 'bg-blue-100 text-blue-800' },
  { code: 'SL',  label: 'Sick Leave',     color: 'bg-pink-100 text-pink-800' },
  { code: 'EL',  label: 'Earned Leave',   color: 'bg-violet-100 text-violet-800' },
  { code: 'LWP', label: 'Leave w/o Pay',  color: 'bg-gray-100 text-gray-600' },
  { code: '\u2013', label: 'Weekly Off',  color: 'bg-slate-100 text-slate-400' },
];

const STATUS_OPTIONS = ['Present', 'Absent', 'Half Day', 'Work from Home', 'Site Visit', 'Casual Leave', 'Sick Leave', 'Earned Leave', 'Paid Leave', 'Leave Without Pay'];

/**
 * Display a punch time string. The backend stores punch times as "HH:MM"
 * strings, NOT ISO dates. So display them directly without Date parsing.
 */
function fmtTime(t) {
  if (!t) return '\u2014';
  // Already in HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(t)) return t;
  // Fallback: try extracting HH:MM from any format
  const m = String(t).match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : t;
}

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

function resolveStatus(r) {
  if (r.offSite || r.status === 'Site Visit') return 'Site Visit';
  if (r.punchIn && r.punchOut) return r.status || 'Done';
  if (r.punchIn && !r.punchOut) return 'In Office';
  if (!r.punchIn) return r.status || 'Absent';
  return r.status || 'Not Marked';
}

/* ------------------------------------------------------------------ */
/*  Edit Attendance Modal                                              */
/* ------------------------------------------------------------------ */

function EditAttendanceModal({ isOpen, onClose, member, date, onSave }) {
  const [status, setStatus] = useState('Present');
  const [punchIn, setPunchIn] = useState('');
  const [punchOut, setPunchOut] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setStatus(member.status || 'Present');
      // punchIn is already "HH:MM", use directly
      setPunchIn(member.punchIn || '');
      setPunchOut(member.punchOut || '');
      setRemark(member.remark || '');
    }
  }, [member]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ status, punchIn: punchIn || null, punchOut: punchOut || null, remark });
      onClose();
    } catch {
      // handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Attendance \u2014 ${member?.userName || 'Member'}`} maxWidth="md">
      <div className="space-y-4">
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Date: <span className="font-semibold text-gray-700">{date}</span>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Punch In</label>
            <input
              type="time"
              value={punchIn}
              onChange={e => setPunchIn(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Punch Out</label>
            <input
              type="time"
              value={punchOut}
              onChange={e => setPunchOut(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Remark</label>
          <textarea
            value={remark}
            onChange={e => setRemark(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
            placeholder="Optional remark..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Remark Modal                                                       */
/* ------------------------------------------------------------------ */

function RemarkModal({ isOpen, onClose, member, date, onSave }) {
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) setRemark(member.remark || '');
  }, [member]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(remark);
      onClose();
    } catch {
      // handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Remark \u2014 ${member?.userName || 'Member'}`} maxWidth="sm">
      <div className="space-y-4">
        <textarea
          value={remark}
          onChange={e => setRemark(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
          placeholder="Add a remark..."
          maxLength={500}
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Remark'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Monthly Attendance Grid                                            */
/* ------------------------------------------------------------------ */

function MonthlyAttendanceGrid() {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('GET', `/attendance/report?month=${month}&year=${year}`);
      setReport(data);
    } catch (e) {
      toast(e.message || 'Failed to load report', 'error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [month, year, toast]);

  useEffect(() => {
    if (showPreview) fetchReport();
  }, [showPreview, fetchReport]);

  const downloadExcel = async () => {
    toast('Preparing report...');
    try {
      const token = getToken();
      const res = await fetch(`/api/attendance/report.xlsx?month=${month}&year=${year}`, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (!res.ok) {
        toast('Could not generate report', 'error');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Attendance_${MONTH_NAMES[month]}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Report downloaded');
    } catch (e) {
      toast(e.message || 'Download failed', 'error');
    }
  };

  const years = useMemo(() => {
    const arr = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) arr.push(y);
    return arr;
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Day-wise Monthly Attendance Report</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTH_NAMES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => { setShowPreview(s => !s); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                showPreview
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border border-blue-200 text-blue-600 hover:bg-blue-50'
              }`}
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? 'Hide' : 'Preview'}
            </button>
            <button
              onClick={downloadExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Download size={14} />
              Download Excel
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : !report || !report.rows || report.rows.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Users size={36} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-gray-500">No attendance data for {MONTH_NAMES[month]} {year}</p>
              </div>
            ) : (
              <div className="p-4">
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="border-collapse text-[11px] min-w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        <th className="px-3 py-2 text-left text-[9px] font-extrabold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                          Employee
                        </th>
                        {report.days.map(d => (
                          <th
                            key={d.day}
                            className={`px-0.5 py-2 text-center min-w-[24px] ${
                              d.working ? 'text-gray-500' : 'text-gray-300'
                            }`}
                          >
                            <div className="text-[9px] font-bold leading-none">{d.day}</div>
                            <div className="text-[7px] font-bold leading-none mt-0.5">{d.dow}</div>
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center text-[8px] font-extrabold text-emerald-600 uppercase">Pres</th>
                        <th className="px-2 py-2 text-center text-[8px] font-extrabold text-red-600 uppercase">Abs</th>
                        <th className="px-2 py-2 text-center text-[8px] font-extrabold text-yellow-700 uppercase">Late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, idx) => (
                        <tr key={row.userId} className={`border-b border-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-3 py-1.5 font-bold text-[11px] text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10">
                            {row.userName}
                          </td>
                          {row.cells.map((cell, ci) => {
                            const cc = CELL_COLORS[cell.code] || '';
                            return (
                              <td
                                key={ci}
                                className={`px-0.5 py-1 text-center text-[9px] font-bold ${cc}`}
                                title={cell.status ? `${report.days[ci]?.day} ${report.days[ci]?.dow}: ${cell.status}${cell.site ? ' (' + cell.site + ')' : ''}${cell.remark ? ' - ' + cell.remark : ''}` : ''}
                              >
                                {cell.code}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center text-[10px] font-extrabold text-emerald-700">{row.presentDays}</td>
                          <td className="px-2 py-1.5 text-center text-[10px] font-extrabold text-red-600">{row.absent}</td>
                          <td className="px-2 py-1.5 text-center text-[10px] font-bold text-yellow-700">{row.late}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-gray-500">
                  {LEGEND_ITEMS.map(item => (
                    <span key={item.code} className="inline-flex items-center gap-1">
                      <span className={`inline-flex items-center justify-center w-5 h-4 rounded text-[8px] font-bold ${item.color}`}>
                        {item.code}
                      </span>
                      <span>{item.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function PunchStatus() {
  const toast = useToast();
  const { isAdmin, isHrAdmin, hasPayrollAccess } = useAuth();
  const canManage = isAdmin || isHrAdmin || hasPayrollAccess;

  const [date, setDate] = useState(toDateInput(new Date()));
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [editMember, setEditMember] = useState(null);
  const [remarkMember, setRemarkMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('GET', `/attendance/today-all?date=${date}`);
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Navigate dates
  const shiftDate = (delta) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setDate(toDateInput(d));
  };

  // Stats (matching production: Total, In Office, Done, Absent)
  const totalCount = records.length;
  const inOfficeCount = records.filter(r => r.punchIn && !r.punchOut).length;
  const doneCount = records.filter(r => r.punchIn && r.punchOut).length;
  const absentCount = records.filter(r => !r.punchIn).length;

  // Edit handler - uses PUT /attendance/record
  const handleEditSave = async (updates) => {
    try {
      await api('PUT', '/attendance/record', {
        userId: editMember.userId,
        date,
        punchIn: updates.punchIn,
        punchOut: updates.punchOut,
        status: updates.status,
        remark: updates.remark,
      });
      toast('Attendance updated');
      setEditMember(null);
      await fetchData();
    } catch (err) {
      toast(err.message || 'Update failed', 'error');
      throw err;
    }
  };

  // Remark handler - uses PUT /attendance/remark
  const handleRemarkSave = async (remark) => {
    try {
      await api('PUT', '/attendance/remark', {
        userId: remarkMember.userId,
        date,
        remark,
      });
      toast('Remark saved');
      setRemarkMember(null);
      await fetchData();
    } catch (err) {
      toast(err.message || 'Save failed', 'error');
      throw err;
    }
  };

  // Delete handler - uses DELETE /attendance/record
  const handleDelete = async () => {
    if (!deleteMember) return;
    setDeleting(true);
    try {
      await api('DELETE', `/attendance/record?userId=${deleteMember.userId}&date=${date}`);
      toast('Attendance record deleted');
      setDeleteMember(null);
      await fetchData();
    } catch (err) {
      toast(err.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const statCards = [
    { label: 'Total',      count: totalCount,    color: 'blue',    bg: 'bg-blue-50',    icon: Users },
    { label: 'In Office',  count: inOfficeCount, color: 'amber',   bg: 'bg-amber-50',   icon: Clock },
    { label: 'Done',       count: doneCount,     color: 'emerald', bg: 'bg-emerald-50', icon: CheckCircle },
    { label: 'Absent',     count: absentCount,   color: 'red',     bg: 'bg-red-50',     icon: XCircle },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Status</h1>
        <p className="text-sm text-gray-500 mt-1">Daily punch status and monthly attendance overview</p>
      </div>

      {/* ============================================================ */}
      {/*  Monthly Grid Section (admin/payroll only)                    */}
      {/* ============================================================ */}
      {canManage && <MonthlyAttendanceGrid />}

      {/* ============================================================ */}
      {/*  Daily Status Section                                         */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Date picker header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => shiftDate(-1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                onClick={() => shiftDate(1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-sm text-gray-500 hidden sm:inline">{displayDate}</span>
            </div>
            <button
              onClick={() => setDate(toDateInput(new Date()))}
              className="px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`rounded-xl ${s.bg} p-4 text-center`}
                >
                  <div className={`text-2xl font-black text-${s.color}-600`}>{s.count}</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1">{s.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Daily Attendance Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-50" />
            <p className="font-semibold text-gray-500">No attendance records for this date</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Punch In</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Punch Out</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Remark</th>
                  {canManage && (
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <AnimatePresence>
                  {records.map((member, idx) => {
                    const status = resolveStatus(member);
                    const badge = STATUS_BADGE[status] || STATUS_BADGE['Not Marked'];
                    const displayStatus = status === 'Site Visit'
                      ? `Site Visit${member.site ? ' \u00B7 ' + member.site : ''}`
                      : status;

                    return (
                      <motion.tr
                        key={member.userId || idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'} hover:bg-blue-50/40 transition-colors`}
                      >
                        {/* Employee */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={member.userName} size={36} />
                            <div>
                              <div className="font-bold text-gray-900 text-sm">{member.userName}</div>
                              <div className="text-xs text-gray-500">
                                {member.designation || 'Team Member'}
                                {member.branch ? ' \u00B7 ' + member.branch : ''}
                              </div>
                              {member.isLate && (
                                <span className="inline-block mt-0.5 text-[9px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                                  LATE
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Punch In */}
                        <td className={`px-4 py-3 text-center font-extrabold text-sm ${member.isLate ? 'text-red-600' : 'text-gray-900'}`}>
                          {fmtTime(member.punchIn)}
                        </td>

                        {/* Punch Out */}
                        <td className="px-4 py-3 text-center font-extrabold text-sm text-gray-900">
                          {fmtTime(member.punchOut)}
                        </td>

                        {/* Hours */}
                        <td className="px-4 py-3 text-center text-sm font-bold text-blue-700">
                          {member.workHours
                            ? member.workHours + 'h'
                            : member.punchIn && !member.punchOut
                              ? 'Active'
                              : '\u2014'}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {displayStatus}
                          </span>
                        </td>

                        {/* Remark */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setRemarkMember(member)}
                            title={member.remark || 'Add remark'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              member.remark
                                ? 'text-blue-600 hover:bg-blue-50'
                                : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            <MessageSquare size={16} />
                          </button>
                        </td>

                        {/* Actions */}
                        {canManage && (
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setEditMember(member)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Edit"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteMember(member)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Attendance Modal */}
      {editMember && (
        <EditAttendanceModal
          isOpen={!!editMember}
          onClose={() => setEditMember(null)}
          member={editMember}
          date={date}
          onSave={handleEditSave}
        />
      )}

      {/* Remark Modal */}
      {remarkMember && (
        <RemarkModal
          isOpen={!!remarkMember}
          onClose={() => setRemarkMember(null)}
          member={remarkMember}
          date={date}
          onSave={handleRemarkSave}
        />
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteMember}
        onClose={() => setDeleteMember(null)}
        onConfirm={handleDelete}
        title="Delete Attendance Record"
        message={`Delete the attendance record for ${deleteMember?.userName || 'this member'} on ${date}? This cannot be undone.`}
        confirmText="Delete"
        confirmColor="red"
        loading={deleting}
      />
    </div>
  );
}
