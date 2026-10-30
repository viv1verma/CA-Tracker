import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Input, Select } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import { downloadAuditExcel } from './exports';
import { Pill, RCell, RRow, RTable } from './parts';
import { auditActionStyle, type AuditLog } from './logic';

/**
 * rpAudit() / loadAudit() — the admin-only activity trail with area, actor,
 * date-range and free-text filters, plus the client-built Excel download.
 * Every filter change refetches; the search box keeps the web's 350ms debounce.
 */
export default function AuditTrail() {
  const { showToast } = useToast();
  const [entity, setEntity] = useState('all');
  const [actor, setActor] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const [data, setData] = useState<AuditLog | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // The dropdowns are populated once from the first response, as the web does.
  const [entities, setEntities] = useState<string[]>([]);
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    let qs = '?limit=500';
    if (entity !== 'all') qs += `&entity=${encodeURIComponent(entity)}`;
    if (actor !== 'all') qs += `&actorId=${encodeURIComponent(actor)}`;
    if (from) qs += `&from=${encodeURIComponent(from)}`;
    if (to) qs += `&to=${encodeURIComponent(to)}`;
    if (q.trim()) qs += `&q=${encodeURIComponent(q.trim())}`;
    try {
      const r = await api.get<AuditLog>(`${endpoints.auditLog}${qs}`);
      setData(r);
      setEntities((prev) => (prev.length ? prev : r.entities || []));
      setActors((prev) => (prev.length ? prev : r.actors || []));
      setState('idle');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the audit trail');
      setState('error');
    }
  }, [entity, actor, from, to, q]);

  // auDebounce(): 350ms after the last keystroke, matching the web.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void load(); }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const download = async () => {
    if (!data?.entries.length) { showToast('Nothing to download', 'error'); return; }
    setDownloading(true);
    try {
      await downloadAuditExcel(data.entries);
      showToast('Downloaded ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <View style={styles.filters}>
        <View style={styles.half}>
          <Text style={styles.label}>AREA</Text>
          <Select value={entity} placeholder="All areas" onChange={setEntity}
            options={[{ value: 'all', label: 'All areas' },
              ...entities.map((e) => ({ value: e, label: e }))]} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>WHO</Text>
          <Select value={actor} placeholder="Anyone" searchable onChange={setActor}
            options={[{ value: 'all', label: 'Anyone' },
              ...actors.map((a) => ({ value: a.id, label: a.name }))]} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>FROM</Text>
          <DateField value={from} onChange={setFrom} placeholder="Any date" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>TO</Text>
          <DateField value={to} onChange={setTo} placeholder="Any date" />
        </View>
      </View>
      <Text style={styles.label}>SEARCH</Text>
      <Input value={q} onChangeText={setQ} placeholder="name, field, value…" />
      <View style={{ alignItems: 'flex-end', marginVertical: spacing.sm }}>
        <Button title="⬇ Excel" onPress={download} variant="outline" loading={downloading} />
      </View>

      {state === 'loading' ? (
        <Text style={styles.msg}>Loading…</Text>
      ) : state === 'error' ? (
        <Text style={[styles.msg, { color: colors.red }]}>{error}</Text>
      ) : !data?.entries.length ? (
        <View style={styles.emptyCard}>
          <Text style={styles.msg}>No activity recorded for this filter.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.count}>
            Showing {data.entries.length} of {data.total} entries (newest first)
          </Text>
          <View style={styles.card}>
            <RTable head={['WHEN', 'WHO', 'ACTION', 'AREA', 'SUBJECT', 'WHAT CHANGED']}
              widths={[140, 140, 95, 100, 160, 260]}>
              {data.entries.map((e, i) => {
                const c = auditActionStyle(e.action);
                return (
                  <RRow key={`${e.at}-${i}`} index={i}>
                    <RCell width={140} style={{ color: colors.muted }}>
                      {new Date(e.at).toLocaleString('en-IN')}
                    </RCell>
                    <RCell width={140}>
                      <View>
                        <Text style={styles.actor} numberOfLines={1}>{e.actorName}</Text>
                        <Text style={styles.actorRole}>{e.actorRole || ''}</Text>
                      </View>
                    </RCell>
                    <RCell width={95}><Pill text={e.action} bg={c.bg} fg={c.fg} /></RCell>
                    <RCell width={100}>{e.entity}</RCell>
                    <RCell width={160} style={{ fontWeight: '700' }}>{e.label || '—'}</RCell>
                    <RCell width={260}>{e.details || '—'}</RCell>
                  </RRow>
                );
              })}
            </RTable>
          </View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { width: '48%', flexGrow: 1 },
  label: { ...font.tiny, color: colors.muted, marginBottom: 4 },
  msg: { ...font.small, color: colors.muted, textAlign: 'center', padding: spacing.xl },
  count: { ...font.small, fontWeight: '500', color: colors.muted, marginBottom: 6 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden',
  },
  emptyCard: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg,
  },
  actor: { ...font.small, fontWeight: '700', color: colors.text },
  actorRole: { ...font.tiny, color: '#94a3b8' },
});
