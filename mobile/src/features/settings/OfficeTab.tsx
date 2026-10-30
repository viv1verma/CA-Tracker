import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DateField, Field, Input, Select } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { API_BASE_URL } from '../../config/env';
import { readPickedAsText } from '../../lib/files';
import { colors, font, radius, spacing } from '../../theme/theme';
import { fmt } from '../assignments/logic';
import {
  ipPrefixSuggestion, type HolidayData, type MyIp, type OfficeSettings,
} from './logic';

/**
 * The Office tab (admin only): mobile-only punch, office WiFi lock, the holiday
 * calendar, and backup / restore.
 *
 * Nothing here runs on load beyond three GETs. Restore replaces the entire
 * database, so it is confirmed twice and never fired by rendering.
 */
export default function OfficeTab() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<OfficeSettings>({});
  const [ips, setIps] = useState('');
  const [myIp, setMyIp] = useState<MyIp | null>(null);
  const [savingIps, setSavingIps] = useState(false);

  const year = new Date().getFullYear();
  const [holYear, setHolYear] = useState(String(year));
  const [hol, setHol] = useState<HolidayData | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [savingHol, setSavingHol] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const [backing, setBacking] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get<OfficeSettings>(endpoints.settings, { background: true });
      setSettings(s || {});
      setIps((s?.officeIPs || []).join('\n'));
    } catch { /* the tab still renders */ }
  }, []);

  const loadHolidays = useCallback(async (y: string) => {
    try {
      const d = await api.get<HolidayData>(`${endpoints.holidays}?year=${y}`);
      setHol(d);
      setMarked(new Set((d.catalog || []).filter((h) => h.selected).map((h) => h.date)));
    } catch (e) {
      setHol(null);
      showToast(e instanceof ApiError ? e.message : 'Could not load holidays', 'error');
    }
  }, [showToast]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { void loadHolidays(holYear); }, [holYear, loadHolidays]);

  /** saveSetting(): re-read, merge one key, PUT the whole object — as the web does. */
  const saveSetting = async (key: string, val: boolean) => {
    try {
      const s = await api.get<OfficeSettings>(endpoints.settings);
      const next = { ...s, [key]: val };
      await api.put(endpoints.settings, next);
      setSettings(next);
      showToast(val ? `${key} enabled` : `${key} disabled`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error saving', 'error');
      void loadSettings();
    }
  };

  const saveIPs = async () => {
    setSavingIps(true);
    try {
      const s = await api.get<OfficeSettings>(endpoints.settings);
      const officeIPs = ips.split('\n').map((x) => x.trim()).filter(Boolean);
      await api.put(endpoints.settings, { ...s, officeIPs });
      setSettings({ ...s, officeIPs });
      showToast(`WiFi settings saved — ${officeIPs.length} prefix(es)`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error', 'error');
    } finally {
      setSavingIps(false);
    }
  };

  const showMyIP = async () => {
    try { setMyIp(await api.get<MyIp>(endpoints.myIp)); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Could not detect IP', 'error'); }
  };

  const saveHolidays = async () => {
    setSavingHol(true);
    try {
      await api.put(endpoints.holidays, { year: parseInt(holYear, 10), dates: [...marked] });
      showToast(`${marked.size} holiday(s) saved ✓`);
      await loadHolidays(holYear);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save holidays', 'error');
    } finally {
      setSavingHol(false);
    }
  };

  const addHoliday = async () => {
    if (!newDate || !newName.trim()) { showToast('Pick a date and enter a name', 'error'); return; }
    try {
      await api.post(endpoints.holidays, { date: newDate, name: newName.trim() });
      setNewDate(''); setNewName('');
      showToast('Holiday added ✓');
      await loadHolidays(holYear);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not add holiday', 'error');
    }
  };

  const deleteHoliday = (date: string) => {
    Alert.alert('Remove holiday', 'Remove this holiday?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await api.del(endpoints.holiday(date));
            showToast('Holiday removed');
            await loadHolidays(holYear);
          } catch (e) {
            showToast(e instanceof ApiError ? e.message : 'Could not remove', 'error');
          }
        },
      },
    ]);
  };

  /** downloadBackup(): the browser blob download becomes a cache file + share sheet. */
  const downloadBackup = async () => {
    setBacking(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}${endpoints.backup}`, { headers });
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      const text = await res.text();

      const name = `garp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const target = new File(Paths.cache, name);
      try { if (target.exists) target.delete(); } catch { /* nothing to clear */ }
      target.create();
      target.write(text);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target.uri, { mimeType: 'application/json', dialogTitle: name });
      }
      showToast('Backup downloaded — keep it safe');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Backup failed', 'error');
    } finally {
      setBacking(false);
    }
  };

  /** doRestore(): replaces every record. Validated locally first, then confirmed. */
  const doRestore = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/json', copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    setRestoreStatus({ text: 'Reading file…', tone: 'ok' });
    let db: { users?: unknown[] };
    try {
      db = JSON.parse(await readPickedAsText(picked.assets[0].uri));
    } catch {
      setRestoreStatus({ text: 'That is not a valid backup file.', tone: 'err' });
      return;
    }
    if (!db || !Array.isArray(db.users)) {
      setRestoreStatus({ text: 'Backup file is missing the users list — wrong file?', tone: 'err' });
      return;
    }

    Alert.alert(
      'Restore from backup',
      'This will REPLACE all current data with the backup. A snapshot of current data is saved first. Continue?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setRestoreStatus(null) },
        {
          text: 'Replace everything', style: 'destructive',
          onPress: async () => {
            setRestoreStatus({ text: 'Restoring…', tone: 'ok' });
            try {
              const r = await api.post<{ restored: Record<string, number> }>(
                endpoints.restore, { db }, { timeoutMs: 120000 },
              );
              setRestoreStatus({
                text: `✓ Restored ${r.restored.users} users, ${r.restored.clients} clients, ${r.restored.assignments} tasks, ${r.restored.invoices || 0} invoices.`,
                tone: 'ok',
              });
            } catch (e) {
              setRestoreStatus({
                text: e instanceof ApiError ? e.message : 'Restore failed', tone: 'err',
              });
            }
          },
        },
      ],
    );
  };

  const yearOpts = [year + 1, year, year - 1, year - 2]
    .map((y) => ({ value: String(y), label: String(y) }));

  const Check = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      onPress={onPress} style={styles.checkRow}>
      <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Text style={styles.sectionHead}>DATA BACKUP & RESTORE</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💾 Backup</Text>
        <Text style={styles.note}>
          Download a complete copy of all your data (users, clients, tasks, invoices). Keep it
          somewhere safe — this is your safety net if anything goes wrong. Do this regularly.
        </Text>
        <Button title="⬇ Download Backup" onPress={downloadBackup} loading={backing} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>♻️ Restore</Text>
        <Text style={styles.note}>
          Restore from a previously downloaded backup file. <Text style={{ fontWeight: '800' }}>This
          replaces all current data.</Text> A snapshot of the current data is saved first, just in case.
        </Text>
        <Button title="Restore from File" onPress={doRestore} variant="outline" />
        {!!restoreStatus && (
          <Text style={[styles.status, restoreStatus.tone === 'err'
            ? { color: colors.red } : { color: colors.green }]}>
            {restoreStatus.text}
          </Text>
        )}
      </View>

      <Text style={styles.sectionHead}>OFFICE SETTINGS</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📱 Mobile-Only Punch</Text>
        <Text style={styles.note}>Restrict punch-in/out to smartphones only.</Text>
        <Check label="Enable Mobile-Only Punch" on={!!settings.mobileOnlyPunch}
          onPress={() => void saveSetting('mobileOnlyPunch', !settings.mobileOnlyPunch)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📶 Office WiFi Lock</Text>
        <Text style={styles.note}>Only allow punch from office WiFi IPs.</Text>
        <Check label="Enable WiFi Lock" on={!!settings.wifiCheckEnabled}
          onPress={() => void saveSetting('wifiCheckEnabled', !settings.wifiCheckEnabled)} />
        <Field label="Office IP Prefixes (one per line)">
          <Input value={ips} onChangeText={setIps} multiline placeholder={'192.168.1\n10.0.0'} />
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button title="📍 Show My IP" onPress={showMyIP} variant="outline" />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Save WiFi Settings" onPress={saveIPs} loading={savingIps} />
          </View>
        </View>
        {!!myIp && (
          <View style={styles.ipBox}>
            <Text style={styles.ipHead}>
              Your current IP: <Text style={{ color: colors.primary }}>{myIp.detectedIp || '(unknown)'}</Text>
            </Text>
            <Text style={styles.note}>
              To allow this network, add prefix{' '}
              <Text style={{ fontWeight: '800' }}>{ipPrefixSuggestion(myIp.detectedIp)}</Text> above and save.
            </Text>
            {(myIp.forwardedChain?.length || 0) > 1 && (
              <Text style={styles.note}>Proxy chain: {myIp.forwardedChain!.join(' → ')}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🗓️ Holidays</Text>
        <Text style={styles.note}>
          Sundays and the <Text style={{ fontWeight: '800' }}>2nd & 4th Saturday</Text> are fixed
          holidays. Tick the festival / government holidays GARP will observe.
        </Text>
        <View style={styles.row}>
          <View style={{ width: 120 }}>
            <Select value={holYear} placeholder="Year" options={yearOpts} onChange={setHolYear} />
          </View>
          <Text style={styles.count}>{marked.size} marked</Text>
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Save Marked Holidays" onPress={saveHolidays} loading={savingHol} />
        </View>

        {!hol?.catalog?.length ? (
          <Text style={styles.empty}>
            No reference calendar for this year. Use "Add Other Holiday" below.
          </Text>
        ) : hol.catalog.map((h, i) => {
          const on = marked.has(h.date);
          const govt = h.type === 'Gazetted';
          // The reference calendar can list two festivals on one date (e.g. Id-e-Milad
          // and Onam both fall on 2026-08-26), so the date alone is not a unique key.
          return (
            <Pressable key={`${h.date}-${i}`} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              onPress={() => setMarked((prev) => {
                const next = new Set(prev);
                if (next.has(h.date)) next.delete(h.date); else next.add(h.date);
                return next;
              })}
              style={styles.holRow}>
              <Text style={styles.checkBox}>{on ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.holName}>{h.name}</Text>
                <Text style={styles.holMeta}>
                  {fmt(h.date)} · {h.day}{h.day === 'Sunday' ? ' (already off)' : ''}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: govt ? '#dcfce7' : '#fef3c7' }]}>
                <Text style={[styles.badgeText, { color: govt ? '#15803d' : '#92400e' }]}>
                  {govt ? 'GOVT' : 'FESTIVAL'}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View style={styles.divider} />
        <Text style={styles.subTitle}>➕ Add Other Holiday</Text>
        <Field label="Date"><DateField value={newDate} onChange={setNewDate} /></Field>
        <Field label="Name">
          <Input value={newName} onChangeText={setNewName} placeholder="e.g. Firm Foundation Day" />
        </Field>
        <Button title="Add" onPress={addHoliday} variant="outline" />

        {!hol?.custom?.length ? (
          <Text style={styles.note}>No other holidays added for this year.</Text>
        ) : hol.custom.map((h) => (
          <View key={h.date} style={styles.customRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.holName}>{h.name}</Text>
              <Text style={styles.holMeta}>{fmt(h.date)}</Text>
            </View>
            <Pressable onPress={() => deleteHoliday(h.date)} accessibilityRole="button"
              style={styles.iconBtn}>
              <Text style={styles.iconDanger}>🗑</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    ...font.tiny, color: colors.muted, letterSpacing: 1,
    marginBottom: spacing.md, marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  cardTitle: { ...font.h3, color: colors.text, marginBottom: 4 },
  subTitle: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  note: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  count: { ...font.small, fontWeight: '700', color: colors.muted },
  status: { ...font.small, fontWeight: '600', marginTop: spacing.sm },
  empty: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.lg },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  checkBox: { fontSize: 20, color: colors.primary },
  checkLabel: { ...font.small, fontWeight: '600', color: colors.text },

  ipBox: {
    backgroundColor: '#eff6ff', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  ipHead: { ...font.small, fontWeight: '800', color: colors.text, marginBottom: 4 },

  holRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  holName: { ...font.small, fontWeight: '700', color: colors.text },
  holMeta: { ...font.tiny, fontWeight: '600', color: colors.muted },
  badge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { ...font.tiny, fontWeight: '800' },

  divider: {
    borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed',
    marginTop: spacing.md, paddingTop: spacing.md,
  },
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 8, marginTop: 6,
  },
  iconBtn: {
    width: 34, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: '#fecaca',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2',
  },
  iconDanger: { fontSize: 13, color: colors.red },
});
