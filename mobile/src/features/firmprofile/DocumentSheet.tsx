import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { readPickedAsBase64 } from '../../lib/files';
import { colors, font, radius, spacing } from '../../theme/theme';
import { DOC_FIELD_LABEL, DOC_MAX_BYTES, type DocMeta, type FirmDoc, type FirmProfile } from './logic';

/** POST /firm-profile/docs response. */
interface DocUploadResult {
  docId: string;
  docs: FirmDoc[];
  proposals?: { field: string; value: string; status: 'new' | 'same' | 'differs'; current?: string }[];
  notes?: string[];
  readError?: string;
}

/**
 * openDocForm() / saveDoc() / showDocReview() / applyDocFields() — upload a
 * certificate, let the server read it, then confirm which read values overwrite
 * the profile. The browser's <input type="file"> + FileReader data URL become a
 * document picker plus a base64 read; the server still requires a data: URL.
 */
export default function DocumentSheet({
  visible, onClose, onDocs, onProfile,
}: {
  visible: boolean;
  onClose: () => void;
  onDocs: (docs: FirmDoc[]) => void;
  onProfile: (p: FirmProfile) => void;
}) {
  const { showToast } = useToast();
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [fieldKey, setFieldKey] = useState('other');
  const [label, setLabel] = useState('');
  const [docNo, setDocNo] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [manual, setManual] = useState(false);

  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DocUploadResult | null>(null);
  const [apply, setApply] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!visible) return;
    setFieldKey('other'); setLabel(''); setDocNo(''); setIssueDate('');
    setExpiryDate(''); setNotes(''); setFile(null); setResult(null);
    setApply({}); setManual(false);
    void (async () => {
      try { setMeta(await api.get<DocMeta>(endpoints.firmDocsMeta, { background: true })); }
      catch { setMeta(null); }
    })();
  }, [visible]);

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const a = picked.assets[0];
    if ((a.size || 0) > DOC_MAX_BYTES) { showToast('File is larger than 8 MB', 'error'); return; }
    setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size ?? undefined });
  };

  const upload = async () => {
    if (!file) { showToast('Choose a file to upload', 'error'); return; }
    setBusy(true);
    try {
      // The server accepts only a data: URL, so rebuild one from the picked file.
      const b64 = await readPickedAsBase64(file.uri);
      const mime = file.mimeType || 'application/pdf';
      const r = await api.post<DocUploadResult>(endpoints.firmDocs, {
        fieldKey, label: label.trim(), docNo: docNo.trim(),
        issueDate, expiryDate, notes: notes.trim(),
        fileName: file.name, fileBase64: `data:${mime};base64,${b64}`,
      }, { timeoutMs: 60000 });
      onDocs(r.docs || []);
      setResult(r);
      // Everything the document says that isn't already the profile's value is
      // ticked by default, exactly as the web's checkboxes are.
      const next: Record<string, boolean> = {};
      (r.proposals || []).forEach((p) => { if (p.status !== 'same') next[p.field] = true; });
      setApply(next);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyFields = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const fields = Object.keys(apply).filter((k) => apply[k]);
      const r = await api.post<{ profile: FirmProfile; applied?: string[] }>(
        endpoints.firmDocApply(result.docId), { fields },
      );
      onProfile(r.profile);
      onClose();
      showToast(r.applied?.length
        ? 'Firm Profile updated from the document ✓'
        : 'Document stored securely ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not apply', 'error');
    } finally {
      setBusy(false);
    }
  };

  const actionable = (result?.proposals || []).filter((p) => p.status !== 'same');
  const footer = !result
    ? <Button title="Upload & read" onPress={upload} loading={busy} />
    : actionable.length
      ? <Button title="Apply to Firm Profile" onPress={applyFields} loading={busy} />
      : <Button title="Done" onPress={() => { onClose(); showToast('Document stored securely ✓'); }} />;

  return (
    <Sheet visible={visible} title="Upload Document" onClose={onClose} footer={footer}>
      {!result && (
        <>
          <Field label="Attach to *">
            <Select value={fieldKey} placeholder="Other" onChange={setFieldKey}
              options={(meta?.fields || [{ key: 'other', label: 'Other' }])
                .map((f) => ({ value: f.key, label: f.label }))} />
          </Field>

          <Field label="File * — PDF, JPG, PNG or WebP, max 8 MB">
            <Pressable onPress={pick} accessibilityRole="button"
              style={({ pressed }) => [styles.picker, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.pickerText, !file && { color: colors.muted }]} numberOfLines={1}>
                {file ? file.name : 'Choose a file…'}
              </Text>
            </Pressable>
          </Field>

          <View style={styles.hint}>
            <Text style={styles.hintText}>
              📄 The number and dates are read from the PDF — you don't need to type them.
              You'll get a chance to confirm before anything is saved to the profile.
            </Text>
          </View>

          <Pressable onPress={() => setManual((v) => !v)} accessibilityRole="button">
            <Text style={styles.disclosure}>
              Enter details manually (only if the file can't be read) {manual ? '▴' : '▾'}
            </Text>
          </Pressable>
          {manual && (
            <>
              <Field label="Label"><Input value={label} onChangeText={setLabel} placeholder="e.g. PAN card" /></Field>
              <Field label="Number"><Input value={docNo} onChangeText={setDocNo} placeholder="Document number" /></Field>
              <Field label="Issue date"><DateField value={issueDate} onChange={setIssueDate} /></Field>
              <Field label="Valid till"><DateField value={expiryDate} onChange={setExpiryDate} /></Field>
              <Field label="Notes"><Input value={notes} onChangeText={setNotes} multiline placeholder="Anything worth noting" /></Field>
            </>
          )}
        </>
      )}

      {!!result && (
        <>
          {!!result.readError && (
            <View style={[styles.note, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Text style={[styles.noteText, { color: '#92400e' }]}>⚠ {result.readError}</Text>
            </View>
          )}
          {(result.notes || []).map((n, i) => (
            <View key={i} style={[styles.note, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Text style={[styles.noteText, { color: colors.red }]}>⚠ {n}</Text>
            </View>
          ))}

          {result.proposals?.length ? (
            <View style={[styles.note, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
              <Text style={styles.readHead}>✓ Read from the document</Text>
              {result.proposals.map((p) => {
                const same = p.status === 'same';
                return (
                  <Pressable key={p.field} disabled={same}
                    onPress={() => setApply((a) => ({ ...a, [p.field]: !a[p.field] }))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: !!apply[p.field] }}
                    style={styles.propRow}>
                    <Text style={[styles.checkBox, same && { color: colors.muted }]}>
                      {same ? '☑' : apply[p.field] ? '☑' : '☐'}
                    </Text>
                    <Text style={styles.propText}>
                      <Text style={{ fontWeight: '800' }}>{DOC_FIELD_LABEL[p.field] || p.field}: </Text>
                      <Text style={styles.mono}>{p.value}</Text>
                      {p.status === 'new' && <Text style={{ color: colors.muted }}> — profile is blank, will be filled</Text>}
                      {same && <Text style={{ color: colors.green }}> — already matches the profile</Text>}
                      {p.status === 'differs' && (
                        <Text style={{ color: colors.red }}> — profile currently says {p.current}, ticking will overwrite</Text>
                      )}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : !result.readError ? (
            <View style={[styles.note, { backgroundColor: '#f8fafc', borderColor: colors.border }]}>
              <Text style={[styles.noteText, { color: colors.muted }]}>
                No registration number could be read from this file. It is stored safely;
                add the details manually if you need them.
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  picker: {
    height: 44, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.white,
  },
  pickerText: { ...font.body, color: colors.text },
  hint: {
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
    borderRadius: radius.sm, padding: 10, marginBottom: spacing.md,
  },
  hintText: { ...font.small, fontWeight: '500', color: colors.muted },
  disclosure: { ...font.small, fontWeight: '700', color: colors.muted, marginBottom: spacing.sm },

  note: { borderWidth: 1.5, borderRadius: radius.sm, padding: 10, marginBottom: spacing.sm },
  noteText: { ...font.small, fontWeight: '500' },
  readHead: { ...font.small, fontWeight: '800', color: colors.green, marginBottom: 6 },
  propRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 6, alignItems: 'flex-start' },
  checkBox: { fontSize: 16, color: colors.primary },
  propText: { ...font.small, fontWeight: '500', color: colors.text, flex: 1 },
  mono: { fontFamily: 'monospace' },
});
