import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmtDT } from '../assignments/logic';
import {
  EMD_STATUSES, TENDER_CATEGORIES, eligVerdict, eventText, fmtDate, fmtMoney,
  leadColor, tenderColor, type Lead, type Tender,
} from './logic';

// ── Leads ───────────────────────────────────────────────────────────────────

/** openAddLead() / openEditLead() / saveLead(). */
export function LeadFormSheet({
  lead, statuses, visible, onClose, onSaved,
}: {
  lead: Lead | null;
  statuses: string[];
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const editing = !!lead;
  const [name, setName] = useState('');
  const [poc, setPoc] = useState('');
  const [des, setDes] = useState('');
  const [status, setStatus] = useState('Generated POC');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(lead?.name || '');
    setPoc(lead?.poc || '');
    setDes(lead?.pocDesignation || '');
    setStatus('Generated POC');
    setNote('');
  }, [visible, lead?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) { showToast('Lead name is required', 'error'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), poc: poc.trim(), pocDesignation: des.trim(),
      };
      if (editing && lead) {
        await api.put(endpoints.lead(lead.id), body);
        showToast('Lead updated');
      } else {
        // Status and the opening note only apply when creating, as on the web.
        body.status = status;
        body.note = note.trim();
        await api.post(endpoints.leads, body);
        showToast('Lead added');
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? '✏ Edit Lead' : '➕ Add Lead'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title={editing ? 'Save Changes' : 'Add Lead'} onPress={save} loading={saving} />
          </View>
        </>
      }
    >
      <Field label="Name of Lead *">
        <Input value={name} onChangeText={setName} placeholder="Company or firm name" />
      </Field>
      <Field label="Point of Contact">
        <Input value={poc} onChangeText={setPoc} placeholder="Who we speak to" />
      </Field>
      <Field label="Designation">
        <Input value={des} onChangeText={setDes} placeholder="Their role" />
      </Field>
      {!editing && (
        <>
          <Field label="Status">
            <Select value={status} placeholder="Status"
              options={statuses.map((s) => ({ value: s, label: s }))} onChange={setStatus} />
          </Field>
          <Field label="Note">
            <Input value={note} onChangeText={setNote} placeholder="How this lead came about…" multiline />
          </Field>
        </>
      )}
    </Sheet>
  );
}

