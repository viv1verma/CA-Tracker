import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Lock, Shield, Bell, Clock, CalendarDays, Users,
  Save, Eye, EyeOff, Check, X, Send, RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const NOTIFICATION_EVENTS = [
  { key: 'assignment_created', label: 'Assignment Created' },
  { key: 'assignment_updated', label: 'Assignment Updated' },
  { key: 'assignment_completed', label: 'Assignment Completed' },
  { key: 'assignment_overdue', label: 'Assignment Overdue' },
  { key: 'due_date_request', label: 'Due Date Change Request' },
  { key: 'due_date_approved', label: 'Due Date Change Approved' },
  { key: 'reopen_request', label: 'Reopen Request' },
  { key: 'reopen_approved', label: 'Reopen Approved' },
  { key: 'comment_added', label: 'Comment Added' },
  { key: 'leave_request', label: 'Leave Request' },
  { key: 'leave_approved', label: 'Leave Approved/Rejected' },
  { key: 'attendance_late', label: 'Late Attendance' },
  { key: 'itr_stage_change', label: 'ITR Stage Changed' },
  { key: 'itr_filed', label: 'ITR Filed' },
  { key: 'recurring_generated', label: 'Recurring Task Generated' },
  { key: 'client_comment', label: 'Client Comment' },
  { key: 'system_alert', label: 'System Alert' },
];

const CHANNELS = ['push', 'inapp', 'email', 'sms', 'whatsapp'];
const CHANNEL_LABELS = { push: 'Push', inapp: 'In-App', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };

