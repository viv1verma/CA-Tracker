import { motion } from 'framer-motion';
import { X, Printer, Mail, Building2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function currency(n) {
  if (n == null) return '--';
  return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

/* ------------------------------------------------------------------ */
/*  Salary Slip Modal                                                  */
/* ------------------------------------------------------------------ */

export default function SalarySlip({ isOpen, onClose, data, monthLabel }) {
  const toast = useToast();
  const [emailing, setEmailing] = useState(false);

  if (!data) return null;

  const {
    userName, designation, branch, employeeId,
    basic = 0, hra = 0, conveyance = 0, otherAllowance = 0,
    pf = 0, esi = 0, tds = 0, otherDeduction = 0, professionalTax = 0,
    workingDays = 0, presentDays = 0, leaveDays = 0, lateDays = 0,
    grossSalary, netPay, totalDeductions,
  } = data;

  const gross = grossSalary || (basic + hra + conveyance + otherAllowance);
  const deductions = totalDeductions || (pf + esi + tds + otherDeduction + professionalTax);
  const net = netPay || (gross - deductions);

  const earnings = [
    { label: 'Basic Salary', amount: basic },
    { label: 'House Rent Allowance (HRA)', amount: hra },
    { label: 'Conveyance Allowance', amount: conveyance },
    { label: 'Other Allowance', amount: otherAllowance },
  ];

  const deductionItems = [
    { label: 'Provident Fund (PF)', amount: pf },
    { label: 'ESI', amount: esi },
    { label: 'TDS', amount: tds },
    { label: 'Professional Tax', amount: professionalTax },
    { label: 'Other Deductions', amount: otherDeduction },
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = async () => {
    setEmailing(true);
    try {
      const userId = data.userId || data.id;
      const m = data.month;
      const y = data.year;
      await api('POST', `/salary/${userId}/${y}/${m}/email`);
      toast('Salary slip emailed successfully');
    } catch (err) {
      toast(err.message || 'Failed to email slip', 'error');
    } finally {
      setEmailing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Salary Slip" maxWidth="2xl">
      <div className="salary-slip-printable">
        {/* ============================================================ */}
        {/*  Company Header                                              */}
        {/* ============================================================ */}
        <div className="text-center pb-4 border-b-2 border-gray-800 mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Building2 size={24} className="text-blue-700" />
            <h2 className="text-xl font-bold text-gray-900">GARP & Associates</h2>
          </div>
          <p className="text-xs text-gray-500">Chartered Accountants</p>
          <p className="text-sm font-semibold text-gray-700 mt-2">
            Pay Slip for {monthLabel || `${data.month}/${data.year}`}
          </p>
        </div>

        {/* ============================================================ */}
        {/*  Employee Details                                            */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Employee Name</span>
            <span className="font-semibold text-gray-900">{userName || '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Designation</span>
            <span className="font-semibold text-gray-900">{designation || '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Branch</span>
            <span className="font-semibold text-gray-900">{branch || '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Employee ID</span>
            <span className="font-semibold text-gray-900">{employeeId || '--'}</span>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Earnings & Deductions Side by Side                          */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Earnings */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-emerald-50 px-4 py-2.5">
              <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Earnings</h4>
            </div>
            <div className="divide-y divide-gray-100">
              {earnings.map(e => (
                <div key={e.label} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-gray-600">{e.label}</span>
                  <span className="font-semibold text-gray-900">{currency(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 bg-emerald-50 text-sm">
                <span className="font-bold text-emerald-800">Gross Salary</span>
                <span className="font-bold text-emerald-800">{currency(gross)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-red-50 px-4 py-2.5">
              <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide">Deductions</h4>
            </div>
            <div className="divide-y divide-gray-100">
              {deductionItems.map(d => (
                <div key={d.label} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-gray-600">{d.label}</span>
                  <span className="font-semibold text-gray-900">{currency(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 bg-red-50 text-sm">
                <span className="font-bold text-red-800">Total Deductions</span>
                <span className="font-bold text-red-800">{currency(deductions)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Net Pay                                                     */}
        {/* ============================================================ */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-center mb-5"
        >
          <p className="text-blue-100 text-sm font-medium mb-1">Net Pay</p>
          <p className="text-3xl font-bold text-white">{currency(net)}</p>
        </motion.div>

        {/* ============================================================ */}
        {/*  Attendance Summary                                          */}
        {/* ============================================================ */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Working Days</p>
            <p className="text-lg font-bold text-gray-900">{workingDays}</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <p className="text-xs text-gray-500">Present</p>
            <p className="text-lg font-bold text-emerald-700">{presentDays}</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-xs text-gray-500">Leave</p>
            <p className="text-lg font-bold text-red-700">{leaveDays}</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-gray-500">Late</p>
            <p className="text-lg font-bold text-amber-700">{lateDays}</p>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Actions                                                     */}
        {/* ============================================================ */}
        <div className="flex gap-3 print:hidden">
          <button
            onClick={handleEmail}
            disabled={emailing}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {emailing ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Mail size={16} />
            )}
            {emailing ? 'Sending...' : 'Email Slip'}
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>
    </Modal>
  );
}
