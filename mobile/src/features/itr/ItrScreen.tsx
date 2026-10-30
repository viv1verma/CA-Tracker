import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as XLSX from 'xlsx';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { readPickedAsBytes } from '../../lib/files';
import { useAuth } from '../../auth/AuthContext';
import { isItrAdmin } from '../../auth/permissions';
import { Select } from '../../components/form';
import { ErrorState, Loading } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { API_BASE_URL } from '../../config/env';
import { colors, font, radius, spacing } from '../../theme/theme';
import ItrPartySheet from './ItrPartySheet';
import {
  ITR_STAGES, ayOptions, filterParties, itrStats, latestTeamComment, stageColor,
  type ItrParty,
} from './logic';

/** Base64 for bytes, without relying on btoa. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

/**
 * pg-itrdash — the ITR Filing Tracker. Reading is safe: the page only GETs its
 * parties. Upload, export, assignment, stage and comments are the write paths.
 */
export default function ItrScreen() {
  const { user, token, branch } = useAuth();
  const { showToast } = useToast();

  const [parties, setParties] = useState<ItrParty[]>([]);
  const [ay, setAy] = useState('all');
  const [stage, setStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<ItrParty | null>(null);
  const [busy, setBusy] = useState('');

  const canAssign = isItrAdmin(user);

  /** Load is a plain GET — no writes on render. */
  const load = useCallback(async (opts?: { spinner?: boolean }) => {
    if (opts?.spinner) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const rows = await api.get<ItrParty[]>(endpoints.itrParties);
      setParties(rows || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load');
      setParties([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load({ spinner: true }); }, [load]);

  const stats = useMemo(() => itrStats(parties), [parties]);
  const ays = useMemo(() => ayOptions(parties), [parties]);
  const rows = useMemo(() => filterParties(parties, ay, stage), [parties, ay, stage]);

  /** downloadItrTemplate(): the same six-column starter sheet, shared natively. */
  const downloadTemplate = async () => {
    setBusy('template');
    try {
      const aoa = [
        ['PAN', 'Name', 'AY', 'Type', 'Email', 'Mobile'],
        ['ABCDE1234F', 'Ramesh Kumar', '2025-26', 'ITR-1', 'ramesh@email.com', '9876543210'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ITR Parties');
      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

      const target = new File(Paths.cache, 'ITR_Parties_Template.xlsx');
      try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
      target.create();
      target.write(b64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'ITR Parties Template',
        });
      }
    } catch {
      showToast('Could not build the template', 'error');
    } finally {
      setBusy('');
    }
  };

  /** uploadItrList(): parse the sheet on device, then POST the rows in bulk. */
  const uploadList = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setBusy('upload');
    try {
      const bytes = await readPickedAsBytes(picked.assets[0].uri);
      const wb = XLSX.read(bytes, { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]], { defval: '' },
      );
      const pick = (r: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          for (const rk of Object.keys(r)) {
            if (rk.trim().toLowerCase() === k.toLowerCase()) return String(r[rk] ?? '').trim();
          }
        }
        return '';
      };
      const items = raw.map((r) => ({
        pan: pick(r, 'PAN').toUpperCase(),
        name: pick(r, 'Name'),
        ay: pick(r, 'AY'),
        type: pick(r, 'Type'),
        email: pick(r, 'Email'),
        mobile: pick(r, 'Mobile'),
      })).filter((r) => r.pan);

      if (!items.length) { showToast('No rows with a PAN found', 'error'); return; }
      const r = await api.post<{ added?: number; updated?: number }>(endpoints.itrBulk, { rows: items });
      await load();
      showToast(`${r.added || 0} added, ${r.updated || 0} updated ✓`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not read that file', 'error');
    } finally {
      setBusy('');
    }
  };

  /** exportItr(): the server renders both formats; fetch the bytes and share. */
  const exportItr = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    try {
      const url = `${API_BASE_URL}${kind === 'xlsx' ? endpoints.itrExportXlsx : endpoints.itrExportPdf}`;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (branch && branch !== 'all') headers['X-Active-Branch'] = encodeURIComponent(branch);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Could not generate the export');
      const buf = await res.arrayBuffer();

      const name = `ITR_Parties.${kind}`;
      const target = new File(Paths.cache, name);
      try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
      target.create();
      target.write(toBase64(new Uint8Array(buf)), { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target.uri, {
          mimeType: kind === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
          dialogTitle: name,
        });
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <Loading label="Loading ITR filings…" />;
  if (error && !parties.length) {
    return <ErrorState message={error} onRetry={() => void load({ spinner: true })} />;
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load()}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sub}>
          Income-tax return filing — separate from clients &amp; tasks
        </Text>

        {/* Filters */}
        <View style={styles.filters}>
          <View style={{ flex: 1 }}>
            <Select
              value={ay}
              placeholder="All AY"
              options={[{ value: 'all', label: 'All AY' }, ...ays.map((a) => ({ value: a, label: a }))]}
              onChange={setAy}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              value={stage}
              placeholder="All Stages"
              options={[
                { value: 'all', label: 'All Stages' },
                ...ITR_STAGES.map((s) => ({ value: s, label: s })),
              ]}
              onChange={setStage}
            />
          </View>
        </View>

        {/* Toolbar */}
        <View style={styles.actions}>
          {canAssign && (
            <Act label={busy === 'upload' ? 'Reading…' : '⬆ Upload List'} onPress={uploadList} disabled={!!busy} />
          )}
          <Act label="⬇ Template" onPress={downloadTemplate} disabled={!!busy} />
          <Act label={busy === 'xlsx' ? '…' : '📊 Excel'} onPress={() => exportItr('xlsx')} disabled={!!busy} />
          <Act label={busy === 'pdf' ? '…' : '📄 PDF'} onPress={() => exportItr('pdf')} disabled={!!busy} />
        </View>

        {/* Stat tiles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.stat, { borderLeftColor: s.color }]}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </ScrollView>

        {rows.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>
              No ITR parties.{canAssign ? ' Use “⬆ Upload List” to add them.' : ''}
            </Text>
          </View>
        ) : (
          rows.map((p) => {
            const [bg, fg] = stageColor(p.stage);
            const c = latestTeamComment(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => setOpenFor(p)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name || '—'}</Text>
                    <Text style={styles.pan}>{p.pan}</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: bg }]}>
                    <Text style={[styles.pillText, { color: fg }]}>{p.stage || 'Not Started'}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Meta label="AY" value={p.ay || '—'} />
                  <Meta label="Type" value={p.type || '—'} />
                  <Meta
                    label="Assigned"
                    value={p.assignedName || 'Unassigned'}
                    dim={!p.assignedName}
                  />
                </View>

                {c ? (
                  <Text style={styles.comment} numberOfLines={2}>
                    💬 {c.text}{c.more > 0 ? `  +${c.more}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.noComment}>No team comment yet</Text>
                )}
              </Pressable>
            );
          })
        )}

        <Text style={styles.hint}>
          Tap a name to {canAssign ? 'assign team & ' : ''}view details, update stage, and add comments.
        </Text>
      </ScrollView>

      <ItrPartySheet
        party={openFor}
        visible={!!openFor}
        onClose={() => setOpenFor(null)}
        onChanged={(u) => {
          setParties((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
          setOpenFor((prev) => (prev ? { ...prev, ...u } : prev));
        }}
        onDeleted={(id) => setParties((prev) => prev.filter((x) => x.id !== id))}
      />
    </View>
  );
}

function Act({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.act, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={styles.actText}>{label}</Text>
    </Pressable>
  );
}

function Meta({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, dim && { color: '#cbd5e1' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sub: { ...font.small, color: colors.muted, marginBottom: spacing.md },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  act: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center',
  },
  actText: { ...font.tiny, fontWeight: '700', color: colors.text },
  stats: { gap: spacing.sm, paddingVertical: 2, marginBottom: spacing.md },
  stat: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 4, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, minWidth: 100,
  },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { ...font.h3, color: colors.primary },
  pan: { ...font.tiny, color: colors.muted, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  metaRow: { flexDirection: 'row', marginTop: spacing.sm },
  metaLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaValue: { ...font.tiny, color: colors.text, fontWeight: '600', marginTop: 2 },
  comment: { ...font.tiny, color: colors.primaryDark, fontWeight: '500', marginTop: spacing.sm, lineHeight: 16 },
  noComment: { ...font.tiny, color: '#cbd5e1', fontWeight: '500', marginTop: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  hint: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: spacing.sm, lineHeight: 16 },
});
