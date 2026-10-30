import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  IndianRupee, CreditCard, Clock, TrendingUp,
  Filter, Search, ChevronDown, FileText, X, Download,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';

const FY_OPTIONS = (() => {
  const yr = new Date().getFullYear();
  const opts = [];
  for (let y = yr; y >= yr - 3; y--) {
    opts.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return opts;
})();

function formatINR(num) {
  if (!num && num !== 0) return '--';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

export default function ClientBilling() {
  const { user } = useAuth();
  const showToast = useToast();
  const invoiceModal = useModal();

  const [dashboard, setDashboard] = useState(null);
  const [billingSeries, setBillingSeries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bankPosition, setBankPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fyFilter, setFyFilter] = useState(FY_OPTIONS[0]);
  const [customerFilter, setCustomerFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fyFilter) params.set('fy', fyFilter);
      if (customerFilter) params.set('customer', customerFilter);

      const [dashRes, seriesRes, pivotRes, bankRes] = await Promise.allSettled([
        api('GET', `/client/invoice-dashboard?${params}`),
        api('GET', `/client/billing-series?${params}`),
        api('GET', `/client/billing-pivot?${params}`),
        api('GET', `/client/bank-position?${params}`),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value) setDashboard(dashRes.value);
      if (seriesRes.status === 'fulfilled' && seriesRes.value) setBillingSeries(Array.isArray(seriesRes.value) ? seriesRes.value : []);
      if (pivotRes.status === 'fulfilled' && pivotRes.value) setInvoices(Array.isArray(pivotRes.value) ? pivotRes.value : []);
      if (bankRes.status === 'fulfilled' && bankRes.value) setBankPosition(bankRes.value);
    } catch (e) {
      console.error('Failed to load billing data:', e);
    } finally {
      setLoading(false);
    }
  }, [fyFilter, customerFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredInvoices = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(inv =>
      (inv.invoiceNo || '').toLowerCase().includes(q) ||
      (inv.description || '').toLowerCase().includes(q) ||
      (inv.customerName || '').toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const customers = useMemo(() => {
    const set = new Set(invoices.map(i => i.customerName).filter(Boolean));
    return [...set].sort();
  }, [invoices]);

  const stats = dashboard || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Payments</h1>
          <p className="text-sm text-gray-500 mt-1">Track invoices, payments, and outstanding balances</p>
        </div>
        <div className="flex gap-2">
          <select
            value={fyFilter}
            onChange={e => setFyFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {FY_OPTIONS.map(fy => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <IndianRupee size={18} className="text-blue-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase">Total Billed</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatINR(stats.totalBilled)}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CreditCard size={18} className="text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase">Received</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatINR(stats.totalReceived)}</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-200 p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock size={18} className="text-amber-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase">Pending</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatINR(stats.totalPending)}</div>
        </motion.div>
      </div>

      {/* Monthly Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-gray-200 p-5"
      >
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-blue-600" />
          Monthly Billing
        </h3>
        {billingSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={billingSeries} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(value) => [formatINR(value)]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="billed" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Billed" />
              <Bar dataKey="received" fill="#10b981" radius={[4, 4, 0, 0]} name="Received" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No billing data available</div>
        )}
      </motion.div>

      {/* Invoice Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          {customers.length > 1 && (
            <select
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Customers</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredInvoices.map((inv, idx) => {
                  const balance = (inv.amount || 0) - (inv.received || 0);
                  const isPaid = balance <= 0;
                  return (
                    <tr
                      key={inv.id || idx}
                      onClick={() => invoiceModal.open(inv)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3 font-semibold text-blue-600">{inv.invoiceNo || `INV-${idx + 1}`}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.date || '--'}</td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]">{inv.description || inv.workType || '--'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-800">{formatINR(inv.amount)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatINR(inv.received)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600">{formatINR(balance)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredInvoices.length === 0 && (
            <div className="py-16">
              <EmptyState
                icon={<FileText size={48} className="text-gray-300 mx-auto" />}
                title="No invoices found"
                description="Your invoices will appear here once generated."
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Bank Position */}
      {bankPosition && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {Object.entries(bankPosition).map(([key, value]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-xs text-gray-400 font-semibold uppercase mb-1">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className="text-lg font-bold text-gray-900">{typeof value === 'number' ? formatINR(value) : value}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={invoiceModal.isOpen}
        onClose={invoiceModal.close}
        title={`Invoice ${invoiceModal.data?.invoiceNo || ''}`}
        maxWidth="lg"
      >
        {invoiceModal.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Invoice No</div>
                <div className="font-semibold text-gray-900">{invoiceModal.data.invoiceNo || '--'}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Date</div>
                <div className="text-sm text-gray-700">{invoiceModal.data.date || '--'}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Amount</div>
                <div className="font-bold text-gray-900">{formatINR(invoiceModal.data.amount)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Received</div>
                <div className="font-bold text-emerald-600">{formatINR(invoiceModal.data.received)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Balance</div>
                <div className="font-bold text-amber-600">
                  {formatINR((invoiceModal.data.amount || 0) - (invoiceModal.data.received || 0))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold uppercase">Description</div>
                <div className="text-sm text-gray-700">{invoiceModal.data.description || '--'}</div>
              </div>
            </div>
            {invoiceModal.data.lineItems && invoiceModal.data.lineItems.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2">Line Items</h4>
                <div className="space-y-1">
                  {invoiceModal.data.lineItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">{item.description || item.name}</span>
                      <span className="font-mono text-gray-800">{formatINR(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
