import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import {
  Building2, Award, CalendarDays, Save, Plus, Edit2, Trash2,
  Upload, Users, FileText, Globe, Phone, Mail, MapPin,
  Briefcase, Calendar, X, RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useModal } from '../../hooks/useModal';
import { fmt } from '../../utils/format';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';

const EMPTY_PROFILE = {
  name: '',
  registrationNo: '',
  udin: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  members: [],
};

const EMPTY_MEMBER = {
  name: '',
  membershipNo: '',
  designation: '',
  copNo: '',
};

const EMPTY_EXPERIENCE = {
  clientName: '',
  nature: '',
  year: new Date().getFullYear(),
  type: '',
  turnover: '',
};

const HOLIDAY_TYPES = ['National', 'Office'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function FirmProfile() {
  const showToast = useToast();
  const [tabIndex, setTabIndex] = useState(0);

  // Profile state
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);

  // Experience state
  const [experiences, setExperiences] = useState([]);
  const [expLoading, setExpLoading] = useState(true);
  const expModal = useModal();
  const expDeleteModal = useModal();
  const [expForm, setExpForm] = useState(EMPTY_EXPERIENCE);
  const [expSaving, setExpSaving] = useState(false);

  // Holiday state
  const [holidays, setHolidays] = useState([]);
  const [holLoading, setHolLoading] = useState(true);
  const holModal = useModal();
  const holDeleteModal = useModal();
  const [holForm, setHolForm] = useState({ date: '', name: '', type: 'National' });
  const [holSaving, setHolSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Member modal
  const memberModal = useModal();
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER);

  // ========== Profile ==========
  useEffect(() => {
    (async () => {
      try {
        const res = await api('GET', '/firm-profile');
        if (res) setProfile({ ...EMPTY_PROFILE, ...res });
      } catch (e) { console.error(e); }
      finally { setProfileLoading(false); }
    })();
  }, []);

  const saveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      await api('PUT', '/firm-profile', profile);
      showToast('Profile saved');
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setProfileSaving(false);
    }
  }, [profile, showToast]);

  const addMember = useCallback(() => {
    if (!memberForm.name) return;
    setProfile(prev => ({
      ...prev,
      members: [...(prev.members || []), { ...memberForm, id: Date.now() }],
    }));
    memberModal.close();
    setMemberForm(EMPTY_MEMBER);
  }, [memberForm, memberModal]);

  const removeMember = useCallback((idx) => {
    setProfile(prev => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== idx),
    }));
  }, []);

  // Parse Card (file upload)
  const handleParseCard = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('card', file);
    try {
      const token = localStorage.getItem('garp_tok');
      const res = await fetch('/api/firm-profile/parse-card', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data && res.ok) {
        setProfile(prev => ({ ...prev, ...data }));
        showToast('Card parsed and applied');
      } else {
        showToast(data?.error || 'Parse failed', 'error');
      }
    } catch (e) {
      showToast('Upload failed', 'error');
    }
  }, [showToast]);

  // ========== Experience ==========
  const loadExperiences = useCallback(async () => {
    setExpLoading(true);
    try {
      const res = await api('GET', '/firm-profile/experience');
      if (res) setExperiences(Array.isArray(res) ? res : []);
    } catch (e) { console.error(e); }
    finally { setExpLoading(false); }
  }, []);

  useEffect(() => { loadExperiences(); }, [loadExperiences]);

  const handleExpSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!expForm.clientName || !expForm.nature) {
      showToast('Client and Nature are required', 'error');
      return;
    }
    setExpSaving(true);
    try {
      if (expModal.data) {
        await api('PUT', `/firm-profile/experience/${expModal.data.id}`, expForm);
        showToast('Experience updated');
      } else {
        await api('POST', '/firm-profile/experience', expForm);
        showToast('Experience added');
      }
      await loadExperiences();
      expModal.close();
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setExpSaving(false);
    }
  }, [expForm, expModal, loadExperiences, showToast]);

  const handleExpDelete = useCallback(async () => {
    if (!expDeleteModal.data) return;
    try {
      await api('DELETE', `/firm-profile/experience/${expDeleteModal.data.id}`);
      showToast('Experience deleted');
      await loadExperiences();
      expDeleteModal.close();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    }
  }, [expDeleteModal, loadExperiences, showToast]);

  const expStats = {
    total: experiences.length,
    types: [...new Set(experiences.map(e => e.type).filter(Boolean))].length,
    years: [...new Set(experiences.map(e => e.year).filter(Boolean))].length,
  };

  // ========== Holidays ==========
  const loadHolidays = useCallback(async () => {
    setHolLoading(true);
    try {
      const res = await api('GET', '/holidays');
      if (res) setHolidays(Array.isArray(res) ? res : []);
    } catch (e) { console.error(e); }
    finally { setHolLoading(false); }
  }, []);

  useEffect(() => { loadHolidays(); }, [loadHolidays]);

  const handleHolSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!holForm.date || !holForm.name) {
      showToast('Date and Name are required', 'error');
      return;
    }
    setHolSaving(true);
    try {
      await api('POST', '/holidays', holForm);
      showToast('Holiday added');
      await loadHolidays();
      holModal.close();
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setHolSaving(false);
    }
  }, [holForm, holModal, loadHolidays, showToast]);

  const handleHolDelete = useCallback(async () => {
    if (!holDeleteModal.data) return;
    try {
      await api('DELETE', `/holidays/${holDeleteModal.data.id}`);
      showToast('Holiday deleted');
      await loadHolidays();
      holDeleteModal.close();
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error');
    }
  }, [holDeleteModal, loadHolidays, showToast]);

  const seedHolidays = useCallback(async () => {
    setSeeding(true);
    try {
      await api('POST', '/holidays/seed-india');
      showToast('Holidays seeded from India calendar');
      await loadHolidays();
    } catch (e) {
      showToast(e.message || 'Seed failed', 'error');
    } finally {
      setSeeding(false);
    }
  }, [loadHolidays, showToast]);

  const tabLabels = [
    { icon: Building2, label: 'Profile' },
    { icon: Award, label: 'Experience' },
    { icon: CalendarDays, label: 'Holidays' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Firm Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage firm details, experience records, and holiday calendar</p>
      </div>

      <TabGroup selectedIndex={tabIndex} onChange={setTabIndex}>
        <TabList className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabLabels.map((t, i) => (
            <Tab
              key={i}
              className={({ selected }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all outline-none ${
                  selected ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <t.icon size={16} />
              {t.label}
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          {/* ====== Profile Tab ====== */}
          <TabPanel>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {profileLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Firm Details Form */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Building2 size={18} className="text-blue-600" />
                        Firm Details
                      </h3>
                      <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-violet-600 border border-violet-200 rounded-xl hover:bg-violet-50 transition-colors cursor-pointer">
                        <Upload size={14} />
                        Parse Card
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleParseCard} />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          <Building2 size={12} className="inline mr-1" />
                          Firm Name
                        </label>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Registration No</label>
                        <input
                          type="text"
                          value={profile.registrationNo}
                          onChange={e => setProfile(p => ({ ...p, registrationNo: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">UDIN</label>
                        <input
                          type="text"
                          value={profile.udin}
                          onChange={e => setProfile(p => ({ ...p, udin: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          <Phone size={12} className="inline mr-1" />
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={profile.phone}
                          onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          <Mail size={12} className="inline mr-1" />
                          Email
                        </label>
                        <input
                          type="email"
                          value={profile.email}
                          onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          <Globe size={12} className="inline mr-1" />
                          Website
                        </label>
                        <input
                          type="url"
                          value={profile.website}
                          onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          <MapPin size={12} className="inline mr-1" />
                          Address
                        </label>
                        <textarea
                          value={profile.address}
                          onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={saveProfile}
                        disabled={profileSaving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        <Save size={16} />
                        {profileSaving ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Users size={18} className="text-blue-600" />
                        Firm Members
                      </h3>
                      <button
                        onClick={() => { setMemberForm(EMPTY_MEMBER); memberModal.open(); }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={14} /> Add Member
                      </button>
                    </div>
                    {(profile.members || []).length === 0 ? (
                      <EmptyState title="No members added" description="Add firm members with their membership details." />
                    ) : (
                      <div className="space-y-2">
                        {profile.members.map((m, idx) => (
                          <div key={m.id || idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl group">
                            <Avatar name={m.name} size={32} />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 text-sm">{m.name}</div>
                              <div className="text-xs text-gray-500">
                                {m.designation || 'Member'} {m.membershipNo && `| M.No: ${m.membershipNo}`} {m.copNo && `| COP: ${m.copNo}`}
                              </div>
                            </div>
                            <button
                              onClick={() => removeMember(idx)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </TabPanel>

          {/* ====== Experience Tab ====== */}
          <TabPanel>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{expStats.total}</div>
                  <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Total Records</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{expStats.types}</div>
                  <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Unique Types</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{expStats.years}</div>
                  <div className="text-xs text-gray-500 font-semibold uppercase mt-1">Years Covered</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                <button
                  onClick={() => { setExpForm(EMPTY_EXPERIENCE); expModal.open(); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <Plus size={16} /> Add Experience
                </button>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nature</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Year</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Turnover</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {experiences.map((exp, idx) => (
                        <tr key={exp.id || idx} className={`${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'} hover:bg-blue-50/40 transition-colors`}>
                          <td className="px-4 py-3 font-semibold text-gray-900">{exp.clientName}</td>
                          <td className="px-4 py-3 text-gray-600">{exp.nature}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{exp.year}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              {exp.type || '--'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 font-mono text-xs">
                            {exp.turnover ? Number(exp.turnover).toLocaleString('en-IN') : '--'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setExpForm(exp); expModal.open(exp); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => expDeleteModal.open(exp)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {experiences.length === 0 && (
                  <div className="py-16">
                    <EmptyState
                      icon={<Award size={48} className="text-gray-300 mx-auto" />}
                      title="No experience records"
                      description="Add firm experience entries to build your profile."
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </TabPanel>

          {/* ====== Holidays Tab ====== */}
          <TabPanel>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Actions */}
              <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div className="text-sm text-gray-500">
                  {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} for {new Date().getFullYear()}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={seedHolidays}
                    disabled={seeding}
                    className="inline-flex items-center gap-2 px-3 py-2.5 border border-amber-200 text-amber-700 text-sm font-semibold rounded-xl hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={seeding ? 'animate-spin' : ''} />
                    {seeding ? 'Seeding...' : 'Seed India Holidays'}
                  </button>
                  <button
                    onClick={() => { setHolForm({ date: '', name: '', type: 'National' }); holModal.open(); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={16} /> Add Holiday
                  </button>
                </div>
              </div>

              {/* Holiday Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Day</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Holiday Name</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {holidays.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((h, idx) => {
                        const d = h.date ? new Date(h.date + 'T00:00:00') : null;
                        const dayName = d ? DAY_NAMES[d.getDay()] : '--';
                        return (
                          <tr key={h.id || idx} className={`${idx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'} hover:bg-blue-50/40 transition-colors`}>
                            <td className="px-4 py-3 font-semibold text-gray-900">{fmt(h.date)}</td>
                            <td className="px-4 py-3 text-gray-600">{dayName}</td>
                            <td className="px-4 py-3 text-gray-800">{h.name}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                h.type === 'National' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {h.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => holDeleteModal.open(h)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {holidays.length === 0 && (
                  <div className="py-16">
                    <EmptyState
                      icon={<CalendarDays size={48} className="text-gray-300 mx-auto" />}
                      title="No holidays defined"
                      description="Add holidays manually or seed from the India holiday calendar."
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* Member Modal */}
      <Modal isOpen={memberModal.isOpen} onClose={memberModal.close} title="Add Firm Member" maxWidth="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={memberForm.name}
              onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Membership No</label>
              <input
                type="text"
                value={memberForm.membershipNo}
                onChange={e => setMemberForm(p => ({ ...p, membershipNo: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">COP No</label>
              <input
                type="text"
                value={memberForm.copNo}
                onChange={e => setMemberForm(p => ({ ...p, copNo: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Designation</label>
            <input
              type="text"
              value={memberForm.designation}
              onChange={e => setMemberForm(p => ({ ...p, designation: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Partner, Senior Partner"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={memberModal.close} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={addMember} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Add Member</button>
          </div>
        </div>
      </Modal>

      {/* Experience Modal */}
      <Modal isOpen={expModal.isOpen} onClose={expModal.close} title={expModal.data ? 'Edit Experience' : 'Add Experience'} maxWidth="lg">
        <form onSubmit={handleExpSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Client Name *</label>
              <input
                type="text"
                value={expForm.clientName}
                onChange={e => setExpForm(p => ({ ...p, clientName: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nature of Work *</label>
              <input
                type="text"
                value={expForm.nature}
                onChange={e => setExpForm(p => ({ ...p, nature: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Year</label>
              <input
                type="number"
                value={expForm.year}
                onChange={e => setExpForm(p => ({ ...p, year: parseInt(e.target.value) || '' }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
              <input
                type="text"
                value={expForm.type}
                onChange={e => setExpForm(p => ({ ...p, type: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Audit, Tax, Advisory"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Turnover (INR)</label>
              <input
                type="number"
                value={expForm.turnover}
                onChange={e => setExpForm(p => ({ ...p, turnover: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={expModal.close} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={expSaving} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {expSaving ? 'Saving...' : expModal.data ? 'Update' : 'Add Experience'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Holiday Modal */}
      <Modal isOpen={holModal.isOpen} onClose={holModal.close} title="Add Holiday" maxWidth="md">
        <form onSubmit={handleHolSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={holForm.date}
              onChange={e => setHolForm(p => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Holiday Name *</label>
            <input
              type="text"
              value={holForm.name}
              onChange={e => setHolForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
            <select
              value={holForm.type}
              onChange={e => setHolForm(p => ({ ...p, type: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={holModal.close} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={holSaving} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {holSaving ? 'Adding...' : 'Add Holiday'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modals */}
      <ConfirmDialog
        isOpen={expDeleteModal.isOpen}
        onClose={expDeleteModal.close}
        onConfirm={handleExpDelete}
        title="Delete Experience"
        message={`Remove "${expDeleteModal.data?.clientName}" from experience records?`}
        confirmText="Delete"
        confirmColor="red"
      />
      <ConfirmDialog
        isOpen={holDeleteModal.isOpen}
        onClose={holDeleteModal.close}
        onConfirm={handleHolDelete}
        title="Delete Holiday"
        message={`Remove "${holDeleteModal.data?.name}" from the holiday calendar?`}
        confirmText="Delete"
        confirmColor="red"
      />
    </div>
  );
}
