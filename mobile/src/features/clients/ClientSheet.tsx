import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isPartner } from '../../auth/permissions';
import { Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import type { Client } from '../../data/types';
import { colors, font, spacing } from '../../theme/theme';
import { CLIENT_BRANCHES, CLIENT_TYPES } from './logic';
import {
  GST_PREVIEW_ROWS, applyGstFields, confidenceColor, pickAndParseGstCert,
  type GstParseResult,
} from './gstCert';

/**
 * openClientSheet() / saveClient(). Only a partner or admin may choose the
 * branch; everyone else is pinned to their own, exactly as the web hides the row.
 */
export default function ClientSheet({
  editId, visible, onClose, onSaved,
}: {
  editId: string | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { clients } = useData();
  const { showToast } = useToast();
  const editing = !!editId;
  const existing = editing ? clients.find((c) => c.id === editId) : undefined;

  const [name, setName] = useState('');
  const [type, setType] = useState('Individual');
  const [pan, setPan] = useState('');
  const [gst, setGst] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [branch, setBranch] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // GST certificate reader: parsed fields are held here until they are applied.
  const [gstCert, setGstCert] = useState<GstParseResult | null>(null);
  const [gstReading, setGstReading] = useState(false);
  const [gstError, setGstError] = useState('');

  const canPickBranch = isPartner(user);

  /** gstCertRead(): pick the certificate, send it, and preview what came back. */
  const readGstCert = async () => {
    setGstError('');
    setGstReading(true);
    try {
      const r = await pickAndParseGstCert();
      if (r.status === 'cancelled') return;
      if (r.status === 'too-large') { setGstError('File is over 8 MB.'); return; }
      setGstCert(r.result);
    } catch (e) {
      // The web surfaces e.message too, so a parser refusal explains itself.
      setGstError((e instanceof Error && e.message) || 'Could not read the certificate');
    } finally {
      setGstReading(false);
    }
  };

  /** gstCertApply(): fill the form, leaving anything already typed untouched. */
  const applyGstCert = () => {
    if (!gstCert) return;
    applyGstFields(gstCert.fields, {
      name: setName, pan: setPan, gst: setGst, address: setAddress, type: setType,
    });
    showToast(`Form filled — check the values, then press ${editing ? 'Update' : 'Add'} Client`);
  };


  useEffect(() => {
    if (!visible) return;
    // gstCertReset(): wipe the reader whenever the sheet opens, so one client's
    // certificate can never be applied to another.
    setGstCert(null); setGstError('');
    if (existing) {
      setName(existing.name || '');
      setType(existing.type || 'Individual');
      setPan(existing.pan || '');
      setGst(existing.gst || '');
      setContact(existing.contact || '');
      setAddress(existing.address || '');
      setBranch(existing.branch || user?.branch || CLIENT_BRANCHES[0]);
      setUsername(existing.clientUsername || '');
      setPassword('');
    } else {
      setName(''); setType('Individual'); setPan(''); setGst('');
      setContact(''); setAddress(''); setUsername(''); setPassword('');
      setBranch(user?.branch || CLIENT_BRANCHES[0]);
    }
  }, [visible, existing?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) { showToast('Client name required', 'error'); return; }
    const body: Record<string, unknown> = {
      name: name.trim(), type, pan, gst, contact, address, branch: branch || '',
    };
    // Credentials are only sent when filled — an empty password never clears one.
    if (username.trim()) body.clientUsername = username.trim();
    if (password) body.clientPassword = password;

    setSaving(true);
    try {
      if (editing && existing) {
        await api.put<Client>(endpoints.client(existing.id), body);
        showToast('Client updated');
      } else {
        await api.post<Client>(endpoints.clients, body);
        showToast('Client added');
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
      title={editing ? 'Edit Client' : 'Add Client'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            <Button title={editing ? 'Update Client' : 'Add Client'} onPress={save} loading={saving} />
          </View>
        </>
      }
    >
      {/* ── GST certificate reader (gstCertRead / gstCertApply) ── */}
      <View style={styles.gstBlock}>
        <Button
          title="⬆ Read GST certificate (PDF)"
          onPress={readGstCert}
          variant="outline"
          loading={gstReading}
        />
        {!!gstError && <Text style={styles.gstError}>{gstError}</Text>}
        {!!gstCert && (
          <View style={styles.gstCard}>
            <Text style={styles.gstTitle}>Read from the certificate</Text>
            {GST_PREVIEW_ROWS.map((r) => {
              const val = gstCert.fields[r.field];
              if (!val) return null;
              const conf = gstCert.confidence?.[r.conf];
              return (
                <View key={r.label} style={styles.gstRow}>
                  <Text style={styles.gstLabel}>{r.label}</Text>
                  <Text style={styles.gstValue}>{val}</Text>
                  <Text style={[styles.gstConf, { color: confidenceColor(conf) }]}>
                    {(conf || '').toUpperCase()}
                  </Text>
                </View>
              );
            })}
            {!!gstCert.warnings?.length && (
              <Text style={styles.gstWarn}>⚠ {gstCert.warnings.join(' ')}</Text>
            )}
            <View style={{ marginTop: spacing.sm }}>
              <Button title="Fill the form with these" onPress={applyGstCert} />
            </View>
            <Text style={styles.gstNote}>
              PAN is derived from the GSTIN, so it is exact. Check the rest against the PDF.
            </Text>
          </View>
        )}
      </View>

      <Field label="Client Name *">
        <Input value={name} onChangeText={setName} placeholder="Registered name" />
      </Field>
      <Field label="Entity Type">
        <Select
          value={type}
          placeholder="Entity Type"
          options={CLIENT_TYPES.map((t) => ({ value: t, label: t }))}
          onChange={setType}
        />
      </Field>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="PAN">
            {/* The web uppercases PAN as you type; same here. */}
            <Input value={pan} onChangeText={(t) => setPan(t.toUpperCase())} placeholder="ABCDE1234F" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="GSTIN">
            <Input value={gst} onChangeText={(t) => setGst(t.toUpperCase())} placeholder="GSTIN" />
          </Field>
        </View>
      </View>
      <Field label="Contact">
        <Input value={contact} onChangeText={setContact} placeholder="Phone / email" />
      </Field>
      <Field label="Address">
        <Input value={address} onChangeText={setAddress} placeholder="City / address" multiline />
      </Field>

      {canPickBranch && (
        <Field label="Branch">
          <Select
            value={branch}
            placeholder="Branch"
            options={CLIENT_BRANCHES.map((b) => ({ value: b, label: b }))}
            onChange={setBranch}
          />
        </Field>
      )}

      <Text style={styles.section}>Client portal login</Text>
      {!!existing?.hasLogin && <Text style={styles.note}>🔐 A login is already set for this client.</Text>}
      <Field label="Username" hint="optional">
        <Input value={username} onChangeText={setUsername} placeholder="Portal username" />
      </Field>
      <Field label="Password" hint="leave blank to keep">
        <Input value={password} onChangeText={setPassword} placeholder="New password" />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  gstBlock: { marginBottom: spacing.md },
  gstError: { ...font.small, color: colors.red, marginTop: 6 },
  gstCard: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, padding: 11, marginTop: spacing.sm,
  },
  gstTitle: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: 5 },
  gstRow: { flexDirection: 'row', gap: 8, paddingVertical: 3, alignItems: 'flex-start' },
  gstLabel: { width: 96, ...font.small, fontWeight: '700', color: colors.muted },
  gstValue: { flex: 1, ...font.small, fontWeight: '700', color: colors.text },
  gstConf: { fontSize: 8, fontWeight: '800' },
  gstWarn: { ...font.tiny, fontWeight: '500', color: '#92400e', marginTop: 6 },
  gstNote: { ...font.tiny, fontWeight: '500', color: colors.muted, marginTop: 5 },
  pair: { flexDirection: 'row', gap: spacing.md },
  section: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: spacing.sm,
  },
  note: { ...font.small, color: colors.green, marginBottom: spacing.md },
});
