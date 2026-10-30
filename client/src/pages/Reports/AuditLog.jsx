import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ScrollText, Search, Filter, X, ChevronDown,
} from 'lucide-react';
import { api } from '../../api/client';
import { useData } from '../../context/DataContext';
import { fmtDT } from '../../utils/format';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

const ENTITY_TYPES = [
  'assignment', 'client', 'user', 'recurring-template', 'itr-party',
  'leave', 'attendance', 'notification', 'firm-profile', 'holiday',
];

const ACTION_BADGES = {
  created: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  updated: { bg: 'bg-blue-100', text: 'text-blue-700' },
  deleted: { bg: 'bg-red-100', text: 'text-red-700' },
  approved: { bg: 'bg-teal-100', text: 'text-teal-700' },
  rejected: { bg: 'bg-orange-100', text: 'text-orange-700' },
  login: { bg: 'bg-violet-100', text: 'text-violet-700' },
  exported: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
};

const LIMIT = 200;

export default function AuditLog() {
  const navigate = useNavigate();
  const { users } = useData();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [entityFilter, setEntityFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (entityFilter) params.set('entity', entityFilter);
    if (actorFilter) params.set('actorId', actorFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (search) params.set('q', search);
    params.set('limit', LIMIT);
    params.set('offset', page * LIMIT);
    return params.toString();
  }, [entityFilter, actorFilter, dateFrom, dateTo, search, page]);

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const query = buildQuery();
      const res = await api('GET', `/audit-log?${query}`);
      if (res) {
        // Backend returns { total, entries, entities, actors }
        const items = Array.isArray(res) ? res : (res.entries || res.items || []);
        if (reset) {
          setLogs(items);
        } else {
          setLogs(prev => [...prev, ...items]);
        }
        setHasMore(items.length >= LIMIT);
      }
    } catch (e) {
      console.error('Failed to load audit log:', e);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Load on filter change
  useEffect(() => {
    setPage(0);
    setLogs([]);
    setHasMore(true);
  }, [entityFilter, actorFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    loadLogs(page === 0);
  }, [page, entityFilter, actorFilter, dateFrom, dateTo, search, loadLogs]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          setPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [hasMore, loading]);

  const resetFilters = () => {
    setEntityFilter('');
    setActorFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  const hasFilters = entityFilter || actorFilter || dateFrom || dateTo || search;

  const getActionBadge = (action) => {
    const lower = (action || '').toLowerCase();
    const matched = Object.entries(ACTION_BADGES).find(([key]) => lower.includes(key));
    return matched ? matched[1] : { bg: 'bg-gray-100', text: 'text-gray-600' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-1">Activity log and change history</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Entity Type</label>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Entities</option>
            {ENTITY_TYPES.map(e => (
              <option key={e} value={e}>{e.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Actor</label>
          <select
            value={actorFilter}
            onChange={e => setActorFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="px-3 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Log Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actor</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Action</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-28">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {logs.map((log, idx) => {
                  const badge = getActionBadge(log.action);
                  return (
                    <motion.tr
                      key={log.id || idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.01, 0.5) }}
                      className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDT(log.at || log.createdAt || log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={log.actorName || log.actor || 'System'} size={24} />
                          <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">
                            {log.actorName || log.actor || 'System'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badge.bg} ${badge.text}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {log.entity || log.entityType || '--'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 truncate max-w-[180px]">
                        {log.label || log.subject || log.entityName || '--'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[200px]">
                        {log.details || log.description || '--'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                        {log.ip || '--'}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {!loading && logs.length === 0 && (
          <div className="py-16">
            <EmptyState
              icon={<ScrollText size={48} className="text-gray-300 mx-auto" />}
              title={hasFilters ? 'No matching logs' : 'No audit logs yet'}
              description={hasFilters ? 'Try adjusting your filters.' : 'Activity will be recorded as the system is used.'}
            />
          </div>
        )}

        {/* Loading / Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!hasMore && logs.length > 0 && (
          <div className="text-center py-4 text-xs text-gray-400">
            Showing all {logs.length} entries
          </div>
        )}
      </div>
    </div>
  );
}