const SAT_OFF_OPTIONS = [
  { value: '2,4', label: '2nd & 4th Saturday' },
  { value: '1,3', label: '1st & 3rd Saturday' },
  { value: 'all', label: 'All Saturdays' },
  { value: 'none', label: 'No Saturday Off' },
];

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const showToast = useToast();

  // Password
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Rules
  const [rules, setRules] = useState(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);

  // Notification Config
  const [notifConfig, setNotifConfig] = useState({});
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [testing, setTesting] = useState(null);

  // Load rules
  useEffect(() => {
    if (!isAdmin) { setRulesLoading(false); return; }
    (async () => {
      try {
        const res = await api('GET', '/rules');
        if (res) setRules(res);
      } catch (e) { console.error(e); }
      finally { setRulesLoading(false); }
    })();
  }, [isAdmin]);

  // Load notification config
  useEffect(() => {
    if (!isAdmin) { setNotifLoading(false); return; }
    (async () => {
      try {
        const res = await api('GET', '/notification-config');
        if (res) setNotifConfig(res.events || res);
      } catch (e) { console.error(e); }
      finally { setNotifLoading(false); }
    })();
  }, [isAdmin]);

  // Change Password
  const handlePasswordChange = useCallback(async (e) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (pwForm.newPw.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setPwSaving(true);
    try {
      await api('PUT', `/users/${user.id}`, {
        currentPassword: pwForm.current,
        password: pwForm.newPw,
      });
      showToast('Password changed successfully');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (e) {
      showToast(e.message || 'Password change failed', 'error');
    } finally {
      setPwSaving(false);
    }
  }, [pwForm, user, showToast]);

  // Save Rules
  const saveRules = useCallback(async () => {
    if (!rules) return;
    setRulesSaving(true);
    try {
      await api('PUT', '/rules', rules);
      showToast('Office rules saved');
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setRulesSaving(false);
    }
  }, [rules, showToast]);

  // Save Notification Config — backend expects per-event PUT /notification-config/:eventKey
  const saveNotifConfig = useCallback(async () => {
    setNotifSaving(true);
    try {
      const promises = Object.entries(notifConfig).map(([eventKey, channels]) =>
        api('PUT', `/notification-config/${eventKey}`, channels)
      );
      await Promise.all(promises);
      showToast('Notification settings saved');
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setNotifSaving(false);
    }
  }, [notifConfig, showToast]);

  // Toggle notification channel
  const toggleChannel = (eventKey, channel) => {
    setNotifConfig(prev => {
      const eventConf = prev[eventKey] || {};
      return {
        ...prev,
        [eventKey]: {
          ...eventConf,
          [channel]: !eventConf[channel],
        },
      };
    });
  };

  // Test notification
  const testEvent = useCallback(async (eventKey) => {
    setTesting(eventKey);
    try {
      await api('POST', '/notification-config/test', { eventKey });
      showToast('Test notification sent');
    } catch (e) {
      showToast(e.message || 'Test failed', 'error');
    } finally {
      setTesting(null);
    }
  }, [showToast]);

  const updateRule = (path, value) => {
    setRules(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let obj = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return updated;
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage account settings, office rules, and notifications</p>
      </div>

      {/* ====== Change Password ====== */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200 p-6"
      >
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-5">
          <Lock size={20} className="text-blue-600" />
          Change Password
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pwForm.current}
                onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pwForm.newPw}
              onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {pwForm.confirm && pwForm.newPw !== pwForm.confirm && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <button
            type="submit"
            disabled={pwSaving || !pwForm.current || !pwForm.newPw || pwForm.newPw !== pwForm.confirm}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {pwSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </motion.div>

      {/* ====== Office Rules (Admin Only) ====== */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Shield size={20} className="text-emerald-600" />
              Office Rules
            </h2>
            <button
              onClick={saveRules}
              disabled={rulesSaving || !rules}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {rulesSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </div>

          {rulesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !rules ? (
            <p className="text-sm text-gray-500">Unable to load rules. The server may not support this feature yet.</p>
          ) : (
            <div className="space-y-6">
              {/* Office Timing */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-gray-400" />
                  Office Timing
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">In Time</label>
                    <input
                      type="time"
                      value={rules.officeIn || '09:30'}
                      onChange={e => updateRule('officeIn', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Out Time</label>
                    <input
                      type="time"
                      value={rules.officeOut || '18:30'}
                      onChange={e => updateRule('officeOut', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Grace Period (min)</label>
                    <input
                      type="number"
                      value={rules.gracePeriod ?? 15}
                      onChange={e => updateRule('gracePeriod', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Leave Policy */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
                  <CalendarDays size={14} className="text-gray-400" />
                  Leave Policy
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Paid Leaves / Year</label>
                    <input
                      type="number"
                      value={rules.paidLeavesPerYear ?? 12}
                      onChange={e => updateRule('paidLeavesPerYear', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Carry Forward Max</label>
                    <input
                      type="number"
                      value={rules.carryForwardMax ?? 5}
                      onChange={e => updateRule('carryForwardMax', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Notice Days</label>
                    <input
                      type="number"
                      value={rules.noticeDays ?? 2}
                      onChange={e => updateRule('noticeDays', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Attendance */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
                  <Users size={14} className="text-gray-400" />
                  Attendance
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Full Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={rules.fullDayHours ?? 8}
                      onChange={e => updateRule('fullDayHours', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Half Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={rules.halfDayHours ?? 4}
                      onChange={e => updateRule('halfDayHours', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Late Marks per Half Day</label>
                    <input
                      type="number"
                      value={rules.lateMarksPerHalfDay ?? 3}
                      onChange={e => updateRule('lateMarksPerHalfDay', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Week Off */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Week Off</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rules.sundayOff !== false}
                      onChange={e => updateRule('sundayOff', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Sunday Off</span>
                  </label>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Saturday Off Weeks</label>
                    <select
                      value={rules.saturdayOff || '2,4'}
                      onChange={e => updateRule('saturdayOff', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SAT_OFF_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Comp-off */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3">Compensatory Off</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rules.compOffEnabled !== false}
                      onChange={e => updateRule('compOffEnabled', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Enable Comp-Off</span>
                  </label>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Comp-Off Expiry (days)</label>
                    <input
                      type="number"
                      value={rules.compOffExpiryDays ?? 30}
                      onChange={e => updateRule('compOffExpiryDays', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ====== Notification Config (Admin Only) ====== */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Bell size={20} className="text-amber-600" />
              Notification Configuration
            </h2>
            <button
              onClick={saveNotifConfig}
              disabled={notifSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {notifSaving ? 'Saving...' : 'Save Config'}
            </button>
          </div>

          {notifLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Event</th>
                    {CHANNELS.map(ch => (
                      <th key={ch} className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {CHANNEL_LABELS[ch]}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Test</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {NOTIFICATION_EVENTS.map((event, idx) => (
                    <tr key={event.key} className={idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">{event.label}</td>
                      {CHANNELS.map(ch => {
                        const isOn = !!(notifConfig[event.key]?.[ch]);
                        return (
                          <td key={ch} className="px-3 py-3 text-center">
                            <button
                              onClick={() => toggleChannel(event.key, ch)}
                              className={`
                                relative w-10 h-5 rounded-full transition-colors
                                ${isOn ? 'bg-blue-600' : 'bg-gray-200'}
                              `}
                            >
                              <span
                                className={`
                                  absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                                  ${isOn ? 'translate-x-5' : 'translate-x-0'}
                                `}
                              />
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => testEvent(event.key)}
                          disabled={testing === event.key}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                          title="Send test notification"
                        >
                          {testing === event.key ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
