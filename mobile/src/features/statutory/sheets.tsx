import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/types';
import { DateField, Field, Input, Select, Sheet } from '../../components/form';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { colors, font, radius, spacing } from '../../theme/theme';
import type { ParsedItem, StatutoryUpdate } from './logic';

/** suOpenForm() / suSave(). */
export function UpdateFormSheet({
  record, categories, defaultCategory, visible, onClose, onSaved,
}: {
  record: StatutoryUpdate | null;
  categories: string[];
  defaultCategory: string;
  visible: boolean;
  onClose: () => void;
  onSaved: (category: string) => void;
}) {
  const { showToast } = useToast();
  const [category, setCategory] = useState(defaultCategory);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [refNo, setRefNo] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (record) {
      setCategory(record.category || defaultCategory);
      setDate(record.date || '');
      setTitle(record.title || '');
      setRefNo(record.refNo || '');
      setLink(record.link || '');
      setNote(record.note || '');
    } else {
      setCategory(defaultCategory);
      // A new update defaults to today, as the web does.
      setDate(new Date().toISOString().slice(0, 10));
      setTitle(''); setRefNo(''); setLink(''); setNote('');
    }
  }, [visible, record?.id, defaultCategory]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!title.trim()) { showToast('Title is required', 'error'); return; }
    const body = {
      category, date, title: title.trim(),
      refNo: refNo.trim(), link: link.trim(), note: note.trim(),
    };
    setSaving(true);
    try {
      if (record) await api.put(endpoints.statutoryUpdate(record.id), body);
      else await api.post(endpoints.statutoryUpdates, body);
      onSaved(category);
      onClose();
      showToast('Saved ✓');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={record ? 'Edit Statutory Update' : 'Add Statutory Update'}
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}><Button title="Save" onPress={save} loading={saving} /></View>
        </>
      }
    >
      <Field label="Category">
        <Select
          value={category}
          placeholder="Category"
          options={categories.map((c) => ({ value: c, label: c }))}
          onChange={setCategory}
        />
      </Field>
      <Field label="Date"><DateField value={date} onChange={setDate} /></Field>
      <Field label="Title *">
        <Input value={title} onChangeText={setTitle} placeholder="What changed?" multiline />
      </Field>
      <Field label="Notification / Circular no.">
        <Input value={refNo} onChangeText={setRefNo} placeholder="e.g. 12/2026-Central Tax" />
      </Field>
      <Field label="Link">
        <Input value={link} onChangeText={setLink} placeholder="https://…" />
      </Field>
      <Field label="Brief / note">
        <Input value={note} onChangeText={setNote} placeholder="Short crux for the team…" multiline />
      </Field>
    </Sheet>
  );
}

/**
 * suOpenPaste() / suParse() / suImport(). Paste text copied from a portal, let
 * the server pick out candidate updates, untick any, then import the rest.
 */
export function PasteImportSheet({
  visible, onClose, onImported,
}: { visible: boolean; onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(''); setItems(null); setSkip(new Set());
  }, [visible]);

  const parse = async () => {
    if (!text.trim()) { showToast('Paste some text first', 'error'); return; }
    setParsing(true);
    try {
      const r = await api.post<{ items: ParsedItem[] }>(endpoints.statutoryParse, { text: text.trim() });
      setItems(r.items || []);
      setSkip(new Set());
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not parse', 'error');
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    const chosen = (items || []).filter((_, i) => !skip.has(i));
    if (!chosen.length) { showToast('Nothing selected', 'error'); return; }
    setImporting(true);
    try {
      const r = await api.post<{ added: number; skipped: number }>(
        endpoints.statutoryImport, { items: chosen },
      );
      onImported();
      onClose();
      showToast(
        `Imported ${r.added} update(s)${r.skipped ? `, ${r.skipped} already on file` : ''}`,
      );
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Paste from portal"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} variant="outline" /></View>
          <View style={{ flex: 2 }}>
            {items === null
              ? <Button title="Parse" onPress={parse} loading={parsing} />
              : <Button title="Import selected" onPress={doImport} loading={importing} />}
          </View>
        </>
      }
    >
      <Field label="Pasted text">
        <Input
          value={text}
          onChangeText={setText}
          placeholder="Paste the portal's list here…"
          multiline
        />
      </Field>

      {items !== null && items.length === 0 && (
        <Text style={styles.none}>
          Nothing recognisable found. Each line needs a date or a notification/circular number.
        </Text>
      )}

      {!!items?.length && (
        <>
          <Text style={styles.found}>
            Found {items.length} update(s) — untick any to skip:
          </Text>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
            {items.map((it, i) => {
              const on = !skip.has(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => setSkip((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={styles.parsedRow}
                >
                  <View style={[styles.box, on && styles.boxOn]}>
                    {on && <Text style={styles.tick}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.parsedTitle}>
                      <Text style={styles.b}>{it.date || 'no date'}</Text> — {it.title}
                    </Text>
                    {!!it.refNo && <Text style={styles.parsedRef}>{it.refNo}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  none: { ...font.small, color: colors.muted, paddingVertical: spacing.sm },
  found: { ...font.tiny, color: colors.green, marginBottom: 6 },
  parsedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: 9, marginBottom: 5, minHeight: 44,
  },
  box: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 10, fontWeight: '900' },
  parsedTitle: { ...font.tiny, color: colors.text, fontWeight: '500', lineHeight: 16 },
  parsedRef: { ...font.tiny, color: colors.muted, fontWeight: '500', marginTop: 2 },
  b: { fontWeight: '800' },
});
