import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as XLSX from 'xlsx';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/permissions';
import { DateField, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import type { Client, Invoice } from '../../data/types';
import { readPickedAsBytes } from '../../lib/files';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import { DASHBOARD_KEYS, rupees } from './logic';

/**
 * openClientProfile(). Shows the client's details, the portal dashboards an
 * admin may switch on or off, and the invoice register — including uploading a
 * register spreadsheet, which the web parses in the browser with SheetJS.
 */
export default function ClientProfileSheet({
  client, visible, onClose, onChanged, onOpenCompliance,
}: {
  client: Client | null;
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** The web's 🗓️ Compliance button — admin only, opens the per-client editor. */
  onOpenCompliance: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const admin = isAdmin(user);

  const [dash, setDash] = useState({ tasks: true, billing: true, cashflow: true, debtors: true });
  const [dashStatus, setDashStatus] = useState('');
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invState, setInvState] = useState<'idle' | 'loading' | 'denied'>('idle');
  const [uploading, setUploading] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const loadInvoices = useCallback(async (id: string) => {
    setInvState('loading');
    try {
      const rows = await api.get<Invoice[]>(endpoints.clientInvoices(id));
      setInvoices(rows || []);
      setInvState('idle');
    } catch (e) {
      // The register is admin-only server-side; hide it rather than show an error.
      setInvoices(null);
      setInvState((e as ApiError)?.kind === 'forbidden' ? 'denied' : 'idle');
    }
  }, []);

  useEffect(() => {
    if (!visible || !client) return;
    const d = client.dashboards || {};
    setDash({
      tasks: d.tasks !== false,
      billing: d.billing !== false,
      cashflow: d.cashflow !== false,
      debtors: d.debtors !== false,
    });
    setDashStatus('');
    setEditingDate(null);
    void loadInvoices(client.id);
  }, [visible, client?.id, loadInvoices]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!client) return null;

  const saveDashboards = async () => {
    try {
      await api.put(endpoints.clientDashboards(client.id), dash);
      setDashStatus('✓ Access updated');
      onChanged();
    } catch (e) {
      setDashStatus(e instanceof ApiError ? e.message : 'Could not save');
    }
  };

  /**
   * The web's <input type="file"> + in-browser XLSX parse becomes a document
   * picker plus the same SheetJS parse, then the identical POST body.
   */
  const uploadRegister = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setUploading(true);
    try {
      const bytes = await readPickedAsBytes(picked.assets[0].uri);
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      // Map the register's headers the way mapInvoiceRow() does: case-insensitive.
      const pick = (r: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          for (const rk of Object.keys(r)) {
            if (rk.trim().toLowerCase() === k.toLowerCase()) return r[rk];
          }
        }
        return undefined;
      };
      const toISO = (v: unknown) => {
        if (v === null || v === undefined || v === '') return null;
        if (v instanceof Date) return isNaN(+v) ? null : v.toISOString().slice(0, 10);
        const s = String(v).trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        return m ? m[0] : s || null;
      };
      const rows = raw.map((r) => ({
        invoiceDate: toISO(pick(r, 'Invoice Date', 'Inv Date', 'Date')),
        invoiceNo: String(pick(r, 'Invoice No', 'Invoice Number', 'Inv No') ?? '').trim(),
        customerName: String(pick(r, 'Customer Name', 'Customer', 'Party') ?? '').trim(),
        netReceivable: Number(pick(r, 'Net Receivable', 'Net Recv', 'Amount') ?? 0) || 0,
        estimatedDate: toISO(pick(r, 'Estimated Date', 'Est. Date', 'Est Date')),
      })).filter((r) => r.invoiceDate || r.invoiceNo);

      if (!rows.length) { showToast('No invoice rows found in that file', 'error'); return; }
      await api.post(endpoints.clientInvoices(client.id), { rows });
      await loadInvoices(client.id);
      showToast(`${rows.length} invoice row${rows.length > 1 ? 's' : ''} uploaded ✓`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not read that file', 'error');
    } finally {
      setUploading(false);
    }
  };

  const setActualDate = async (inv: Invoice, date: string) => {
    try {
      await api.put(endpoints.invoice(inv.id), { actualDate: date || null });
      setInvoices((prev) =>
        (prev || []).map((x) => (x.id === inv.id ? { ...x, actualDate: date || null } : x)));
      setEditingDate(null);
      showToast(date ? 'Marked paid' : 'Payment date cleared');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not update', 'error');
    }
  };

  return (
    <Sheet visible={visible} title={client.name} onClose={onClose}>
      {/* ── Details ── */}
      <View style={styles.meta}>
        <Text style={styles.metaLine}>🏢 <Text style={styles.b}>{client.name}</Text> · {client.type || '—'}</Text>
        {!!client.pan && <Text style={styles.metaLine}>PAN: <Text style={styles.b}>{client.pan}</Text></Text>}
        {!!client.gst && <Text style={styles.metaLine}>GST: {client.gst}</Text>}
        {!!client.contact && <Text style={styles.metaLine}>📞 {client.contact}</Text>}
        {!!client.address && <Text style={styles.metaLine}>📍 {client.address}</Text>}
        <Text style={styles.metaMuted}>
          {client.hasLogin || client.clientUsername ? '🔐 Client login active' : 'No client login set'}
        </Text>
      </View>

      {/* ── Portal dashboard access (admin only) ── */}
      {admin && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Client portal access</Text>
          {DASHBOARD_KEYS.map((d) => {
            const on = dash[d.key];
            return (
              <Pressable
                key={d.key}
                onPress={() => setDash((prev) => ({ ...prev, [d.key]: !prev[d.key] }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.toggleRow}
              >
                <View style={[styles.box, on && styles.boxOn]}>
                  {on && <Text style={styles.tick}>✓</Text>}
                </View>
                <Text style={styles.toggleLabel}>{d.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Save access" onPress={saveDashboards} variant="outline" />
          </View>
          {!!dashStatus && (
            <Text style={[styles.status, dashStatus.startsWith('✓') && { color: colors.green }]}>
              {dashStatus}
            </Text>
          )}
        </View>
      )}

      {/* ── Compliance editor — the web shows this button to admins only ── */}
      {admin && (
        <View style={styles.block}>
          <Button title="🗓️ Compliance" onPress={onOpenCompliance} variant="outline" />
        </View>
      )}

      {/* ── Invoice register (admin only, server-side) ── */}
      {invState !== 'denied' && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Invoice register</Text>
          {admin && (
            <View style={{ marginBottom: spacing.md }}>
              <Button
                title="⬆ Upload register (.xlsx)"
                onPress={uploadRegister}
                loading={uploading}
                variant="outline"
              />
            </View>
          )}
          {invState === 'loading' && <Text style={styles.empty}>Loading…</Text>}
          {invState === 'idle' && invoices !== null && invoices.length === 0 && (
            <Text style={styles.empty}>No invoice register uploaded yet.</Text>
          )}
          {invState === 'idle' && !!invoices?.length && (
            <>
              <Text style={styles.invHead}>
                Invoices ({invoices.length}) — set an Actual Payment Date to mark paid
              </Text>
              <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                {invoices.map((iv) => (
                  <View key={iv.id} style={styles.invRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.invNo}>{iv.invoiceNo || '—'}</Text>
                      <Text style={styles.invMeta} numberOfLines={1}>
                        {fmt(iv.invoiceDate)} · {iv.customerName || '—'}
                      </Text>
                      <Text style={styles.invMeta}>Est. {fmt(iv.estimatedDate)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.invAmt}>{rupees(iv.netReceivable)}</Text>
                      {editingDate === iv.id ? (
                        <View style={{ width: 150 }}>
                          <DateField
                            value={iv.actualDate || ''}
                            onChange={(d) => void setActualDate(iv, d)}
                            placeholder="Paid on"
                          />
                        </View>
                      ) : (
                        <Pressable onPress={() => setEditingDate(iv.id)} accessibilityRole="button" hitSlop={6}>
                          <Text style={[styles.paid, !iv.actualDate && { color: colors.primary }]}>
                            {iv.actualDate ? `✓ ${fmt(iv.actualDate)}` : 'Mark paid'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { marginBottom: spacing.lg },
  metaLine: { ...font.small, color: colors.text, fontWeight: '500', lineHeight: 22 },
  metaMuted: { ...font.small, color: colors.muted, fontWeight: '500', marginTop: 4 },
  b: { fontWeight: '800' },
  block: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginBottom: spacing.md },
  blockTitle: { ...font.h3, color: colors.text, marginBottom: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, minHeight: 44 },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 11, fontWeight: '900' },
  toggleLabel: { ...font.small, color: colors.text },
  status: { ...font.small, color: colors.red, marginTop: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  invHead: { ...font.small, color: colors.text, marginBottom: spacing.sm },
  invRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  invNo: { ...font.small, color: colors.text },
  invMeta: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  invAmt: { ...font.small, color: colors.text },
  paid: { ...font.tiny, color: colors.green, fontWeight: '700' },
});
