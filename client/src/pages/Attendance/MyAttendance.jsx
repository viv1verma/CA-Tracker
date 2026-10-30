import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Calendar, CheckCircle, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, MapPin, Home, Timer, LogIn, LogOut,
  Sun, Sunrise, Sunset,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Card from '../../components/ui/Card';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_CONFIG = {
  Present:    { color: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle },
  Late:       { color: 'bg-amber-500',   ring: 'ring-amber-200',   text: 'text-amber-700',   bg: 'bg-amber-50',   icon: AlertCircle },
  Absent:     { color: 'bg-red-500',     ring: 'ring-red-200',     text: 'text-red-700',     bg: 'bg-red-50',     icon: XCircle },
  Leave:      { color: 'bg-red-400',     ring: 'ring-red-200',     text: 'text-red-600',     bg: 'bg-red-50',     icon: XCircle },
  WFH:        { color: 'bg-blue-500',    ring: 'ring-blue-200',    text: 'text-blue-700',    bg: 'bg-blue-50',    icon: Home },
  'Site Visit': { color: 'bg-purple-500', ring: 'ring-purple-200', text: 'text-purple-700', bg: 'bg-purple-50',  icon: MapPin },
  Holiday:    { color: 'bg-gray-400',    ring: 'ring-gray-200',    text: 'text-gray-600',    bg: 'bg-gray-50',    icon: Sun },
  Off:        { color: 'bg-gray-300',    ring: 'ring-gray-100',    text: 'text-gray-500',    bg: 'bg-gray-50',    icon: Calendar },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtTime(t) {
  if (!t) return '--:--';
  // Backend stores punch times as "HH:MM" strings, not ISO dates
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  }
  // Fallback for ISO date strings
  return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getElapsed(punchIn) {
  if (!punchIn) return { hours: 0, minutes: 0, seconds: 0 };
  let punchDate;
  // Handle HH:MM string (today's date at that time)
  if (/^\d{1,2}:\d{2}$/.test(punchIn)) {
    const [h, m] = punchIn.split(':').map(Number);
    punchDate = new Date();
    punchDate.setHours(h, m, 0, 0);
  } else {
    punchDate = new Date(punchIn);
  }
  if (isNaN(punchDate.getTime())) return { hours: 0, minutes: 0, seconds: 0 };
  const diff = Math.max(0, Math.floor((Date.now() - punchDate.getTime()) / 1000));
  return {
    hours: Math.floor(diff / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  // Pad with empty days for week alignment
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

/* ------------------------------------------------------------------ */
/*  Elapsed Timer Component                                            */
/* ------------------------------------------------------------------ */

function ElapsedTimer({ punchIn }) {
  const [elapsed, setElapsed] = useState(getElapsed(punchIn));

  useEffect(() => {
    const id = setInterval(() => setElapsed(getElapsed(punchIn)), 1000);
    return () => clearInterval(id);
  }, [punchIn]);

  return (
    <div className="flex items-center gap-1 font-mono text-3xl font-bold text-gray-900">
      <span className="bg-gray-100 rounded-lg px-2 py-1">{pad(elapsed.hours)}</span>
      <span className="text-gray-400 animate-pulse">:</span>
      <span className="bg-gray-100 rounded-lg px-2 py-1">{pad(elapsed.minutes)}</span>
      <span className="text-gray-400 animate-pulse">:</span>
      <span className="bg-gray-100 rounded-lg px-2 py-1 text-xl text-gray-500">{pad(elapsed.seconds)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function MyAttendance() {
  const { user } = useAuth();
  const toast = useToast();

  const now = new Date();
  const [todayData, setTodayData] = useState(null);
  const [history, setHistory] = useState([]);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'table'

  // Today's formatted date
  const todayStr = now.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const greetIcon = now.getHours() < 12 ? Sunrise : now.getHours() < 17 ? Sun : Sunset;
  const GreetIcon = greetIcon;

  // Fetch today's status
  const fetchToday = useCallback(async () => {
    try {
      const data = await api('GET', '/attendance/today');
      setTodayData(data);
    } catch {
      // No attendance data for today
      setTodayData(null);
    }
  }, []);

  // Fetch monthly history
  const fetchHistory = useCallback(async () => {
    try {
      const data = await api('GET', `/attendance?month=${month + 1}&year=${year}`);
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    }
  }, [month, year]);

  useEffect(() => {
    Promise.all([fetchToday(), fetchHistory()]).finally(() => setLoading(false));
  }, [fetchToday, fetchHistory]);

  // Punch In
  const handlePunchIn = async () => {
    setPunching(true);
    try {
      await api('POST', '/attendance/punch-in');
      toast('Punched in successfully!');
      await fetchToday();
    } catch (err) {
      toast(err.message || 'Failed to punch in', 'error');
    } finally {
      setPunching(false);
    }
  };

  // Punch Out
  const handlePunchOut = async () => {
    setPunching(true);
    try {
      await api('POST', '/attendance/punch-out');
      toast('Punched out successfully!');
      await fetchToday();
    } catch (err) {
      toast(err.message || 'Failed to punch out', 'error');
    } finally {
      setPunching(false);
    }
  };

  // Month navigation
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Build calendar lookup
  const historyMap = {};
  history.forEach(h => {
    if (!h.date) return;
    const d = new Date(h.date + 'T00:00:00');
    const key = d.getDate();
    // Map isLate to a display status for the calendar
    const displayStatus = h.isLate ? 'Late' : (h.status === 'Work from Home' ? 'WFH' : h.status);
    historyMap[key] = { ...h, status: displayStatus };
  });

  // Compute monthly stats — backend marks late punches with isLate:true, status stays 'Present'
  const presentDays = history.filter(h => ['Present', 'Work from Home', 'Site Visit'].includes(h.status)).length;
  const lateDays = history.filter(h => h.isLate).length;
  const leaveDays = history.filter(h => ['Absent', 'Leave', 'Leave Without Pay', 'Casual Leave', 'Sick Leave', 'Earned Leave'].includes(h.status)).length;

  const isPunchedIn = todayData?.punchIn && !todayData?.punchOut;
  const isPunchedOut = todayData?.punchIn && todayData?.punchOut;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/*  Today's Date Header                                         */}
      {/* ============================================================ */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
          <GreetIcon size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{todayStr}</h2>
          <p className="text-sm text-gray-500">Your attendance dashboard</p>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Punch Status Card                                           */}
      {/* ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      >
        <div className={`relative overflow-hidden rounded-2xl border-2 p-6 ${
          isPunchedIn
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50'
            : isPunchedOut
              ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50'
              : 'border-gray-200 bg-gradient-to-br from-white to-gray-50'
        }`}>
          {/* Background decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br from-blue-100/30 to-purple-100/30" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-gradient-to-br from-emerald-100/20 to-teal-100/20" />

          <div className="relative z-10">
            {/* Status indicator */}
            {todayData?.status && (
              <div className="mb-4">
                {(() => {
                  const cfg = STATUS_CONFIG[todayData.status] || STATUS_CONFIG.Present;
                  const Icon = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.text}`}>
                      <Icon size={14} />
                      {todayData.status}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Not punched in */}
            {!todayData?.punchIn && (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-6 text-sm">You haven't punched in yet today</p>
                <motion.button
                  onClick={handlePunchIn}
                  disabled={punching}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative inline-flex items-center gap-3 px-10 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {/* Pulse ring */}
                  <motion.span
                    className="absolute inset-0 rounded-2xl border-2 border-emerald-400"
                    animate={{ scale: [1, 1.08, 1], opacity: [0.7, 0, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.span
                    className="absolute inset-0 rounded-2xl border-2 border-emerald-300"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  />
                  {punching ? (
                    <div className="animate-spin h-6 w-6 border-3 border-white border-t-transparent rounded-full" />
                  ) : (
                    <LogIn size={24} />
                  )}
                  {punching ? 'Punching In...' : 'Punch In'}
                </motion.button>
              </div>
            )}

            {/* Punched in - show elapsed */}
            {isPunchedIn && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Punched in at</p>
                    <p className="text-xl font-bold text-emerald-700">{fmtTime(todayData.punchIn)}</p>
                  </div>

                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-2">Time elapsed</p>
                    <ElapsedTimer punchIn={todayData.punchIn} />
                  </div>

                  <motion.button
                    onClick={handlePunchOut}
                    disabled={punching}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {punching ? (
                      <div className="animate-spin h-5 w-5 border-3 border-white border-t-transparent rounded-full" />
                    ) : (
                      <LogOut size={20} />
                    )}
                    {punching ? 'Punching Out...' : 'Punch Out'}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Punched out - show summary */}
            {isPunchedOut && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Punch In</p>
                    <p className="text-lg font-bold text-gray-900">{fmtTime(todayData.punchIn)}</p>
                  </div>
                  <div className="text-gray-300">
                    <ChevronRight size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Punch Out</p>
                    <p className="text-lg font-bold text-gray-900">{fmtTime(todayData.punchOut)}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Total Hours</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {todayData.workHours ? `${Number(todayData.workHours).toFixed(1)}h` : '--'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ============================================================ */}
      {/*  Monthly Stats Cards                                         */}
      {/* ============================================================ */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Present</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{presentDays}</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (presentDays / 26) * 100)}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-emerald-500"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Late</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{lateDays}</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (lateDays / 26) * 100)}%` }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="h-full rounded-full bg-amber-500"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Leave</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{leaveDays}</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (leaveDays / 26) * 100)}%` }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="h-full rounded-full bg-red-500"
            />
          </div>
        </motion.div>
      </div>

      {/* ============================================================ */}
      {/*  History Section                                              */}
      {/* ============================================================ */}
      <Card>
        {/* Header with month nav and view toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h3 className="text-base font-bold text-gray-900 min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </h3>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Calendar size={14} className="inline mr-1" />
              Calendar
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Clock size={14} className="inline mr-1" />
              Table
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === 'calendar' ? (
            <motion.div
              key={`cal-${month}-${year}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {getCalendarDays(year, month).map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} />;
                  const record = historyMap[day];
                  const status = record?.status;
                  const cfg = status ? STATUS_CONFIG[status] : null;
                  const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();

                  return (
                    <motion.div
                      key={day}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className={`relative flex flex-col items-center justify-center py-2.5 rounded-lg transition-colors cursor-default ${
                        isToday ? 'ring-2 ring-blue-400 bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                        {day}
                      </span>
                      {cfg && (
                        <span className={`mt-1 w-2 h-2 rounded-full ${cfg.color}`} title={status} />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                  <div key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                    {status}
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`tbl-${month}-${year}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calendar size={40} className="mx-auto mb-3 opacity-50" />
                  <p className="font-semibold text-gray-500">No records this month</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Date</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Punch In</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Punch Out</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Hours</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => {
                        const cfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.Present;
                        return (
                          <motion.tr
                            key={h.id || i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="border-b border-gray-50 hover:bg-gray-50"
                          >
                            <td className="py-2.5 px-3 font-medium text-gray-700">
                              {new Date(h.date || h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600">{fmtTime(h.punchIn)}</td>
                            <td className="py-2.5 px-3 text-gray-600">{fmtTime(h.punchOut)}</td>
                            <td className="py-2.5 px-3 font-semibold text-gray-700">
                              {h.workHours ? `${Number(h.workHours).toFixed(1)}h` : '--'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.color}`} />
                                {h.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[200px] truncate">
                              {h.remark || '--'}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
