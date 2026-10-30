import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { RecurringTemplate, StatutoryItem } from '../../data/types';
import { colors, font, radius, spacing } from '../../theme/theme';
import { MANUAL_WORK_TYPE, PRIORITY_OPTIONS, WORK_TYPES, memberUsers } from '../assignments/logic';
import { FREQUENCIES } from './logic';

/**
 * openRecSheet() / saveRecurring() / applyStatutory(). Creating offers the web's
 * two modes — a custom template, or a tick-list of statutory obligations applied
 * across the selected clients. Editing shows the custom form only, on one client.
 */
type Mode = 'custom' | 'statutory';

export default function RecurringTemplateSheet({
  editId, visible, onClose,
}: { editId: string | null; visible: boolean; onClose: () => void }) {
  const { clients, users, recurringTemplates, upsertTemplate, reload } = useData();
  const { showToast } = useToast();
  const editing = !!editId;
  const existing = editing ? recurringTemplates.find((t) => t.id === editId) : undefined;

  const [mode, setMode] = useState<Mode>('custom');
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [reportingId, setReportingId] = useState('');
  const [workSel, setWorkSel] = useState('');
  const [workManual, setWorkManual] = useState('');
  const [priority, setPriority] = useState<string>('Normal');
  const [dueDay, setDueDay] = useState('');
  const [frequency, setFrequency] = useState<string>('Monthly');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState('1');
  const [saving, setSaving] = useState(false);

  // Statutory mode
  const [catalog, setCatalog] = useState<StatutoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [catalogError, setCatalogError] = useState('');

  const members = useMemo(
    () => memberUsers(users).map((u) => ({ value: u.id, label: u.name, sub: u.designation })),
    [users],
  );

  useEffect(() => {
    if (!visible) return;
    setMode('custom');
    setCodes(new Set());
    setClientSearch('');
    if (existing) {
      setSelectedClients(new Set([existing.clientId]));
      setMemberId(existing.memberId);
      setReportingId(existing.reportingPersonId || '');
      if (WORK_TYPES.includes(existing.workType)) { setWorkSel(existing.workType); setWorkManual(''); }
      else { setWorkSel(MANUAL_WORK_TYPE); setWorkManual(existing.workType); }
      setPriority(existing.priority || 'Normal');
      setDueDay(String(existing.dueDayOfMonth ?? ''));
      setFrequency(existing.frequency || 'Monthly');
      setNotes(existing.notes || '');
      setActive(existing.active ? '1' : '0');
    } else {
      setSelectedClients(new Set());
      setMemberId(''); setReportingId('');
      setWorkSel(''); setWorkManual('');
      setPriority('Normal'); setDueDay(''); setFrequency('Monthly'); setNotes(''); setActive('1');
    }
  }, [visible, existing?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** The catalogue is fetched the first time statutory mode is opened. */
  const loadCatalog = async () => {
    if (catalog.length || catalogState === 'loading') return;
    setCatalogState('loading');
    try {
      const r = await api.get<{ catalog: StatutoryItem[]; categories: string[] }>(endpoints.statutoryCatalog);
      setCatalog(r.catalog || []);
      setCategories(r.categories || []);
      setCatalogState('idle');
    } catch (e) {
      setCatalogError(e instanceof ApiError ? e.message : 'Could not load the statutory calendar');
      setCatalogState('error');
    }
  };

  const shownClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const sorted = clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;
  }, [clients, clientSearch]);

  const toggleClient = (id: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCode = (code: string) => {
    setCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const saveCustom = async () => {
    const workType = workSel === MANUAL_WORK_TYPE ? workManual.trim() : workSel;
    // Validation order copied from saveRecurring().
    if (!workType) { showToast('Select or enter work type', 'error'); return; }
    if (!memberId) { showToast('Select team member', 'error'); return; }
    if (!dueDay) { showToast('Select due day', 'error'); return; }

    const member = users.find((u) => u.id === memberId);
    const rep = users.find((u) => u.id === reportingId);
    const base = {
      memberId,
      memberName: member?.name || '',
      reportingPersonId: reportingId || null,
      reportingPersonName: rep?.name || null,
      workType,
      priority,
      dueDayOfMonth: parseInt(dueDay, 10),
      notes,
      frequency,
      active: editing ? active === '1' : true,
    };

    setSaving(true);
    try {
      if (editing && existing) {
        const u = await api.put<RecurringTemplate>(
          endpoints.recurringTemplate(existing.id), { ...base, clientId: existing.clientId },
        );
        upsertTemplate({ ...existing, ...u });
        // A changed assignee moves open tasks server-side; refresh to pick that up.
        await reload({ showSpinner: false });
        showToast(u?.reassignedCount
          ? `Updated ✓ · ${u.reassignedCount} open task(s) moved`
          : 'Updated ✓');
      } else {
        const ids = [...selectedClients];
        if (!ids.length) { showToast('Select at least one client', 'error'); return; }
        let created = 0;
        for (const clientId of ids) {
          const cl = clients.find((c) => c.id === clientId);
          const t = await api.post<RecurringTemplate>(endpoints.recurringTemplates, {
            ...base, clientId, clientName: cl?.name || '',
          });
          upsertTemplate(t);
          created++;
        }
        // Creating a template generates this period's task; reload to show it.
        await reload({ showSpinner: false });
        showToast(`${created} recurring task${created > 1 ? 's' : ''} created ✓`);
      }
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveStatutory = async () => {
    const clientIds = [...selectedClients];
    if (!clientIds.length) { showToast('Select at least one client', 'error'); return; }
    if (!memberId) { showToast('Select who to assign to', 'error'); return; }
    if (!codes.size) { showToast('Tick at least one obligation', 'error'); return; }

    const member = users.find((u) => u.id === memberId);
    const rep = users.find((u) => u.id === reportingId);
    setSaving(true);
    try {
      const r = await api.post<{ created?: number; clients?: number; skipped?: number }>(
        endpoints.statutoryApply,
        {
          clientIds,
          memberId,
          memberName: member?.name || '',
          reportingPersonId: reportingId || null,
          reportingPersonName: rep?.name || null,
          codes: [...codes],
        },
      );
      await reload({ showSpinner: false });
      onClose();
      const n = r.created || 0;
      const c = r.clients || clientIds.length;
      showToast(`${n} recurring task${n === 1 ? '' : 's'} created across ${c} client${c === 1 ? '' : 's'}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not apply', 'error');
    } finally {
      setSaving(false);
    }
  };

  const statutory = mode === 'statutory' && !editing;
  const saveLabel = statutory ? 'Create Recurring Tasks' : editing ? 'Update' : 'Add Task';

  return (
    <Sheet
      visible={visible}
      title={editing ? 'Edit Recurring Task' : '🔄 Add Recurring Task'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title={saveLabel} onPress={statutory ? saveStatutory : saveCustom} loading={saving} />
          </View>
        </>
      }
    >
      {/* Mode switch — creation only, exactly as the web hides it when editing */}
      {!editing && (
        <View style={styles.modeRow}>
          {(['custom', 'statutory'] as Mode[]).map((m) => {
            const on = m === mode;
            return (
              <Pressable
                key={m}
                onPress={() => { setMode(m); if (m === 'statutory') void loadCatalog(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.modeBtn, on && styles.modeBtnOn]}
              >
                <Text style={[styles.modeText, on && styles.modeTextOn]}>
                  {m === 'custom' ? 'Custom' : '📅 Statutory'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Client picker: multi when creating, fixed when editing */}
      {editing ? (
        <Field label="Client">
          <View style={styles.readonly}>
            <Text style={styles.readonlyText}>
              {clients.find((c) => c.id === existing?.clientId)?.name || '—'}
            </Text>
          </View>
        </Field>
      ) : (
        <Field label="Client(s) *" hint="select one or more">
          <TextInput
            value={clientSearch}
            onChangeText={setClientSearch}
            placeholder="🔍 Search clients…"
            placeholderTextColor={colors.muted}
            style={styles.search}
          />
          <View style={styles.list}>
            {shownClients.length === 0 && <Text style={styles.listEmpty}>No clients found</Text>}
            {shownClients.map((c) => {
              const on = selectedClients.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggleClient(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.row, on && { backgroundColor: colors.primaryLight }]}
                >
                  <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                  <Text style={styles.rowText}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.count}>
            {selectedClients.size
              ? `${selectedClients.size} client${selectedClients.size > 1 ? 's' : ''} selected`
              : '0 clients selected'}
          </Text>
        </Field>
      )}

      <Field label="Assign To *">
        <Select value={memberId} placeholder="Assign To" options={members} onChange={setMemberId} searchable />
      </Field>
      <Field label="Reporting Person">
        <Select
          value={reportingId}
          placeholder="No Reporting Person"
          options={[{ value: '', label: 'No Reporting Person' }, ...members]}
          onChange={setReportingId}
          searchable
        />
      </Field>

      {statutory ? (
        <Field label="Obligations *" hint="tick what applies">
          {catalogState === 'loading' && <Text style={styles.listEmpty}>Loading…</Text>}
          {catalogState === 'error' && <Text style={styles.errorText}>{catalogError}</Text>}
          {catalogState === 'idle' && catalog.length > 0 && (
            <View style={styles.list}>
              <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                {categories.map((cat) => {
                  const items = catalog.filter((s) => s.category === cat);
                  if (!items.length) return null;
                  return (
                    <View key={cat}>
                      <Text style={styles.catHead}>{cat}</Text>
                      {items.map((s) => {
                        const on = codes.has(s.code);
                        return (
                          <Pressable
                            key={s.code}
                            onPress={() => toggleCode(s.code)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            style={[styles.row, on && { backgroundColor: colors.primaryLight }]}
                          >
                            <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowText}>{s.name}</Text>
                              <Text style={styles.rowSub}>
                                {s.months.length === 12
                                  ? `Every month · ${s.dueDay}`
                                  : `${s.months.length} periods · ${s.dueDay}`}
                                {s.freq ? ` · ${s.freq}` : ''}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <Text style={styles.count}>
            {codes.size ? `${codes.size} selected` : '0 selected'}
          </Text>
        </Field>
      ) : (
        <>
          <Field label="Work Type *">
            <Select
              value={workSel}
              placeholder="Select work type…"
              options={[
                ...WORK_TYPES.map((w) => ({ value: w, label: w })),
                { value: MANUAL_WORK_TYPE, label: '✏ Enter manually…' },
              ]}
              onChange={(v) => { setWorkSel(v); if (v !== MANUAL_WORK_TYPE) setWorkManual(''); }}
            />
            {workSel === MANUAL_WORK_TYPE && (
              <View style={{ marginTop: spacing.sm }}>
                <Input value={workManual} onChangeText={setWorkManual} placeholder="Type work type name…" autoFocus />
              </View>
            )}
          </Field>

          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field label="Frequency">
                <Select
                  value={frequency}
                  placeholder="Frequency"
                  options={FREQUENCIES.map((f) => ({ value: f, label: f }))}
                  onChange={setFrequency}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Due Day *" hint="of month">
                <Input value={dueDay} onChangeText={setDueDay} placeholder="e.g. 20" keyboardType="numeric" />
              </Field>
            </View>
          </View>

          <Field label="Priority">
            <Select
              value={priority}
              placeholder="Priority"
              options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
              onChange={setPriority}
            />
          </Field>

          {editing && (
            <Field label="Status">
              <Select
                value={active}
                placeholder="Status"
                options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Paused' }]}
                onChange={setActive}
              />
            </Field>
          )}

          <Field label="Notes">
            <Input value={notes} onChangeText={setNotes} placeholder="Additional details…" multiline />
          </Field>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row', gap: 6, backgroundColor: '#f3f4f6',
    borderRadius: radius.md, padding: 3, marginBottom: spacing.lg,
  },
  modeBtn: { flex: 1, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  modeBtnOn: { backgroundColor: colors.primary },
  modeText: { ...font.small, color: colors.muted },
  modeTextOn: { color: colors.white, fontWeight: '800' },
  search: {
    height: 44, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: 14, backgroundColor: colors.white, color: colors.text, marginBottom: 6,
  },
  list: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.white, maxHeight: 260, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6', minHeight: 48,
  },
  rowText: { flex: 1, ...font.small, color: colors.text, fontWeight: '700' },
  rowSub: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  catHead: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5,
    backgroundColor: '#f9fafb', paddingVertical: 7, paddingHorizontal: 14,
  },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  listEmpty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  errorText: { ...font.small, color: colors.red, textAlign: 'center', padding: spacing.lg },
  count: { ...font.tiny, color: colors.primary, marginTop: 5 },
  pair: { flexDirection: 'row', gap: spacing.md },
  readonly: {
    minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#f9fafb',
  },
  readonlyText: { fontSize: 15, color: colors.muted, fontWeight: '600' },
});
