import { useState, useEffect, useMemo } from 'react';
import Modal from '../../components/ui/Modal';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  User, Briefcase, Wallet, KeyRound, Shield,
} from 'lucide-react';

const QUALIFICATIONS = ['CA', 'CS', 'CMA', 'LLB', 'MBA', 'B.Com', 'Other'];
const BRANCHES = ['Greater Noida (HO)', 'Noida', 'Delhi', 'Ghaziabad'];

export default function UserForm({ isOpen, onClose, user: editUser, onSaved }) {
  const showToast = useToast();
  const isEdit = !!editUser;

  const [form, setForm] = useState({
    name: '', email: '', mobile: '', dob: '', anniversary: '',
    designation: '', qualification: 'CA', branch: 'Greater Noida (HO)', joiningDate: '',
    basicSalary: 0, hra: 0, conveyance: 0, otherAllowance: 0, openingLeave: 0,
    username: '', password: '', role: 'member',
    itrAdmin: false, hrAdmin: false, payrollAccess: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editUser) {
      setForm({
        name: editUser.name || '',
        email: editUser.email || '',
        mobile: editUser.mobile || '',
        dob: editUser.dob || '',
        anniversary: editUser.anniversary || '',
        designation: editUser.designation || '',
        qualification: editUser.qualification || 'CA',
        branch: editUser.branch || 'Greater Noida (HO)',
        joiningDate: editUser.joiningDate || '',
        basicSalary: editUser.basicSalary || 0,
        hra: editUser.hra || 0,
        conveyance: editUser.conveyance || 0,
        otherAllowance: editUser.otherAllowance || 0,
        openingLeave: editUser.openingLeave || 0,
        username: editUser.username || '',
        password: '',
        role: editUser.role || 'member',
        itrAdmin: !!editUser.itrAdmin,
        hrAdmin: !!editUser.hrAdmin,
        payrollAccess: !!editUser.payrollAccess,
      });
    } else {
      setForm({
        name: '', email: '', mobile: '', dob: '', anniversary: '',
        designation: '', qualification: 'CA', branch: 'Greater Noida (HO)', joiningDate: '',
        basicSalary: 0, hra: 0, conveyance: 0, otherAllowance: 0, openingLeave: 0,
        username: '', password: '', role: 'member',
        itrAdmin: false, hrAdmin: false, payrollAccess: false,
      });
    }
  }, [editUser, isOpen]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const gross = useMemo(() =>
    (parseFloat(form.basicSalary) || 0) + (parseFloat(form.hra) || 0) +
    (parseFloat(form.conveyance) || 0) + (parseFloat(form.otherAllowance) || 0),
    [form.basicSalary, form.hra, form.conveyance, form.otherAllowance]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim()) {
      showToast('Name and username are required', 'error');
      return;
    }
    if (!isEdit && !form.password) {
      showToast('Password is required', 'error');
      return;
    }
    if (form.password && form.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        username: form.username.trim(),
        role: form.role,
        designation: form.designation.trim(),
        qualification: form.qualification,
        branch: form.branch,
        joiningDate: form.joiningDate,
        dob: form.dob,
        anniversary: form.anniversary,
        email: (form.email || '').trim(),
        mobile: (form.mobile || '').trim(),
        openingLeave: parseFloat(form.openingLeave) || 0,
        basicSalary: parseFloat(form.basicSalary) || 0,
        hra: parseFloat(form.hra) || 0,
        conveyance: parseFloat(form.conveyance) || 0,
        otherAllowance: parseFloat(form.otherAllowance) || 0,
        itrAdmin: !!form.itrAdmin,
        hrAdmin: !!form.hrAdmin,
        payrollAccess: !!form.payrollAccess,
      };
      if (form.password) data.password = form.password;

      let result;
      if (isEdit) {
        result = await api('PUT', `/users/${editUser.id}`, data);
        showToast('Member updated');
      } else {
        result = await api('POST', '/users', data);
        showToast(`Created: ${form.username} / ${form.password}`);
      }
      onSaved(result, isEdit);
      onClose();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectCls = `${inputCls} bg-white`;
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Member' : 'Add Team Member'} maxWidth="2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Info */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <User size={16} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Personal Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Full Name *</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="email@example.com" />
            </div>
            <div>
              <label className={labelCls}>Mobile</label>
              <input type="text" value={form.mobile} onChange={e => set('mobile', e.target.value)} className={inputCls} placeholder="Phone number" />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Anniversary</label>
              <input type="date" value={form.anniversary} onChange={e => set('anniversary', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Work Info */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Briefcase size={16} className="text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Work Information</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Designation</label>
              <input type="text" value={form.designation} onChange={e => set('designation', e.target.value)} className={inputCls} placeholder="e.g. Senior Associate" />
            </div>
            <div>
              <label className={labelCls}>Qualification</label>
              <select value={form.qualification} onChange={e => set('qualification', e.target.value)} className={selectCls}>
                {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Branch</label>
              <select value={form.branch} onChange={e => set('branch', e.target.value)} className={selectCls}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Joining Date</label>
              <input type="date" value={form.joiningDate} onChange={e => set('joiningDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Opening Leave Balance</label>
              <input type="number" value={form.openingLeave} onChange={e => set('openingLeave', e.target.value)} className={inputCls} min="0" step="0.5" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Salary */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Wallet size={16} className="text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Salary Components</h3>
            </div>
            <span className="text-sm font-bold text-blue-600">
              Gross: {'\u20B9'}{gross.toLocaleString('en-IN')}/month
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Basic</label>
              <input type="number" value={form.basicSalary} onChange={e => set('basicSalary', e.target.value)} className={inputCls} min="0" />
            </div>
            <div>
              <label className={labelCls}>HRA</label>
              <input type="number" value={form.hra} onChange={e => set('hra', e.target.value)} className={inputCls} min="0" />
            </div>
            <div>
              <label className={labelCls}>Conveyance</label>
              <input type="number" value={form.conveyance} onChange={e => set('conveyance', e.target.value)} className={inputCls} min="0" />
            </div>
            <div>
              <label className={labelCls}>Other</label>
              <input type="number" value={form.otherAllowance} onChange={e => set('otherAllowance', e.target.value)} className={inputCls} min="0" />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Login & Role */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <KeyRound size={16} className="text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Login & Permissions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Username *</label>
              <input type="text" value={form.username} onChange={e => set('username', e.target.value)} className={inputCls} placeholder="Login username" />
            </div>
            <div>
              <label className={labelCls}>{isEdit ? 'New Password' : 'Password *'}</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} placeholder={isEdit ? 'Leave blank to keep' : 'Min 6 characters'} />
              {isEdit && <p className="text-xs text-gray-400 mt-1">Leave blank to keep current password</p>}
            </div>
          </div>

          {/* Role */}
          <div className="mt-4">
            <label className={labelCls}>Role</label>
            <div className="flex gap-3 mt-1">
              {[
                { value: 'admin', label: 'Admin', desc: 'Full access', icon: Shield },
                { value: 'member', label: 'Member', desc: 'Standard access', icon: User },
              ].map(r => (
                <label
                  key={r.value}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    form.role === r.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={e => set('role', e.target.value)}
                    className="sr-only"
                  />
                  <r.icon size={18} className={form.role === r.value ? 'text-blue-600' : 'text-gray-400'} />
                  <div>
                    <p className={`text-sm font-bold ${form.role === r.value ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</p>
                    <p className="text-xs text-gray-400">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Permission toggles */}
          <div className="mt-4 space-y-3">
            {[
              { key: 'itrAdmin', label: 'ITR Admin', desc: 'Manage ITR filing and client parties' },
              { key: 'hrAdmin', label: 'HR Admin', desc: 'Manage team, attendance, and leave' },
              { key: 'payrollAccess', label: 'Payroll Access', desc: 'View salary and payroll data' },
            ].map(p => (
              <label key={p.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer group hover:bg-gray-100 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{p.label}</p>
                  <p className="text-xs text-gray-400">{p.desc}</p>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={form[p.key]}
                    onChange={e => set(p.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-blue-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
            {saving ? 'Saving...' : isEdit ? 'Update Member' : 'Add Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
