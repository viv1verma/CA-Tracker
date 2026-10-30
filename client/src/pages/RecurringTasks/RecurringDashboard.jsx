import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import {
  LayoutDashboard, Settings2, FileBarChart, RefreshCw,
  CheckCircle2, Pause, Play, CalendarClock, Filter, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api } from '../../api/client';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { WORK_TYPES } from '../../utils/constants';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import RecurringSetup from './RecurringSetup';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_CELL = {
  Completed: { bg: 'bg-emerald-500', label: 'Completed', ring: 'ring-emerald-200' },
  'In Progress': { bg: 'bg-blue-500', label: 'In Progress', ring: 'ring-blue-200' },
  Pending: { bg: 'bg-amber-400', label: 'Pending', ring: 'ring-amber-200' },
  'Not Generated': { bg: 'bg-gray-200', label: 'Not Generated', ring: 'ring-gray-100' },
};

function getMonthRange(offset, count = 6) {
  const months = [];
  const now = new Date();
  now.setMonth(now.getMonth() + offset);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
    });
  }
  return months;
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs">
      {Object.entries(STATUS_CELL).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${val.bg}`} />
          <span className="text-gray-600">{val.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RecurringDashboard() {
  const { recurringTemplates, clients } = useData();
  const showToast = useToast();
  const [tabIndex, setTabIndex] = useState(0);
  const [reportData, setReportData] = useState([]);
  const [reportMonths, setReportMonths] = useState([]);
  const [clientFilter, setClientFilter] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map(c => [c.id, c])),
    [clients],
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('GET', '/recurring-report?months=6');
      if (data) {
        setReportData(data.rows || []);
        setReportMonths(data.months || []);
      }
    } catch (e) {
      console.error('Failed to load recurring report:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tabIndex === 0) loadReport();
  }, [tabIndex, loadReport]);

  // Stats
  const stats = useMemo(() => {
    const total = recurringTemplates.length;
    const active = recurringTemplates.filter(t => t.active !== false).length;
    const paused = total - active;
    const now = new Date();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const curMonthIdx = reportMonths.findIndex(m => m.key === curMonthKey);
    const generated = curMonthIdx >= 0 ? reportData.filter(r =>
      r.cells && r.cells[curMonthIdx] && r.cells[curMonthIdx].status
    ).length : 0;
    return { total, active, paused, generated };
  }, [recurringTemplates, reportData, reportMonths]);

  // Filtered report — backend returns clientName (not clientId) in report rows
  const filteredReport = useMemo(() => {
    let list = reportData;
    if (clientFilter) {
      const clientName = clientMap[clientFilter]?.name;
      list = list.filter(r => r.clientName === clientName || r.clientId === clientFilter);
    }
    if (workTypeFilter) list = list.filter(r => r.workType === workTypeFilter);
    return list;
  }, [reportData, clientFilter, workTypeFilter, clientMap]);

  const tabLabels = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Settings2, label: 'Setup' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">Manage recurring task templates and monitor generation status</p>
        </div>
      </div>

      {/* Tabs */}
      <TabGroup selectedIndex={tabIndex} onChange={setTabIndex}>
        <TabList className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabLabels.map((t, i) => (
            <Tab
              key={i}
              className={({ selected }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all outline-none ${
                  selected
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <t.icon size={16} />
              {t.label}
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          {/* Dashboard Tab */}
          <TabPanel>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Templates"
                  value={stats.total}
                  color="blue"
                />
                <StatCard
                  label="Active"
                  value={stats.active}
                  subtitle={`${stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}% active`}
                  color="green"
                />
                <StatCard
                  label="Paused"
                  value={stats.paused}
                  color="blue"
                />
                <StatCard
                  label="Generated This Month"
                  value={stats.generated}
                  color="green"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-gray-400" />
                  <select
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Clients</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={workTypeFilter}
                    onChange={e => setWorkTypeFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Work Types</option>
                    {WORK_TYPES.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>

                {/* Month range display */}
                {reportMonths.length > 0 && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm font-medium text-gray-600">
                      {reportMonths[0]?.label} — {reportMonths[reportMonths.length - 1]?.label}
                    </span>
                    <button
                      onClick={loadReport}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                )}
              </div>

              {/* Legend */}
              <StatusLegend />

              {/* Heatmap Grid */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-64">
                          Client / Work Type
                        </th>
                        {reportMonths.map(m => (
                          <th
                            key={m.key}
                            className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider"
                          >
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {filteredReport.length > 0 ? (
                          filteredReport.map((row, idx) => (
                            <motion.tr
                              key={row.templateId || idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              transition={{ delay: idx * 0.03 }}
                              className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}
                            >
                              <td className="px-4 py-3">
                                <div className="font-semibold text-gray-900 truncate max-w-[220px]">
                                  {clientMap[row.clientId]?.name || row.clientName || '--'}
                                </div>
                                <div className="text-xs text-gray-400">{row.workType}</div>
                              </td>
                              {reportMonths.map((m, mi) => {
                                const cellData = row.cells?.[mi];
                                const status = cellData?.status || 'Not Generated';
                                const cell = STATUS_CELL[status] || STATUS_CELL['Not Generated'];
                                return (
                                  <td key={m.key} className="px-3 py-3 text-center">
                                    <motion.div
                                      initial={{ scale: 0.8 }}
                                      animate={{ scale: 1 }}
                                      className={`w-8 h-8 rounded-lg mx-auto ${cell.bg} ring-2 ${cell.ring} cursor-default`}
                                      title={`${m.label}: ${cell.label}`}
                                    />
                                  </td>
                                );
                              })}
                            </motion.tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={reportMonths.length + 1}>
                              <EmptyState
                                icon={<CalendarClock size={48} className="text-gray-300 mx-auto" />}
                                title={loading ? 'Loading...' : 'No recurring tasks found'}
                                description="Create recurring templates in the Setup tab to see status here."
                              />
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </TabPanel>

          {/* Setup Tab */}
          <TabPanel>
            <RecurringSetup />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
