import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Select } from '../../components/form';
import { Button, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt, fmtDT } from '../assignments/logic';
import CardImportSheet, { type CardKind } from './CardImportSheet';
import DocumentSheet from './DocumentSheet';
import ExperienceSheet from './ExperienceSheet';
import { openFirmDoc } from './docs';
import {
  CAG_CATEGORIES, docExpiryState, docSizeStr, expYearsStr, experienceSummary,
  memberCountLine, registrationWarnings, syncStatusLine,
  type DocMeta, type FirmDoc, type FirmExperience, type FirmProfile, type SyncStatus,
} from './logic';

/**
 * pg-firmprofile — "🏛 Firm Profile". ICAI details and tender-eligibility
 * credentials, the partner/member roster, the encrypted document vault, the
 * audit-experience registry and the card-import history.
 *
 * Load is read-only: GET /firm-profile and GET /tenders/sync-status. Save,
 * Sync now, card import/apply, document upload/apply/open/delete, experience
 * add/edit/delete and member removal are all explicit actions.
 */
export default function FirmProfileScreen() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const { users } = useData();

  const [profile, setProfile] = useState<FirmProfile | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [docMeta, setDocMeta] = useState<DocMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // Firm Details form
  const [firmName, setFirmName] = useState('');
  const [constitutionDate, setConstitutionDate] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [partnersTotal, setPartnersTotal] = useState('');
  const [fcaPartners, setFcaPartners] = useState('');
  const [caEmployees, setCaEmployees] = useState('');
  const [totalStaff, setTotalStaff] = useState('');
  const [frn, setFrn] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [msme, setMsme] = useState('');
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [t3, setT3] = useState('');
  const [peerTill, setPeerTill] = useState('');
  const [cagCategory, setCagCategory] = useState('');
  const [flags, setFlags] = useState({
    peerReview: false, cagEmpanelled: false, rbiEmpanelled: false,
    gemRegistered: false, psuAuditExp: false, bankAuditExp: false, autoSync: true,
  });
  const [states, setStates] = useState('');
  const [hoCity, setHoCity] = useState('');
  const [branches, setBranches] = useState('');
  const [partnerId, setPartnerId] = useState('');

  const [regWarn, setRegWarn] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [cardKind, setCardKind] = useState<CardKind | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [expRecord, setExpRecord] = useState<FirmExperience | null>(null);

  const isAdmin = user?.role === 'admin';

  /** loadFirmProfile(): fill every field from the profile. */
  const adopt = useCallback((p: FirmProfile) => {
    setProfile(p);
    setFirmName(p.firmName || '');
    setConstitutionDate(p.constitutionDate || '');
    setExperienceYears(p.experienceYears ? String(p.experienceYears) : '');
    setPartnersTotal(p.partnersTotal ? String(p.partnersTotal) : '');
    setFcaPartners(p.fcaPartners ? String(p.fcaPartners) : '');
    setCaEmployees(p.caEmployees ? String(p.caEmployees) : '');
    setTotalStaff(p.totalStaff ? String(p.totalStaff) : '');
    setFrn(p.frn || ''); setPan(p.pan || ''); setGstin(p.gstin || ''); setMsme(p.msme || '');
    setT1(p.turnoverY1 ? String(p.turnoverY1) : '');
    setT2(p.turnoverY2 ? String(p.turnoverY2) : '');
    setT3(p.turnoverY3 ? String(p.turnoverY3) : '');
    setPeerTill(p.peerReviewValidTill || '');
    setCagCategory(p.cagCategory || '');
    setFlags({
      peerReview: !!p.peerReview, cagEmpanelled: !!p.cagEmpanelled,
      rbiEmpanelled: !!p.rbiEmpanelled, gemRegistered: !!p.gemRegistered,
      psuAuditExp: !!p.psuAuditExp, bankAuditExp: !!p.bankAuditExp,
      autoSync: p.autoSync !== false,
    });
    setStates((p.states || []).join('\n'));
    setHoCity(p.headOfficeCity || '');
    setBranches((p.branchCities || []).join(', '));
    setPartnerId(p.defaultTenderPartnerId || '');
  }, []);

  const load = useCallback(async () => {
    try {
      adopt(await api.get<FirmProfile>(endpoints.firmProfile));
    } catch { /* the web swallows this too */ }
    try {
      setSync(await api.get<SyncStatus>(endpoints.tendersSyncStatus, { background: true }));
    } catch { setSync(null); }
    try {
      setDocMeta(await api.get<DocMeta>(endpoints.firmDocsMeta, { background: true }));
    } catch { setDocMeta(null); }
    setLoading(false);
  }, [adopt]);

  useEffect(() => { void load(); }, [load]);

  /** fpPartner: admins plus anyone whose designation says partner. */
  const partnerOptions = useMemo(() => [
    { value: '', label: '— none —' },
    ...users
      .filter((u) => u.role === 'admin' || (u.designation || '').toLowerCase().includes('partner'))
      .map((u) => ({ value: u.id, label: u.name })),
  ], [users]);

  const save = async () => {
    const P = pan.toUpperCase().trim();
    const G = gstin.toUpperCase().trim();
    const warns = registrationWarnings(P, G);
    setRegWarn(warns);   // warn, never block — exactly as the web does
    setSaving(true);
    const N = (v: string) => parseFloat(v) || 0;
    try {
      const chosen = partnerOptions.find((o) => o.value === partnerId);
      await api.put(endpoints.firmProfile, {
        firmName, frn: frn.toUpperCase().trim(), constitutionDate,
        experienceYears: N(experienceYears), pan: P, gstin: G, msme: msme.toUpperCase().trim(),
        partnersTotal: N(partnersTotal), fcaPartners: N(fcaPartners),
        caEmployees: N(caEmployees), totalStaff: N(totalStaff),
        turnoverY1: N(t1), turnoverY2: N(t2), turnoverY3: N(t3),
        peerReview: flags.peerReview, peerReviewValidTill: peerTill,
        cagEmpanelled: flags.cagEmpanelled, cagCategory,
        rbiEmpanelled: flags.rbiEmpanelled, gemRegistered: flags.gemRegistered,
        psuAuditExp: flags.psuAuditExp, bankAuditExp: flags.bankAuditExp,
        autoSync: flags.autoSync,
        states, headOfficeCity: hoCity.trim(), branchCities: branches,
        defaultTenderPartnerId: partnerId,
        defaultTenderPartnerName: partnerId ? (chosen?.label || '') : '',
      });
      showToast('Firm profile saved ✓ — tenders will now be auto-checked');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = () => {
    Alert.alert(
      'Sync tenders now',
      'Fetch the latest ICAI tenders and read their PDFs? This imports new tender records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            setSyncing(true);
            try {
              const r = await api.post<{ error?: string; imported?: number; analysed?: number }>(
                endpoints.tendersSyncNow, {}, { timeoutMs: 60000 },
              );
              showToast(r.error
                ? `Sync failed: ${r.error}`
                : `${r.imported || 0} new tender(s) imported, ${r.analysed || 0} PDF(s) read ✓`);
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Sync failed', 'error');
            } finally {
              setSyncing(false);
              try { setSync(await api.get<SyncStatus>(endpoints.tendersSyncStatus, { background: true })); }
              catch { setSync(null); }
            }
          },
        },
      ],
    );
  };

  const removeMember = (no: string) => {
    Alert.alert('Remove member', `Remove member ${no} from the firm profile?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            const r = await api.del<{ profile: FirmProfile }>(endpoints.firmProfileMember(no));
            adopt(r.profile);
            showToast('Member removed');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not remove', 'error');
          }
        },
      },
    ]);
  };

  const viewDoc = async (d: FirmDoc) => {
    try { await openFirmDoc(d, token); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not open document', 'error'); }
  };

  const deleteDoc = (d: FirmDoc) => {
    Alert.alert(
      'Delete document',
      'Delete this document permanently? The encrypted file is removed from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const r = await api.del<{ docs: FirmDoc[] }>(endpoints.firmDoc(d.id));
              setProfile((p) => (p ? { ...p, docs: r.docs } : p));
              showToast('Document deleted');
            } catch (e) {
              showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
            }
          },
        },
      ],
    );
  };

  const deleteExp = (r: FirmExperience) => {
    Alert.alert('Remove experience', 'Remove this experience record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            adopt(await api.del<FirmProfile>(endpoints.firmExperienceItem(r.id)));
            showToast('Removed');
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  if (loading) return <Loading label="Loading firm profile…" />;

  const members = profile?.members || [];
  const docs = profile?.docs || [];
  const experience = profile?.experience || [];
  const history = profile?.cardImports || [];

  const Check = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      onPress={onPress} style={styles.checkRow}>
      <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.pageSub}>ICAI details & tender-eligibility credentials</Text>

        <View style={styles.importRow}>
          <View style={{ flex: 1 }}>
            <Button title="⬆ Import Firm Card" onPress={() => setCardKind('firm')} variant="outline" />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="⬆ Import Member Card" onPress={() => setCardKind('member')} variant="outline" />
          </View>
        </View>

        {/* renderFirmBanner(): shown until an admin has saved the profile once */}
        {profile && !profile.configured && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              The firm profile has not been filled in yet. Import the ICAI Firm Card or complete
              the details below so tenders can be checked automatically.
            </Text>
          </View>
        )}

        {/* ── Firm Details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Firm Details</Text>
          <Field label="Firm Name"><Input value={firmName} onChangeText={setFirmName} /></Field>
          <Field label="Date of Constitution">
            <DateField value={constitutionDate} onChange={setConstitutionDate} />
          </Field>
          <Field label="Years of Experience">
            <Input value={experienceYears} onChangeText={setExperienceYears} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="Total Partners">
            <Input value={partnersTotal} onChangeText={setPartnersTotal} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="FCA Partners">
            <Input value={fcaPartners} onChangeText={setFcaPartners} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="CA Employees">
            <Input value={caEmployees} onChangeText={setCaEmployees} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="Total Staff">
            <Input value={totalStaff} onChangeText={setTotalStaff} keyboardType="numeric" placeholder="0" />
          </Field>

          <Text style={styles.subHead}>REGISTRATION NUMBERS</Text>
          <Field label="Firm Registration No. (FRN)">
            <Input value={frn} onChangeText={setFrn} placeholder="e.g. 136616W" />
          </Field>
          <Field label="PAN"><Input value={pan} onChangeText={setPan} placeholder="e.g. AAAFG1234A" /></Field>
          <Field label="GSTIN"><Input value={gstin} onChangeText={setGstin} placeholder="e.g. 09AAAFG1234A1Z5" /></Field>
          <Field label="MSME / Udyam Reg. No.">
            <Input value={msme} onChangeText={setMsme} placeholder="e.g. UDYAM-UP-00-0000000" />
          </Field>
          {!!regWarn.length && (
            <Text style={styles.regWarn}>
              ⚠ {regWarn.join(' · ')} — saved anyway, please double-check.
            </Text>
          )}

          <Text style={styles.subHead}>TURNOVER — LAST 3 FINANCIAL YEARS (₹)</Text>
          <Field label="Latest FY"><Input value={t1} onChangeText={setT1} keyboardType="numeric" placeholder="0" /></Field>
          <Field label="Previous FY"><Input value={t2} onChangeText={setT2} keyboardType="numeric" placeholder="0" /></Field>
          <Field label="FY before"><Input value={t3} onChangeText={setT3} keyboardType="numeric" placeholder="0" /></Field>

          <Field label="Peer Review Valid Till"><DateField value={peerTill} onChange={setPeerTill} /></Field>
          <Field label="CAG Category">
            <Select value={cagCategory} placeholder="—" options={CAG_CATEGORIES} onChange={setCagCategory} />
          </Field>

          <Check label="Peer Review certificate" on={flags.peerReview}
            onPress={() => setFlags((f) => ({ ...f, peerReview: !f.peerReview }))} />
          <Check label="CAG empanelled" on={flags.cagEmpanelled}
            onPress={() => setFlags((f) => ({ ...f, cagEmpanelled: !f.cagEmpanelled }))} />
          <Check label="RBI empanelled" on={flags.rbiEmpanelled}
            onPress={() => setFlags((f) => ({ ...f, rbiEmpanelled: !f.rbiEmpanelled }))} />
          <Check label="GeM registered" on={flags.gemRegistered}
            onPress={() => setFlags((f) => ({ ...f, gemRegistered: !f.gemRegistered }))} />
          <Check label="PSU audit experience" on={flags.psuAuditExp}
            onPress={() => setFlags((f) => ({ ...f, psuAuditExp: !f.psuAuditExp }))} />
          <Check label="Bank audit experience" on={flags.bankAuditExp}
            onPress={() => setFlags((f) => ({ ...f, bankAuditExp: !f.bankAuditExp }))} />

          <Text style={styles.subHead}>OFFICES — decides “local office” tender criteria</Text>
          <Field label="Head office city">
            <Input value={hoCity} onChangeText={setHoCity} placeholder="e.g. Greater Noida" />
          </Field>
          <Field label="Branch office cities (comma separated)">
            <Input value={branches} onChangeText={setBranches} placeholder="Kolkata, Mumbai" />
          </Field>
          <Field label="States we can serve (one per line or comma separated)">
            <Input value={states} onChangeText={setStates} multiline placeholder={'Uttar Pradesh\nDelhi'} />
          </Field>
          <Text style={styles.footnote}>
            States mean we can travel there. Many tenders demand a branch in the named city as per
            ICAI records — list every city you actually hold an office in under Branch office cities
            above, or the eligibility check will flag them for manual review.
          </Text>

          <Field label="Default partner for imported tenders">
            <Select value={partnerId} placeholder="— none —" options={partnerOptions} onChange={setPartnerId} />
          </Field>
          <Check label="Hourly auto-sync of ICAI tenders" on={flags.autoSync}
            onPress={() => setFlags((f) => ({ ...f, autoSync: !f.autoSync }))} />

          <View style={styles.saveRow}>
            <View style={{ flex: 1 }}>
              <Button title="Save Firm Profile" onPress={save} loading={saving} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="⟳ Sync tenders now" onPress={syncNow} variant="outline" loading={syncing} />
            </View>
          </View>
          <Text style={styles.syncLine}>{syncStatusLine(sync)}</Text>
        </View>

        {/* ── Partners & Members ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Partners & Members</Text>
            <Text style={styles.countLine}>{memberCountLine(members)}</Text>
          </View>
          <Text style={styles.note}>
            Imported from the ICAI Firm Card. Partner and FCA counts above are kept in step with this list.
          </Text>
          {!members.length ? (
            <Text style={styles.empty}>No members yet. Import the ICAI Firm Card to populate this list.</Text>
          ) : members.map((m, i) => {
            const st = String(m.status || '').toUpperCase();
            return (
              <View key={m.membershipNo || i} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{m.name || '—'}</Text>
                  <Text style={styles.rowSub}>
                    <Text style={styles.mono}>{m.membershipNo || '—'}</Text>
                    {' · '}{m.isPartner ? 'Partner' : 'Employee'}
                    {m.joinedFirmDate ? ` · joined ${fmt(m.joinedFirmDate)}` : ''}
                    {m.enrolmentDate ? ` · enrolled ${fmt(m.enrolmentDate)}` : ''}
                  </Text>
                  <Text style={styles.rowMeta}>{m.source || '—'}</Text>
                </View>
                {!!st && (
                  <View style={[styles.pill, { backgroundColor: st === 'FCA' ? '#dcfce7' : '#e0f2fe' }]}>
                    <Text style={[styles.pillText, { color: st === 'FCA' ? '#15803d' : '#0369a1' }]}>{st}</Text>
                  </View>
                )}
                <Pressable onPress={() => removeMember(m.membershipNo)} accessibilityRole="button"
                  style={styles.iconBtn}>
                  <Text style={styles.iconDanger}>🗑</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* ── Document Vault ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>🔒 Document Vault</Text>
              <Text style={styles.note}>
                PAN, GST, MSME, certificates — encrypted at rest, admin-only, every view logged
              </Text>
            </View>
            {isAdmin && <Button title="+ Upload" onPress={() => setDocOpen(true)} />}
          </View>

          {docMeta && docMeta.keyConfigured === false && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                ⚠️ DOC_ENCRYPTION_KEY is not set. Documents are encrypted with a key derived from
                JWT_SECRET — if you ever rotate JWT_SECRET, stored files become unreadable.
              </Text>
            </View>
          )}

          {!isAdmin ? (
            <Text style={styles.empty}>🔒 Documents are visible to admins only.</Text>
          ) : !docs.length ? (
            <Text style={styles.empty}>
              No documents uploaded yet. Use + Upload to attach PAN, GST, MSME certificates and more.
            </Text>
          ) : (
            <>
              {docs.map((d) => {
                const st = docExpiryState(d.expiryDate);
                const col = st === 'expired' ? colors.red : st === 'soon' ? '#92400e' : colors.muted;
                return (
                  <View key={d.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{d.label || '—'}</Text>
                      {!!d.notes && <Text style={styles.rowMeta}>{d.notes}</Text>}
                      <Text style={styles.rowSub}>
                        <Text style={styles.mono}>{d.docNo || '—'}</Text>
                        {' · '}{String(d.ext || '').toUpperCase()} · {docSizeStr(d.size)}
                      </Text>
                      {!!d.expiryDate && (
                        <Text style={[styles.rowSub, { color: col, fontWeight: '700' }]}>
                          {fmt(d.expiryDate)}{st === 'expired' ? ' · EXPIRED' : st === 'soon' ? ' · due' : ''}
                        </Text>
                      )}
                      <Text style={styles.rowMeta}>
                        {fmt(d.uploadedAt)} {d.uploadedBy || ''}
                      </Text>
                    </View>
                    <Pressable onPress={() => void viewDoc(d)} accessibilityRole="button" style={styles.iconBtn}>
                      <Text style={styles.iconText}>👁</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteDoc(d)} accessibilityRole="button" style={styles.iconBtn}>
                      <Text style={styles.iconDanger}>🗑</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Text style={styles.footnote}>
                🔒 Encrypted at rest · admin-only · every open is recorded in the Audit Trail
              </Text>
            </>
          )}
        </View>

        {/* ── Audit Experience ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>🧾 Audit Experience</Text>
            <Button title="+ Add" onPress={() => { setExpRecord(null); setExpOpen(true); }} />
          </View>
          <Text style={styles.note}>
            Record each engagement client-wise. Tenders asking for “similar work”, “PSU experience”,
            “internal audit of a PSU” or “N years bank concurrent audit” are matched against this list.
          </Text>
          {!!experience.length && (
            <Text style={styles.countLine}>{experienceSummary(experience)}</Text>
          )}
          {!experience.length ? (
            <Text style={styles.empty}>
              No experience recorded yet. Tap + Add to record client-wise audit assignments.
            </Text>
          ) : experience.map((r) => (
            <View key={r.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.client || '—'}</Text>
                {!!r.sector && <Text style={styles.rowMeta}>{r.sector}</Text>}
                <Text style={styles.rowSub}>
                  {r.assignmentType || '—'} · {expYearsStr(r)}
                  {r.feeValue ? ` · ₹${Number(r.feeValue).toLocaleString('en-IN')}` : ''}
                </Text>
                <View style={[styles.pill, { backgroundColor: '#eef2ff', alignSelf: 'flex-start', marginTop: 4 }]}>
                  <Text style={[styles.pillText, { color: '#4338ca' }]}>{r.clientType || '—'}</Text>
                </View>
              </View>
              <Pressable onPress={() => { setExpRecord(r); setExpOpen(true); }} accessibilityRole="button"
                style={styles.iconBtn}>
                <Text style={styles.iconText}>✏️</Text>
              </Pressable>
              <Pressable onPress={() => deleteExp(r)} accessibilityRole="button" style={styles.iconBtn}>
                <Text style={styles.iconDanger}>🗑</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* ── Card Import History ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Card Import History</Text>
          {!history.length ? (
            <Text style={styles.empty}>No cards imported yet.</Text>
          ) : history.map((x, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.rowTitle}>
                {x.kind === 'firm' ? 'Firm Card' : 'Member Card'}
                <Text style={styles.rowSub}> · {fmtDT(x.at)} by {x.byName || '—'}</Text>
              </Text>
              {!!x.fields && <Text style={styles.rowMeta}>{x.fields}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>

      <CardImportSheet kind={cardKind} onClose={() => setCardKind(null)} onApplied={adopt} />
      <DocumentSheet
        visible={docOpen}
        onClose={() => setDocOpen(false)}
        onDocs={(d) => setProfile((p) => (p ? { ...p, docs: d } : p))}
        onProfile={adopt}
      />
      <ExperienceSheet
        visible={expOpen}
        record={expRecord}
        onClose={() => setExpOpen(false)}
        onSaved={adopt}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  pageSub: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.md },
  importRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  banner: {
    backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a',
    borderRadius: radius.md, padding: 10, marginBottom: spacing.md,
  },
  bannerText: { ...font.small, fontWeight: '500', color: '#92400e' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { ...font.h3, color: colors.text, flexShrink: 1 },
  subHead: { ...font.tiny, color: colors.muted, marginTop: spacing.sm, marginBottom: 4 },
  note: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.sm },
  countLine: { ...font.small, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm },
  footnote: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 6 },
  regWarn: { ...font.tiny, color: '#92400e', marginBottom: 6 },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.small, color: colors.text },

  saveRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  syncLine: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: spacing.sm },

  listRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  rowTitle: { ...font.small, fontWeight: '700', color: colors.text },
  rowSub: { ...font.small, fontWeight: '500', color: colors.muted, marginTop: 2 },
  rowMeta: { ...font.tiny, fontWeight: '500', color: '#94a3b8', marginTop: 2 },
  mono: { fontFamily: 'monospace' },

  pill: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { ...font.tiny, fontWeight: '800' },

  iconBtn: {
    width: 34, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  iconText: { fontSize: 13 },
  iconDanger: { fontSize: 13, color: colors.red },

  historyRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
});
