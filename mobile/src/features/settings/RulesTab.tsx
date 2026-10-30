import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { Field, Input, Select } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, fmtDT } from '../assignments/logic';
import {
  RO_GROUPS, SAT_LABEL, halfDayWarning, roFmt, rulesSummary,
  type FirmRules, type RoDetail, type RoRow, type RoSchema,
} from './logic';

/**
 * The Rules tab. The firm handbook (GET/PUT /rules) plus the per-employee
 * exceptions (GET/PUT/DELETE /rule-overrides). Everything is read on entry;
 * writes happen only on Save / Reset.
 *
 * Non-admins get the same read-only view the web gives them — `canEdit` comes
 * from the server, and PUT /rules is adminOnly anyway.
 */
export default function RulesTab({ isAdmin }: { isAdmin: boolean }) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<FirmRules | null>(null);
  const [form, setForm] = useState<FirmRules>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Per-employee exceptions
  const [schema, setSchema] = useState<RoSchema | null>(null);
  const [rows, setRows] = useState<RoRow[]>([]);
  const [pick, setPick] = useState('');
  const [detail, setDetail] = useState<RoDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [roSaving, setRoSaving] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const r = await api.get<FirmRules>(endpoints.rules);
      setRules(r); setForm(r);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not load rules', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadOverrides = useCallback(async () => {
    if (!isAdmin) return;   // the whole rule-overrides family is adminOnly
    try {
      if (!schema) setSchema(await api.get<RoSchema>(endpoints.ruleOverridesSchema, { background: true }));
      const r = await api.get<{ rows: RoRow[] }>(endpoints.ruleOverrides, { background: true });
      setRows(r.rows || []);
    } catch { /* the firm rules still render */ }
  }, [isAdmin, schema]);

  useEffect(() => { void loadRules(); void loadOverrides(); }, [loadRules]);   // eslint-disable-line react-hooks/exhaustive-deps

  const loadEmployee = async (userId: string) => {
    setPick(userId);
    if (!userId) { setDetail(null); return; }
    try {
      const d = await api.get<RoDetail>(endpoints.ruleOverride(userId));
      setDetail(d);
      const v: Record<string, string> = {};
      Object.entries(d.values || {}).forEach(([k, val]) => {
        v[k] = val === true ? '1' : val === false ? '0' : String(val ?? '');
      });
      setValues(v);
      setReason('');
    } catch (e) {
      setDetail(null);
      showToast(e instanceof ApiError ? e.message : 'Could not load', 'error');
    }
  };

  const roSave = async () => {
    if (!detail || !schema) return;
    setRoSaving(true);
    // Blank must stay blank — the server reads null as "follow the firm rule".
    const payload: Record<string, unknown> = {};
    schema.fields.forEach((f) => {
      const raw = values[f.key];
      if (raw === undefined || raw === '') { payload[f.key] = null; return; }
      payload[f.key] = f.kind === 'bool' ? raw === '1' : raw;
    });
    try {
      const r = await api.put<{ unchanged?: boolean; changes?: string[] }>(
        endpoints.ruleOverride(detail.user.id), { values: payload, reason },
      );
      showToast(r.unchanged ? 'Nothing changed' : `${(r.changes || []).length} rule(s) updated ✓`);
      await loadOverrides();
      await loadEmployee(detail.user.id);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setRoSaving(false);
    }
  };

  const roReset = () => {
    if (!detail) return;
    Alert.alert(
      'Back to firm rules',
      `${detail.user.name} will go back to the firm rules for every field. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            try {
              await api.del(endpoints.ruleOverride(detail.user.id));
              showToast('Back on firm rules ✓');
              await loadOverrides();
              await loadEmployee(detail.user.id);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not reset', 'error');
            }
          },
        },
      ],
    );
  };

  const doSave = async () => {
    const full = Number(form.fullDayHours) || 0;
    const fullCA = Number(form.fullDayHoursCA) || 0;
    const half = Number(form.halfDayHours) || 0;
    const warn = halfDayWarning(full, fullCA, half);
    const send = async () => {
      setSaving(true);
      try {
        const r = await api.put<FirmRules>(endpoints.rules, {
          officeIn: form.officeIn || '', officeOut: form.officeOut || '', lateGrace: form.lateGrace || '',
          lunchStart: form.lunchStart || '', lunchEnd: form.lunchEnd || '',
          fullDayHours: full, fullDayHoursCA: fullCA, halfDayHours: half,
          lateMarksPerHalfDay: Number(form.lateMarksPerHalfDay) || 0,
          sundayOff: form.sundayOff !== false, weekOffSaturdays: form.weekOffSaturdays || [],
          paidLeavesPerYear: Number(form.paidLeavesPerYear) || 0,
          joiningCutoffDay: Number(form.joiningCutoffDay) || 0,
          carryForwardMax: Number(form.carryForwardMax) || 0,
          leaveNoticeDays: Number(form.leaveNoticeDays) || 0,
          maxConsecutiveLeave: Number(form.maxConsecutiveLeave) || 0,
          sandwichRule: !!form.sandwichRule,
          compOffEnabled: form.compOffEnabled !== false,
          compOffExpiryDays: Number(form.compOffExpiryDays) || 0,
          // Blank stays null: 0 means "not allowed", blank means "unlimited".
          wfhPerMonth: (form.wfhPerMonth === null || form.wfhPerMonth === undefined
            || (form.wfhPerMonth as unknown) === '') ? null : Number(form.wfhPerMonth),
          wfhNeedsApproval: form.wfhNeedsApproval !== false,
          probationMonths: Number(form.probationMonths) || 0,
          noticeDuringProbation: Number(form.noticeDuringProbation) || 0,
          noticeAfterConfirmation: Number(form.noticeAfterConfirmation) || 0,
          policySections: (form.policySections || [])
            .filter((s) => (s.title || '').trim() || (s.body || '').trim()),
        });
        setRules(r); setForm(r);
        showToast('Rules saved ✓');
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
      } finally {
        setSaving(false);
      }
    };
    if (warn) {
      Alert.alert('Check half-day hours', warn, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void send() },
      ]);
      return;
    }
    await send();
  };

  if (loading) return <Loading label="Loading rules…" />;
  const editable = !!rules?.canEdit;

  const num = (k: keyof FirmRules, label: string, hint?: string, live = true) => (
    <Field key={String(k)} label={`${label}  ${live ? 'LIVE' : 'INFO'}`} hint={hint}>
      <Input value={form[k] === null || form[k] === undefined ? '' : String(form[k])}
        onChangeText={(t) => setForm((f) => ({ ...f, [k]: t === '' ? '' : Number(t) }))}
        keyboardType="numeric" placeholder="0" />
    </Field>
  );
  const txt = (k: keyof FirmRules, label: string, hint?: string, live = true) => (
    <Field key={String(k)} label={`${label}  ${live ? 'LIVE' : 'INFO'}`} hint={hint}>
      <Input value={String(form[k] ?? '')} onChangeText={(t) => setForm((f) => ({ ...f, [k]: t }))}
        placeholder="HH:MM" />
    </Field>
  );
  const check = (k: keyof FirmRules, label: string, dflt = true) => (
    <Pressable key={String(k)} accessibilityRole="checkbox"
      accessibilityState={{ checked: form[k] !== undefined ? !!form[k] : dflt }}
      onPress={() => setForm((f) => ({ ...f, [k]: !(f[k] !== undefined ? f[k] : dflt) }))}
      style={styles.checkRow}>
      <Text style={styles.checkBox}>{(form[k] !== undefined ? form[k] : dflt) ? '☑' : '☐'}</Text>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          {editable
            ? '⚙ These rules run the system. Values tagged LIVE are applied by attendance, leave and payroll the moment you save — they are not just notes. Items tagged INFO are recorded for the team to read.'
            : '📋 Office rules. This is the firm policy your attendance and leave are measured against. Contact an admin for changes.'}
        </Text>
        {!!rules?.updatedAt && (
          <Text style={styles.bannerMeta}>
            Last updated {fmtDT(rules.updatedAt)}{editable && rules.updatedBy ? ` by ${rules.updatedBy}` : ''}
          </Text>
        )}
      </View>

      {/* Standard Rules — at a glance */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Rules — at a glance</Text>
        {rulesSummary(rules || {}).map((sec) => (
          <View key={sec.head}>
            <Text style={styles.groupHead}>{sec.head}</Text>
            {sec.rows.map((r) => (
              <View key={r.label} style={styles.sumRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sumLabel}>{r.label}</Text>
                  {!!r.note && <Text style={styles.sumNote}>{r.note}</Text>}
                </View>
                <Text style={styles.sumValue}>{r.value}</Text>
                <View style={[styles.tag, { backgroundColor: r.live ? '#dcfce7' : '#f1f5f9' }]}>
                  <Text style={[styles.tagText, { color: r.live ? '#166534' : '#64748b' }]}>
                    {r.live ? 'LIVE' : 'INFO'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      {editable && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🕐 Office Timing</Text>
            {txt('officeIn', 'Office starts', 'Shown when someone punches in late')}
            {txt('officeOut', 'Office ends', 'Leaving before this flags an early mark')}
            {txt('lateGrace', 'Late grace until', 'Punch in after this = Late')}
            {txt('lunchStart', 'Lunch from', undefined, false)}
            {txt('lunchEnd', 'Lunch to', 'Not deducted from hours', false)}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Full Day / Half Day</Text>
            <Text style={styles.note}>
              Required hours differ by role. A person counts as CA/Partner if their qualification is
              Chartered Accountant or their designation contains Partner.
            </Text>
            {num('fullDayHoursCA', 'Full day — CA & Partners', 'Hours/day mandatory for CAs and Partners')}
            {num('fullDayHours', 'Full day — Others', 'Hours/day for CS, articles and staff')}
            {num('halfDayHours', 'Half day hours', 'Below this = Absent; between = Half Day')}
            {num('lateMarksPerHalfDay', 'Late marks = 1 half day', 'Applied by HR when reviewing the month', false)}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🗓️ Weekly Off</Text>
            {check('sundayOff', 'Sundays are off')}
            <Text style={styles.subLabel}>Saturdays that are off  LIVE</Text>
            <View style={styles.satRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = (form.weekOffSaturdays || [2, 4]).map(Number).includes(n);
                return (
                  <Pressable key={n} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => setForm((f) => {
                      const cur = (f.weekOffSaturdays || [2, 4]).map(Number);
                      return { ...f, weekOffSaturdays: on ? cur.filter((x) => x !== n) : [...cur, n].sort() };
                    })}
                    style={styles.satItem}>
                    <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
                    <Text style={styles.checkLabel}>{SAT_LABEL[n]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>
              Drives working-day counts, so it feeds salary and the attendance report.
              Festival/government holidays are managed in the Office tab.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌴 Leave</Text>
            {num('paidLeavesPerYear', 'Paid leaves per year',
              `Accrues monthly (${((Number(form.paidLeavesPerYear) || 18) / 12).toFixed(2)}/month)`)}
            {num('joiningCutoffDay', 'Joining cut-off day', 'Join on/before this day and that month accrues')}
            {num('carryForwardMax', 'Carry forward (max days)', '0 = unused leave lapses', false)}
            {num('leaveNoticeDays', 'Apply leave days ahead', 'Notice expected for planned leave', false)}
            {num('maxConsecutiveLeave', 'Max consecutive days', '0 = no limit', false)}
            {check('sandwichRule', 'Sandwich rule — holidays between leave days count as leave', false)}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔄 Compensatory Off</Text>
            {check('compOffEnabled', 'Working on a holiday or weekly off earns a comp-off')}
            {num('compOffExpiryDays', 'Expires after (days)', '0 = never expires', false)}
            <Text style={styles.note}>
              A full day (per the hours above) earns 1 day; a shorter day earns 0.5.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏠 Work From Home</Text>
            <Text style={styles.note}>
              Firm standard is no work from home. Set 0 to disallow, a number to cap per month, or
              leave blank for unlimited. Grant exceptions to individuals below.
            </Text>
            <Field label="WFH days per month  LIVE" hint="0 = not allowed. Blank = unlimited.">
              <Input
                value={form.wfhPerMonth === null || form.wfhPerMonth === undefined ? '' : String(form.wfhPerMonth)}
                onChangeText={(t) => setForm((f) => ({ ...f, wfhPerMonth: t === '' ? null : Number(t) }))}
                keyboardType="numeric" placeholder="blank = unlimited" />
            </Field>
            {check('wfhNeedsApproval', 'WFH needs admin approval')}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📄 Probation & Notice Period</Text>
            {num('probationMonths', 'Probation (months)', undefined, false)}
            {num('noticeDuringProbation', 'Notice in probation (days)', undefined, false)}
            {num('noticeAfterConfirmation', 'Notice after confirmation', 'days', false)}
          </View>
        </>
      )}

      {/* Other Policies — free text, editable or read-only */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝 Other Policies</Text>
        <Text style={styles.note}>
          Rules the system can't enforce — conduct, dress code, client confidentiality, laptop/asset
          use, travel reimbursement, and so on.
        </Text>
        {!(form.policySections || []).length && !editable && (
          <Text style={styles.note}>None added yet.</Text>
        )}
        {(form.policySections || []).map((s, i) => (editable ? (
          <View key={i} style={styles.policyItem}>
            <Input value={s.title || ''} placeholder="Policy title (e.g. Dress Code)"
              onChangeText={(t) => setForm((f) => ({
                ...f, policySections: (f.policySections || []).map((x, xi) => xi === i ? { ...x, title: t } : x),
              }))} />
            <View style={{ height: spacing.xs }} />
            <Input value={s.body || ''} multiline placeholder="Write the rule…"
              onChangeText={(t) => setForm((f) => ({
                ...f, policySections: (f.policySections || []).map((x, xi) => xi === i ? { ...x, body: t } : x),
              }))} />
            <Pressable onPress={() => setForm((f) => ({
              ...f, policySections: (f.policySections || []).filter((_x, xi) => xi !== i),
            }))} accessibilityRole="button" style={styles.removeBtn}>
              <Text style={styles.iconDanger}>🗑 Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View key={i} style={{ marginBottom: spacing.sm }}>
            <Text style={styles.policyTitle}>{s.title || '—'}</Text>
            <Text style={styles.policyBody}>{s.body || ''}</Text>
          </View>
        )))}
        {editable && (
          <Button title="+ Add policy" variant="outline"
            onPress={() => setForm((f) => ({
              ...f, policySections: [...(f.policySections || []), { title: '', body: '' }],
            }))} />
        )}
      </View>

      {editable && (
        <View style={{ marginBottom: spacing.lg }}>
          <Button title="Save Rules" onPress={doSave} loading={saving} />
        </View>
      )}

      {/* Employee-wise Exceptions — admin only, as the routes are */}
      {isAdmin && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Employee-wise Exceptions</Text>
          <Text style={styles.count}>
            {rows.filter((r) => r.count > 0).length} employee(s) on custom rules · {rows.length} total
          </Text>
          <Text style={styles.note}>
            The rules above are the firm default. Pick an employee to give them different working
            hours, paid leaves, WFH allowance or notice period. Blank always means "follow the firm rule".
          </Text>

          <Field label="Employee">
            <Select value={pick} placeholder="Select an employee..." searchable
              options={[{ value: '', label: 'Select an employee...' },
                ...rows.map((r) => ({
                  value: r.user.id,
                  label: `${r.user.name}${r.count ? `  (${r.count} custom)` : ''}`,
                  sub: r.user.designation || '-',
                }))]}
              onChange={(v) => void loadEmployee(v)} />
          </Field>

          {!detail ? (
            <Text style={styles.empty}>Select an employee above to view and edit their rules.</Text>
          ) : (
            <>
              <View style={styles.roBanner}>
                <Text style={styles.roBannerText}>
                  <Text style={{ fontWeight: '800' }}>{detail.user.name}</Text> · {detail.user.designation || '-'} · {detail.user.branch || '-'}
                </Text>
                <Text style={styles.roBannerText}>
                  WFH used this month: <Text style={{ fontWeight: '800' }}>{detail.wfhUsedThisMonth || 0}</Text>
                  {detail.setAt
                    ? ` · last changed by ${detail.setBy} on ${fmt(String(detail.setAt).slice(0, 10))}`
                    : ' · no exceptions set'}
                </Text>
                <Text style={styles.roBannerText}>
                  Sundays and 2nd/4th Saturdays are firm-wide and cannot be set per person.
                </Text>
              </View>

              {RO_GROUPS.map((g) => {
                const fields = (schema?.fields || []).filter((f) => g.keys.includes(f.key));
                if (!fields.length) return null;
                return (
                  <View key={g.title}>
                    <Text style={styles.groupHead}>{g.title.toUpperCase()}</Text>
                    {fields.map((f) => {
                      const custom = values[f.key] !== undefined && values[f.key] !== '';
                      return (
                        <View key={f.key} style={styles.roRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sumLabel}>
                              {f.label}{f.unit ? ` (${f.unit})` : ''}
                            </Text>
                            <Text style={styles.sumNote}>Firm: {roFmt(detail.firm[f.key])}</Text>
                          </View>
                          <View style={[styles.roInput, custom && styles.roCustom]}>
                            {f.kind === 'bool' ? (
                              <Select value={values[f.key] ?? ''} placeholder="Firm rule"
                                options={[{ value: '', label: 'Firm rule' },
                                  { value: '1', label: 'Yes' }, { value: '0', label: 'No' }]}
                                onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
                            ) : (
                              <Input value={values[f.key] ?? ''} placeholder="Firm rule"
                                keyboardType={f.kind === 'time' ? 'default' : 'numeric'}
                                onChangeText={(t) => setValues((p) => ({ ...p, [f.key]: t }))} />
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })}

              <Field label="Reason (optional)">
                <Input value={reason} onChangeText={setReason} placeholder="Why this exception?" />
              </Field>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button title="Save Changes" onPress={roSave} loading={roSaving} />
                </View>
                {!!Object.keys(detail.values || {}).length && (
                  <View style={{ flex: 1 }}>
                    <Button title="Reset to firm rules" onPress={roReset} variant="outline" />
                  </View>
                )}
              </View>

              {!!detail.history?.length && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={styles.subLabel}>Change history</Text>
                  {detail.history.map((h, i) => (
                    <Text key={i} style={styles.histRow}>
                      {fmt(String(h.at).slice(0, 10))} · {h.byName} — {(h.changes || []).join('; ')}
                      {h.reason ? ` (${h.reason})` : ''}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
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
  cardTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  note: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.sm },
  count: { ...font.small, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm },
  subLabel: { ...font.small, fontWeight: '700', color: colors.text, marginVertical: 6 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },

  groupHead: {
    ...font.tiny, color: colors.muted, backgroundColor: '#f8fafc',
    paddingVertical: 6, paddingHorizontal: 10, marginTop: 6,
  },
  sumRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sumLabel: { ...font.small, fontWeight: '600', color: colors.text },
  sumNote: { ...font.tiny, fontWeight: '500', color: colors.muted },
  sumValue: { ...font.small, fontWeight: '800', color: colors.text },
  tag: { borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 2 },
  tagText: { fontSize: 8, fontWeight: '800' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: 6 },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.small, fontWeight: '600', color: colors.text, flexShrink: 1 },
  satRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  satItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  policyItem: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 8, marginBottom: 8,
  },
  policyTitle: { ...font.small, fontWeight: '800', color: colors.text },
  policyBody: { ...font.small, fontWeight: '500', color: colors.text, lineHeight: 19 },
  removeBtn: { alignSelf: 'flex-end', marginTop: 6 },
  iconDanger: { ...font.tiny, fontWeight: '700', color: colors.red },

  roBanner: {
    backgroundColor: '#f8fafc', borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm,
  },
  roBannerText: { ...font.small, fontWeight: '500', color: colors.text, marginBottom: 2 },
  roRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  roInput: { width: 150 },
  roCustom: { borderRadius: radius.sm, borderWidth: 1.5, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  histRow: { ...font.tiny, fontWeight: '500', color: colors.muted, paddingVertical: 4 },
});