/** openLeadDetail() — the trail, plus adding an event / moving the status. */
export function LeadDetailSheet({
  lead, statuses, visible, onClose, onChanged, onEdit, onDeleted,
}: {
  lead: Lead | null;
  statuses: string[];
  visible: boolean;
  onClose: () => void;
  onChanged: (l: Lead) => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!visible || !lead) return;
    setStatus(lead.status);
    setNote('');
  }, [visible, lead?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null;
  const events = (lead.events || []).slice().reverse();

  const addEvent = async () => {
    if (!note.trim() && !status) { showToast('Add a note or change status', 'error'); return; }
    setBusy('event');
    try {
      const u = await api.post<Lead>(endpoints.leadEvent(lead.id), { status, note: note.trim() });
      onChanged(u);
      setNote('');
      showToast('Event added to trail');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not add event', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = () => {
    Alert.alert('Delete lead', `Delete ${lead.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await api.del(endpoints.lead(lead.id));
            onDeleted(lead.id);
            onClose();
            showToast('Lead deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          } finally { setBusy(''); }
        },
      },
    ]);
  };

  const [bg, fg] = leadColor(lead.status);

  return (
    <Sheet visible={visible} title={lead.name} onClose={onClose}>
      <View style={styles.grid}>
        <Cell label="Point of Contact" value={lead.poc || '—'} />
        <Cell label="Designation" value={lead.pocDesignation || '—'} />
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Current Status</Text>
          <View style={[styles.pill, { backgroundColor: bg }]}>
            <Text style={[styles.pillText, { color: fg }]}>{lead.status}</Text>
          </View>
        </View>
        <Cell label="Added By" value={lead.createdByName || '—'} />
      </View>

      <View style={styles.addBox}>
        <Text style={styles.addTitle}>➕ Add Event / Update Status</Text>
        <Field label="Status">
          <Select value={status} placeholder="Status"
            options={statuses.map((s) => ({ value: s, label: s }))} onChange={setStatus} />
        </Field>
        <Field label="Note (meeting / call details)">
          <Input value={note} onChangeText={setNote}
            placeholder="e.g. Met Mr. Sharma at their office, discussed audit scope" multiline />
        </Field>
        <Button title="Add to Trail" onPress={addEvent} loading={busy === 'event'} />
      </View>

      <Text style={styles.trailTitle}>📋 Trail of Events</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No events yet</Text>
      ) : (
        <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
          {events.map((ev, i) => {
            const [b, f] = leadColor(ev.status);
            return (
              <View key={i} style={styles.trailRow}>
                <View style={styles.trailTop}>
                  <View style={[styles.pill, { backgroundColor: b }]}>
                    <Text style={[styles.pillText, { color: f }]}>{ev.status || '—'}</Text>
                  </View>
                  <Text style={styles.trailDate}>{fmtDT(ev.date)}</Text>
                </View>
                <Text style={styles.trailNote}>{eventText(ev) || '—'}</Text>
                {!!ev.byName && <Text style={styles.trailBy}>{ev.byName}</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}><Button title="✏ Edit" onPress={onEdit} variant="outline" /></View>
        <View style={{ flex: 1 }}>
          <Button title="🗑 Delete" onPress={remove} loading={busy === 'delete'} variant="danger" />
        </View>
      </View>
    </Sheet>
  );
}

// ── Tenders ─────────────────────────────────────────────────────────────────

/** openAddTender() / saveTender(). */
export function TenderFormSheet({
  tender, statuses, defaultCategory, visible, onClose, onSaved,
}: {
  tender: Tender | null;
  statuses: string[];
  defaultCategory: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { users } = useData();
  const { showToast } = useToast();
  const editing = !!tender;

  const [f, setF] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('Identified');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  /** tdPartnerOptions(): admins and anyone whose designation says partner. */
  const partners = useMemo(() => {
    const list = users.filter(
      (u) => u.role === 'admin' || (u.designation || '').toLowerCase().includes('partner'),
    );
    if (user && !list.some((p) => p.id === user.id)) {
      return [{ id: user.id, name: user.name, role: 'member' as const }, ...list];
    }
    return list;
  }, [users, user]);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!visible) return;
    const t = tender;
    setF({
      category: t?.category || defaultCategory,
      psuName: t?.psuName || '',
      tenderRef: t?.tenderRef || '',
      natureOfWork: t?.natureOfWork || '',
      location: t?.location || '',
      applicationDate: t?.applicationDate || '',
      dueDate: t?.dueDate || '',
      tenderValue: t?.tenderValue ? String(t.tenderValue) : '',
      quotationValue: t?.quotationValue ? String(t.quotationValue) : '',
      emdAmount: t?.emdAmount ? String(t.emdAmount) : '',
      emdStatus: t?.emdStatus || '',
      source: t?.source || '',
      tenderFee: t?.tenderFee ? String(t.tenderFee) : '',
      bidOpeningDate: t?.bidOpeningDate || '',
      l1Value: t?.l1Value ? String(t.l1Value) : '',
      partnerId: t?.partnerId || user?.id || '',
    });
    setStatus('Identified');
    setNote('');
  }, [visible, tender?.id, defaultCategory]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!f.psuName?.trim()) { showToast('Name of PSU is required', 'error'); return; }
    const partner = partners.find((p) => p.id === f.partnerId);
    const body: Record<string, unknown> = {
      ...f, psuName: f.psuName.trim(), partnerName: partner?.name || '',
    };
    setSaving(true);
    try {
      if (editing && tender) {
        await api.put(endpoints.tender(tender.id), body);
        showToast('Tender updated');
      } else {
        body.status = status;
        body.note = note.trim();
        await api.post(endpoints.tenders, body);
        showToast('Tender added');
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? '✏ Edit Tender' : '➕ Add Tender'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title={editing ? 'Save Changes' : 'Add Tender'} onPress={save} loading={saving} />
          </View>
        </>
      }
    >
      <Field label="Category">
        <Select value={f.category || ''} placeholder="Category" options={TENDER_CATEGORIES}
          onChange={(v) => set('category', v)} />
      </Field>
      <Field label="Name of PSU *">
        <Input value={f.psuName || ''} onChangeText={(v) => set('psuName', v)} placeholder="Organisation" />
      </Field>
      <Field label="Tender Ref">
        <Input value={f.tenderRef || ''} onChangeText={(v) => set('tenderRef', v)} placeholder="Reference no." />
      </Field>
      <Field label="Nature of Work">
        <Input value={f.natureOfWork || ''} onChangeText={(v) => set('natureOfWork', v)} multiline />
      </Field>
      <Field label="Location">
        <Input value={f.location || ''} onChangeText={(v) => set('location', v)} placeholder="City / state" />
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Application Date">
            <DateField value={f.applicationDate || ''} onChange={(v) => set('applicationDate', v)} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Due Date">
            <DateField value={f.dueDate || ''} onChange={(v) => set('dueDate', v)} />
          </Field>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Tender Value">
            <Input value={f.tenderValue || ''} onChangeText={(v) => set('tenderValue', v)} keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Quotation Value">
            <Input value={f.quotationValue || ''} onChangeText={(v) => set('quotationValue', v)} keyboardType="numeric" />
          </Field>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="EMD Amount">
            <Input value={f.emdAmount || ''} onChangeText={(v) => set('emdAmount', v)} keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="EMD Status">
            <Select value={f.emdStatus || ''} placeholder="—"
              options={EMD_STATUSES.map((s) => ({ value: s, label: s || '—' }))}
              onChange={(v) => set('emdStatus', v)} />
          </Field>
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Tender Fee">
            <Input value={f.tenderFee || ''} onChangeText={(v) => set('tenderFee', v)} keyboardType="numeric" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="L1 Value">
            <Input value={f.l1Value || ''} onChangeText={(v) => set('l1Value', v)} keyboardType="numeric" />
          </Field>
        </View>
      </View>
      <Field label="Bid Opening Date">
        <DateField value={f.bidOpeningDate || ''} onChange={(v) => set('bidOpeningDate', v)} />
      </Field>
      <Field label="Source">
        <Input value={f.source || ''} onChangeText={(v) => set('source', v)} placeholder="Where it came from" />
      </Field>
      <Field label="Partner Following Up">
        <Select value={f.partnerId || ''} placeholder="Partner"
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => set('partnerId', v)} searchable />
      </Field>
      {!editing && (
        <>
          <Field label="Status">
            <Select value={status} placeholder="Status"
              options={statuses.map((s) => ({ value: s, label: s }))} onChange={setStatus} />
          </Field>
          <Field label="Note">
            <Input value={note} onChangeText={setNote} placeholder="Opening remark…" multiline />
          </Field>
        </>
      )}
    </Sheet>
  );
}

/** openTenderDetail() — all fields, the trail, status updates and eligibility. */
export function TenderDetailSheet({
  tender, statuses, visible, onClose, onChanged, onEdit, onDeleted,
}: {
  tender: Tender | null;
  statuses: string[];
  visible: boolean;
  onClose: () => void;
  onChanged: (t: Tender) => void;
  onEdit: () => void;
  onDeleted: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!visible || !tender) return;
    setStatus(tender.status);
    setNote('');
  }, [visible, tender?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!tender) return null;
  const events = (tender.events || []).slice().reverse();
  const verdict = eligVerdict(tender);
  const [bg, fg] = tenderColor(tender.status);

  const addEvent = async () => {
    if (!note.trim() && !status) { showToast('Add a remark or change status', 'error'); return; }
    setBusy('event');
    try {
      const u = await api.post<Tender>(endpoints.tenderEvent(tender.id), { status, note: note.trim() });
      onChanged(u);
      setNote('');
      showToast('Added to trail');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not add', 'error');
    } finally { setBusy(''); }
  };

  /** Re-read this tender's PDF and re-check eligibility. */
  const analyse = async () => {
    setBusy('analyse');
    try {
      const u = await api.post<Tender>(endpoints.tenderAnalyse(tender.id), {}, { timeoutMs: 60000 });
      onChanged(u);
      showToast('Eligibility re-checked');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not read the PDF', 'error');
    } finally { setBusy(''); }
  };

  const override = (v: string) => {
    setBusy('override');
    void (async () => {
      try {
        const u = await api.put<Tender>(endpoints.tenderEligOverride(tender.id), { verdict: v });
        onChanged(u);
        showToast(`Marked ${v}`);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'Could not set', 'error');
      } finally { setBusy(''); }
    })();
  };

  const remove = () => {
    Alert.alert('Delete tender', `Delete ${tender.psuName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await api.del(endpoints.tender(tender.id));
            onDeleted(tender.id);
            onClose();
            showToast('Tender deleted');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          } finally { setBusy(''); }
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} title={tender.psuName} onClose={onClose}>
      <View style={styles.grid}>
        <Cell label="Tender Ref" value={tender.tenderRef || '—'} />
        <Cell label="Location" value={tender.location || '—'} />
        <Cell label="Nature of Work" value={tender.natureOfWork || '—'} />
        <Cell label="Partner" value={tender.partnerName || '—'} />
        <Cell label="Application Date" value={fmtDate(tender.applicationDate)} />
        <Cell label="Due Date" value={fmtDate(tender.dueDate)} />
        <Cell label="Tender Value" value={fmtMoney(tender.tenderValue)} />
        <Cell label="Quotation Value" value={fmtMoney(tender.quotationValue)} />
        <Cell label="EMD" value={`${fmtMoney(tender.emdAmount)}${tender.emdStatus ? ` · ${tender.emdStatus}` : ''}`} />
        <Cell label="Tender Fee" value={fmtMoney(tender.tenderFee)} />
        <Cell label="Bid Opening" value={fmtDate(tender.bidOpeningDate)} />
        <Cell label="L1 Value" value={fmtMoney(tender.l1Value)} />
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Status</Text>
          <View style={[styles.pill, { backgroundColor: bg }]}>
            <Text style={[styles.pillText, { color: fg }]}>{tender.status}</Text>
          </View>
        </View>
        <Cell label="Source" value={tender.source || '—'} />
      </View>

      {/* Eligibility */}
      <View style={styles.addBox}>
        <Text style={styles.addTitle}>⚖ Eligibility</Text>
        <Text style={styles.eligNote}>
          {tender.eligibilityOverride
            ? `Set manually by ${tender.eligibilityOverride.byName || 'a partner'}${tender.eligibilityOverride.reason ? ` — ${tender.eligibilityOverride.reason}` : ''}`
            : 'Auto-checked from the tender PDF — always confirm in the document.'}
        </Text>
        <Text style={styles.eligVerdict}>{verdict || 'Not read yet'}</Text>
        {!!tender.eligibility?.reasons?.length && (
          tender.eligibility.reasons.map((r, i) => (
            <Text key={i} style={styles.eligReason}>• {r}</Text>
          ))
        )}
        <View style={styles.eligBtns}>
          {['Eligible', 'Not Eligible', 'Needs Review'].map((v) => (
            <Pressable key={v} onPress={() => override(v)} disabled={!!busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.eligBtn, (pressed || !!busy) && { opacity: 0.6 }]}>
              <Text style={styles.eligBtnText}>{v}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Button title="🔍 Re-read PDF" onPress={analyse} loading={busy === 'analyse'} variant="outline" />
        </View>
      </View>

      {/* Trail */}
      <View style={styles.addBox}>
        <Text style={styles.addTitle}>➕ Add Remark / Update Status</Text>
        <Field label="Status">
          <Select value={status} placeholder="Status"
            options={statuses.map((s) => ({ value: s, label: s }))} onChange={setStatus} />
        </Field>
        <Field label="Remark">
          <Input value={note} onChangeText={setNote} placeholder="What happened…" multiline />
        </Field>
        <Button title="Add to Trail" onPress={addEvent} loading={busy === 'event'} />
      </View>

      <Text style={styles.trailTitle}>📋 Trail</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No remarks yet</Text>
      ) : (
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
          {events.map((ev, i) => {
            const [b, f2] = tenderColor(ev.status);
            return (
              <View key={i} style={styles.trailRow}>
                <View style={styles.trailTop}>
                  <View style={[styles.pill, { backgroundColor: b }]}>
                    <Text style={[styles.pillText, { color: f2 }]}>{ev.status || '—'}</Text>
                  </View>
                  <Text style={styles.trailDate}>{fmtDT(ev.date)}</Text>
                </View>
                {!!ev.note && <Text style={styles.trailNote}>{ev.note}</Text>}
                {!!ev.byName && <Text style={styles.trailBy}>{ev.byName}</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}><Button title="✏ Edit" onPress={onEdit} variant="outline" /></View>
        <View style={{ flex: 1 }}>
          <Button title="🗑 Delete" onPress={remove} loading={busy === 'delete'} variant="danger" />
        </View>
      </View>
    </Sheet>
  );
}

/** openImportTenders() — preview live ICAI opportunities, tick, import. */
export function ImportTendersSheet({
  visible, onClose, onImported,
}: { visible: boolean; onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setItems(null); setSkip(new Set());
  }, [visible]);

  const preview = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ items?: Record<string, unknown>[] }>(
        endpoints.tenderImportPreview, { timeoutMs: 60000 },
      );
      setItems(r.items || []);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not fetch', 'error');
    } finally { setLoading(false); }
  };

  const doImport = async () => {
    const chosen = (items || []).filter((_, i) => !skip.has(i));
    if (!chosen.length) { showToast('Nothing selected', 'error'); return; }
    setImporting(true);
    try {
      const r = await api.post<{ added?: number; skipped?: number }>(
        endpoints.tenderImport, { items: chosen },
      );
      onImported();
      onClose();
      showToast(`Imported ${r.added || 0} tender(s)${r.skipped ? `, ${r.skipped} already on file` : ''}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Import failed', 'error');
    } finally { setImporting(false); }
  };

  return (
    <Sheet
      visible={visible}
      title="⬇ Import from ICAI"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            {items === null
              ? <Button title="Fetch opportunities" onPress={preview} loading={loading} />
              : <Button title="Import selected" onPress={doImport} loading={importing} />}
          </View>
        </>
      }
    >
      <Text style={styles.eligNote}>
        Live opportunities from ICAI's Tender Monitoring Division. Fetch, untick any, then import.
      </Text>
      {items !== null && items.length === 0 && (
        <Text style={styles.empty}>Nothing available right now.</Text>
      )}
      {!!items?.length && (
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
          {items.map((it, i) => {
            const on = !skip.has(i);
            const name = String((it as { psuName?: string }).psuName || 'Untitled');
            const ref = String((it as { tenderRef?: string }).tenderRef || '');
            const due = String((it as { dueDate?: string }).dueDate || '');
            return (
              <Pressable
                key={i}
                onPress={() => setSkip((prev) => {
                  const n = new Set(prev);
                  if (n.has(i)) n.delete(i); else n.add(i);
                  return n;
                })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.importRow}
              >
                <View style={[styles.box, on && styles.boxOn]}>
                  {on && <Text style={styles.tick}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.importName}>{name}</Text>
                  {!!ref && <Text style={styles.importMeta}>{ref}</Text>}
                  {!!due && <Text style={styles.importMeta}>Due {fmtDate(due)}</Text>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  cell: { width: '50%', paddingVertical: 6, paddingRight: spacing.sm },
  cellLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  cellValue: { ...font.small, color: colors.text, marginTop: 2 },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  addBox: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  addTitle: { ...font.small, color: colors.text, marginBottom: spacing.sm },
  eligNote: { ...font.tiny, color: colors.muted, fontWeight: '500', lineHeight: 16, marginBottom: 6 },
  eligVerdict: { ...font.h3, color: colors.text, marginBottom: 4 },
  eligReason: { ...font.tiny, color: colors.muted, fontWeight: '500', lineHeight: 16 },
  eligBtns: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  eligBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center', minHeight: 36, justifyContent: 'center',
  },
  eligBtnText: { ...font.tiny, fontWeight: '700', color: colors.text },
  trailTitle: { ...font.small, color: colors.text, marginBottom: 6 },
  trailRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  trailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  trailDate: { ...font.tiny, color: colors.muted, fontWeight: '500' },
  trailNote: { ...font.small, color: colors.text, fontWeight: '500', marginTop: 4 },
  trailBy: { ...font.tiny, color: '#94a3b8', fontWeight: '700', marginTop: 2 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  pair: { flexDirection: 'row', gap: spacing.md },
  importRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 10, marginBottom: 6, minHeight: 48,
  },
  importName: { ...font.small, color: colors.text },
  importMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  box: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 10, fontWeight: '900' },
});
