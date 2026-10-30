import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { readPickedAsBase64 } from '../../lib/files';
import { colors, font, radius, spacing } from '../../theme/theme';
import { CARD_MAX_BYTES, MEMBER_STATUSES, type FirmMember, type FirmProfile } from './logic';

export type CardKind = 'firm' | 'member';

/** POST /firm-profile/parse-card response. */
interface ParsedCard {
  kind: CardKind;
  extracted: {
    firmName?: string; frn?: string; constitutionDate?: string;
    states?: string[];
    derived?: { partnersTotal?: number; fcaPartners?: number; caEmployees?: number };
    members?: FirmMember[];
    name?: string; membershipNo?: string; status?: string;
    enrolmentDate?: string; fellowDate?: string; cop?: boolean; copDate?: string;
    warnings?: string[];
  };
  current: FirmProfile;
  pages?: number;
}

/**
 * pickCard() / parseCard() / showCardReview() / applyCard() — import an ICAI
 * Firm or Member card. The server reads the PDF and returns what it found beside
 * what the profile currently holds; nothing is written until Apply.
 */
export default function CardImportSheet({
  kind, onClose, onApplied,
}: {
  kind: CardKind | null;
  onClose: () => void;
  onApplied: (p: FirmProfile) => void;
}) {
  const { showToast } = useToast();
  const [parsed, setParsed] = useState<ParsedCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<FirmMember[]>([]);

  // Member-card editable fields
  const [mName, setMName] = useState('');
  const [mNo, setMNo] = useState('');
  const [mStatus, setMStatus] = useState('');
  const [mEnrol, setMEnrol] = useState('');
  const [mFellow, setMFellow] = useState('');
  const [mPartner, setMPartner] = useState(true);

  const visible = !!kind;

  const pickAndParse = async () => {
    if (!kind) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf', copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    if ((a.size || 0) > CARD_MAX_BYTES) {
      showToast('That PDF is too large (max ~14 MB)', 'error'); return;
    }
    setBusy(true);
    showToast('Reading the card…');
    try {
      const b64 = await readPickedAsBase64(a.uri);
      const r = await api.post<ParsedCard>(endpoints.firmProfileParseCard, {
        fileBase64: `data:application/pdf;base64,${b64}`, kind,
      }, { timeoutMs: 60000 });
      setParsed(r);
      setMembers(r.extracted.members || []);
      const e = r.extracted;
      setMName(e.name || ''); setMNo(e.membershipNo || ''); setMStatus(e.status || '');
      setMEnrol(e.enrolmentDate || ''); setMFellow(e.fellowDate || ''); setMPartner(true);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not read the card', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyCard = async () => {
    if (!parsed || !kind) return;
    setBusy(true);
    try {
      const data = kind === 'firm'
        ? { ...parsed.extracted, members }
        : {
          membershipNo: mNo.trim(), name: mName.trim(), status: mStatus,
          enrolmentDate: mEnrol, fellowDate: mFellow, isPartner: mPartner,
          cop: !!parsed.extracted.cop, copDate: parsed.extracted.copDate || '',
        };
      if (kind === 'member' && !mNo.trim()) {
        showToast('Membership number is required', 'error'); setBusy(false); return;
      }
      const r = await api.post<{ profile: FirmProfile; applied?: string[] }>(
        endpoints.firmProfileApplyCard, { kind, data },
      );
      onApplied(r.profile);
      close();
      showToast(`Card applied ✓ — ${(r.applied || []).join(', ')}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not apply', 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setParsed(null); setMembers([]); onClose(); };

  const title = kind === 'member'
    ? (parsed ? 'Review Member Card' : 'Import Member Card')
    : (parsed ? 'Review Firm Card' : 'Import Firm Card');

  const e = parsed?.extracted;
  const cur = parsed?.current;

  /** _row(): current vs card, with the changed value called out. */
  const Row = ({ label, oldV, newV }: { label: string; oldV?: string; newV?: string }) => {
    const changed = String(oldV || '') !== String(newV || '') && String(newV || '').trim() !== '';
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowOld}>{oldV || '—'}</Text>
        <Text style={[styles.rowNew, changed && { color: colors.green, fontWeight: '800' }]}>
          {newV || '—'}{changed ? ' ←' : ''}
        </Text>
      </View>
    );
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={close}
      footer={parsed
        ? <Button title="Apply Changes" onPress={applyCard} loading={busy} />
        : <Button title="Choose PDF" onPress={pickAndParse} loading={busy} />}
    >
      {!parsed ? (
        <Text style={styles.intro}>
          Choose the ICAI {kind === 'member' ? 'Member' : 'Firm'} Card PDF. It is read on the
          server and you confirm every value before anything is saved.
        </Text>
      ) : (
        <>
          {!!e?.warnings?.length && (
            <View style={styles.warn}>
              {e.warnings.map((w, i) => <Text key={i} style={styles.warnText}>⚠ {w}</Text>)}
            </View>
          )}
          <Text style={styles.intro}>
            Read from the card. Check it against the PDF — blank values are left untouched.
          </Text>

          <View style={styles.table}>
            <View style={styles.headRow}>
              <Text style={[styles.headCell, { flex: 1.1 }]}>FIELD</Text>
              <Text style={[styles.headCell, { flex: 1 }]}>CURRENT</Text>
              <Text style={[styles.headCell, { flex: 1 }]}>FROM CARD</Text>
            </View>
            {kind === 'firm' ? (
              <>
                <Row label="Firm Name" oldV={cur?.firmName} newV={e?.firmName} />
                <Row label="FRN" oldV={cur?.frn} newV={e?.frn} />
                <Row label="Date of Constitution" oldV={cur?.constitutionDate} newV={e?.constitutionDate} />
              </>
            ) : (
              <Row
                label="Membership No"
                oldV={(cur?.members || []).find((m) => m.membershipNo === e?.membershipNo)
                  ? e?.membershipNo : ''}
                newV={e?.membershipNo}
              />
            )}
          </View>

          {kind === 'firm' ? (
            <>
              {!!e?.states?.length && (
                <Text style={styles.intro}>
                  <Text style={{ fontWeight: '800' }}>Branch states detected: </Text>
                  {e.states.join(', ')} — these will be added to “states we can serve”.
                </Text>
              )}
              <View style={styles.derived}>
                {([['PARTNERS', e?.derived?.partnersTotal || 0, colors.primary],
                   ['FCA PARTNERS', e?.derived?.fcaPartners || 0, colors.green],
                   ['PAID ASSISTANTS', e?.derived?.caEmployees || 0, colors.muted]] as [string, number, string][])
                  .map(([l, v, c]) => (
                    <View key={l} style={styles.derivedCell}>
                      <Text style={[styles.derivedValue, { color: c }]}>{v}</Text>
                      <Text style={styles.derivedLabel}>{l}</Text>
                    </View>
                  ))}
              </View>

              <Text style={styles.section}>Members found: {members.length}</Text>
              {/* Rendered inline, not in its own ScrollView: a vertical scroller
                  nested in the sheet's vertical scroller never wins the gesture on
                  Android, so a capped list clipped every member past the second. */}
              {!!members.length && (
                <View>
                  {members.map((m, i) => (
                    <View key={m.membershipNo || i} style={styles.memberRow}>
                      <Field label={`M.No ${m.membershipNo || '—'}`}>
                        <Input value={m.name || ''}
                          onChangeText={(t) => setMembers((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, name: t } : x)))}
                          placeholder="Name" />
                      </Field>
                      <View style={styles.memberControls}>
                        <View style={{ flex: 1 }}>
                          <Select value={m.status || ''} placeholder="—" options={MEMBER_STATUSES}
                            onChange={(v) => setMembers((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, status: v } : x)))} />
                        </View>
                        <Pressable accessibilityRole="checkbox"
                          accessibilityState={{ checked: !!m.isPartner }}
                          onPress={() => setMembers((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, isPartner: !x.isPartner } : x)))}
                          style={styles.checkRow}>
                          <Text style={styles.checkBox}>{m.isPartner ? '☑' : '☐'}</Text>
                          <Text style={styles.checkLabel}>Partner</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.footnote}>
                Names and ACA/FCA are editable — card layouts vary, so please confirm.
                Partner/FCA counts update automatically.
              </Text>
            </>
          ) : (
            <>
              <Field label="Name"><Input value={mName} onChangeText={setMName} /></Field>
              <Field label="Membership No"><Input value={mNo} onChangeText={setMNo} /></Field>
              <Field label="Status">
                <Select value={mStatus} placeholder="—" options={MEMBER_STATUSES} onChange={setMStatus} />
              </Field>
              <Field label="Date of Enrolment"><DateField value={mEnrol} onChange={setMEnrol} /></Field>
              <Field label="Fellow Since"><DateField value={mFellow} onChange={setMFellow} /></Field>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: mPartner }}
                onPress={() => setMPartner((v) => !v)} style={styles.checkRow}>
                <Text style={styles.checkBox}>{mPartner ? '☑' : '☐'}</Text>
                <Text style={styles.checkLabel}>Is a partner</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.sm },
  warn: {
    backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a',
    borderRadius: radius.md, padding: 10, marginBottom: spacing.sm,
  },
  warnText: { ...font.small, fontWeight: '500', color: '#92400e' },

  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', marginBottom: spacing.md },
  headRow: { flexDirection: 'row', backgroundColor: '#334155' },
  headCell: { ...font.tiny, color: colors.white, padding: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowLabel: { ...font.small, fontWeight: '700', color: colors.text, flex: 1.1, padding: 7 },
  rowOld: { ...font.small, fontWeight: '500', color: colors.muted, flex: 1, padding: 7 },
  rowNew: { ...font.small, fontWeight: '500', color: colors.muted, flex: 1, padding: 7 },

  derived: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  derivedCell: {
    flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, padding: 8, alignItems: 'center',
  },
  derivedValue: { fontSize: 18, fontWeight: '900' },
  derivedLabel: { ...font.tiny, color: colors.muted },

  section: { ...font.h3, color: colors.text, marginBottom: 6 },
  memberRow: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: spacing.sm, marginBottom: spacing.sm },
  memberControls: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox: { fontSize: 18, color: colors.primary },
  checkLabel: { ...font.small, color: colors.text },
  footnote: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 6 },
});
