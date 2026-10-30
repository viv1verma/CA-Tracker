import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import { LOCKED_CAPABILITY, doaAdmins, doaStaff, type Delegation } from './logic';

/**
 * Delegation of Authority (admin only). The capability matrix — capability rows
 * by staff column — and the approval-limit register.
 *
 * Admins are shown as permanently granted and are never given a checkbox, and
 * `delegation.manage` stays admin-only, so the screen cannot be used to lock an
 * admin out or to hand the screen itself to a non-admin.
 */
export default function DoaTab() {
  const { showToast } = useToast();
  const [doa, setDoa] = useState<Delegation | null>(null);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [limitOpen, setLimitOpen] = useState(false);
  const [limitId, setLimitId] = useState('');
  const [matter, setMatter] = useState('');
  const [approverId, setApproverId] = useState('');
  const [amount, setAmount] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [notes, setNotes] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Delegation>(endpoints.delegation);
      setDoa(d);
      setGrants(d.grants || {});
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (cap: string, uid: string) => {
    setGrants((prev) => {
      const cur = prev[cap] || [];
      return { ...prev, [cap]: cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid] };
    });
  };

  const save = async () => {
    if (!doa) return;
    setSaving(true);
    // Every capability is sent, so clearing one really clears it.
    const payload: Record<string, string[]> = {};
    doa.capabilities.forEach((c) => { payload[c.key] = grants[c.key] || []; });
    try {
      const r = await api.put<Delegation>(endpoints.delegation, { grants: payload });
      setDoa((d) => (d ? { ...d, ...r } : d));
      setGrants(r.grants || payload);
      showToast('Permissions saved ✓ — they apply immediately');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openLimit = (id?: string) => {
    const rec = id ? (doa?.limits || []).find((r) => r.id === id) : null;
    setLimitId(rec?.id || '');
    setMatter(rec?.matter || '');
    setApproverId(rec?.approverId || '');
    setAmount(rec?.limitAmount ? String(rec.limitAmount) : '');
    setUnlimited(!!rec?.unlimited);
    setNotes(rec?.notes || '');
    setLimitOpen(true);
  };

  const saveLimit = async () => {
    if (!matter.trim()) { showToast('Matter is required', 'error'); return; }
    setLimitSaving(true);
    const body = {
      matter: matter.trim(), approverId,
      limitAmount: parseFloat(amount) || 0, unlimited, notes: notes.trim(),
    };
    try {
      const r = limitId
        ? await api.put<Delegation>(endpoints.delegationLimit(limitId), body)
        : await api.post<Delegation>(endpoints.delegationLimits, body);
      setDoa((d) => (d ? { ...d, grants: r.grants, limits: r.limits } : d));
      setLimitOpen(false);
      showToast('Approval limit saved ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setLimitSaving(false);
    }
  };

  const deleteLimit = (id: string) => {
    Alert.alert('Remove limit', 'Remove this approval limit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            const r = await api.del<Delegation>(endpoints.delegationLimit(id));
            setDoa((d) => (d ? { ...d, grants: r.grants, limits: r.limits } : d));
            showToast('Removed');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Loading permissions…" />;
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!doa) return null;

  const staff = doaStaff(doa);
  const admins = doaAdmins(doa);

  // Capability rows carry their group heading, exactly as the web's matrix does.
  const grouped: { group: string; caps: Delegation['capabilities'] }[] = [];
  doa.capabilities.forEach((c) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === c.group) last.caps.push(c);
    else grouped.push({ group: c.group, caps: [c] });
  });

  return (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          <Text style={{ fontWeight: '800' }}>You control who can do what.</Text> Tick a capability to
          grant it. Admins always hold every capability and cannot be locked out — only an admin can
          open this screen.
        </Text>
        <Text style={styles.bannerMeta}>
          {doa.updatedAt
            ? `Last changed ${fmt(String(doa.updatedAt).slice(0, 10))}${doa.updatedBy ? ` by ${doa.updatedBy}` : ''}`
            : 'Not customised yet — existing access is unchanged.'}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Access Permissions</Text>
            <Text style={styles.note}>Who may use each part of the system</Text>
          </View>
          <Button title="Save permissions" onPress={save} loading={saving} />
        </View>

        {!staff.length ? (
          <Text style={styles.empty}>No non-admin team members yet.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.headRow}>
                <Text style={[styles.headCell, { width: 210 }]}>CAPABILITY</Text>
                {staff.map((p) => (
                  <View key={p.id} style={[styles.headPerson, { width: 104 }]}>
                    <Text style={styles.headCell} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                    <Text style={styles.headDes} numberOfLines={1}>
                      {(p.designation || '—').slice(0, 14)}
                    </Text>
                  </View>
                ))}
              </View>

              {grouped.map((g) => (
                <View key={g.group}>
                  <Text style={[styles.groupRow, { width: 210 + staff.length * 104 }]}>
                    {g.group.toUpperCase()}
                  </Text>
                  {g.caps.map((c, i) => {
                    const locked = c.key === LOCKED_CAPABILITY;
                    return (
                      <View key={c.key} style={[styles.capRow, i % 2 === 1 && { backgroundColor: '#fafafa' }]}>
                        <View style={{ width: 210, paddingRight: 8 }}>
                          <Text style={styles.capLabel}>
                            {c.label}{locked ? '  ADMIN ONLY' : ''}
                          </Text>
                          <Text style={styles.capDesc}>{c.description}</Text>
                        </View>
                        {staff.map((p) => {
                          const on = (grants[c.key] || []).includes(p.id);
                          return locked ? (
                            <Text key={p.id} style={[styles.lockedCell, { width: 104 }]}>—</Text>
                          ) : (
                            <Pressable key={p.id} accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              onPress={() => toggle(c.key, p.id)}
                              style={[styles.capCell, { width: 104 }]}>
                              <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {!!admins.length && (
          <Text style={styles.note}>
            🛡 Full access always: <Text style={{ fontWeight: '800' }}>
              {admins.map((a) => a.name).join(', ')}
            </Text> (admin)
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>💰 Approval Limits</Text>
            <Text style={styles.note}>Who may approve what, and up to how much</Text>
          </View>
          <Button title="+ Add limit" onPress={() => openLimit()} variant="outline" />
        </View>

        {!(doa.limits || []).length ? (
          <Text style={styles.empty}>
            No approval limits recorded. Use + Add limit to record who may approve what,
            and up to how much.
          </Text>
        ) : doa.limits.map((r) => (
          <View key={r.id} style={styles.limitRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.capLabel}>{r.matter || '—'}</Text>
              <Text style={styles.capDesc}>{r.approverName || '—'}</Text>
              {!!r.notes && <Text style={styles.capDesc}>{r.notes}</Text>}
            </View>
            <Text style={[styles.limitAmt, r.unlimited && { color: colors.green }]}>
              {r.unlimited ? 'No limit' : `₹${Number(r.limitAmount || 0).toLocaleString('en-IN')}`}
            </Text>
            <Pressable onPress={() => openLimit(r.id)} accessibilityRole="button" style={styles.iconBtn}>
              <Text style={styles.icon}>✏️</Text>
            </Pressable>
            <Pressable onPress={() => deleteLimit(r.id)} accessibilityRole="button" style={styles.iconBtn}>
              <Text style={styles.iconDanger}>🗑</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Sheet
        visible={limitOpen}
        title={limitId ? 'Edit Approval Limit' : 'Add Approval Limit'}
        onClose={() => setLimitOpen(false)}
        footer={<Button title="Save" onPress={saveLimit} loading={limitSaving} />}
      >
        <Field label="Matter *">
          <Input value={matter} onChangeText={setMatter} placeholder="e.g. Client write-off" />
        </Field>
        <Field label="Approver">
          <Select value={approverId} placeholder="—" searchable onChange={setApproverId}
            options={[{ value: '', label: '—' }, ...doa.people.map((p) => ({
              value: p.id, label: p.name, sub: p.designation || undefined,
            }))]} />
        </Field>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: unlimited }}
          onPress={() => setUnlimited((v) => !v)} style={styles.checkRow}>
          <Text style={styles.checkBox}>{unlimited ? '☑' : '☐'}</Text>
          <Text style={styles.checkLabel}>No limit</Text>
        </Pressable>
        {!unlimited && (
          <Field label="Limit amount (₹)">
            <Input value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />
          </Field>
        )}
        <Field label="Notes">
          <Input value={notes} onChangeText={setNotes} multiline placeholder="Anything worth noting" />
        </Field>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  bannerText: { ...font.small, fontWeight: '500', color: '#1e40af', lineHeight: 18 },
  bannerMeta: { ...font.small, fontWeight: '500', color: '#3b82f6', marginTop: 4 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { ...font.h3, color: colors.text },
  note: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 4 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },
  error: { ...font.small, color: colors.red, textAlign: 'center', padding: spacing.xl },

  headRow: { flexDirection: 'row', backgroundColor: '#1e3a8a', alignItems: 'center' },
  headCell: { ...font.tiny, color: colors.white, fontWeight: '800', padding: 7 },
  headPerson: { alignItems: 'center' },
  headDes: { fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.75)', paddingBottom: 5 },
  groupRow: {
    ...font.tiny, color: '#475569', backgroundColor: '#f1f5f9',
    paddingVertical: 6, paddingHorizontal: 8, letterSpacing: 0.5,
  },
  capRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 7 },
  capLabel: { ...font.small, fontWeight: '700', color: colors.text },
  capDesc: { ...font.tiny, fontWeight: '500', color: colors.muted },
  capCell: { alignItems: 'center' },
  lockedCell: { textAlign: 'center', color: '#cbd5e1' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.small, fontWeight: '600', color: colors.text },

  limitRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  limitAmt: { ...font.small, fontWeight: '800', color: colors.text },
  iconBtn: {
    width: 34, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  icon: { fontSize: 13 },
  iconDanger: { fontSize: 13, color: colors.red },
});
