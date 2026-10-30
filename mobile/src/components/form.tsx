import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View, type TextStyle, type ViewStyle,
} from 'react-native';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Native stand-ins for the web sheet's form controls: a bottom sheet for
 * <div class="sheet">, a modal picker for <select>, and the platform date
 * picker for <input type="date">.
 */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {!!hint && <Text style={styles.hint}>  {hint}</Text>}
      </Text>
      {children}
    </View>
  );
}

export function Input({
  value, onChangeText, placeholder, multiline, keyboardType, autoFocus, onSubmitEditing, returnKeyType,
  secure,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'send';
  /** Password fields (Settings → Account) mask their text. */
  secure?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      secureTextEntry={secure}
      // An address must not be sentence-cased or autocorrected; every other
      // keyboard type keeps the platform defaults it has always had.
      autoCapitalize={secure || keyboardType === 'email-address' ? 'none' : undefined}
      autoCorrect={keyboardType === 'email-address' ? false : undefined}
      style={[styles.input, multiline && styles.inputMulti]}
    />
  );
}

export interface Option { value: string; label: string; sub?: string }

/** A <select> replacement: a tappable row that opens a searchable modal list. */
export function Select({
  value, options, placeholder, onChange, searchable,
}: {
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (v: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = options.find((o) => o.value === value);
  const shown = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  return (
    <>
      <Pressable
        onPress={() => { setQ(''); setOpen(true); }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.input, styles.selectRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.selectText, !chosen && { color: colors.muted }]} numberOfLines={1}>
          {chosen ? chosen.label : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{placeholder}</Text>
            {searchable && (
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search…"
                placeholderTextColor={colors.muted}
                style={[styles.input, { marginBottom: spacing.sm }]}
              />
            )}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              {shown.length === 0 && <Text style={styles.pickerEmpty}>Nothing matches “{q}”.</Text>}
              {shown.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value || '__blank__'}
                    onPress={() => { onChange(o.value); setOpen(false); }}
                    style={({ pressed }) => [styles.pickerRow, (on || pressed) && { backgroundColor: colors.primaryLight }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerLabel, on && { color: colors.primary }]}>{o.label}</Text>
                      {!!o.sub && <Text style={styles.pickerSub}>{o.sub}</Text>}
                    </View>
                    {on && <Text style={styles.tick}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** <input type="date"> replacement. Value and onChange both use YYYY-MM-DD. */
export function DateField({
  value, onChange, placeholder = 'No date',
}: { value: string; onChange: (iso: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const asDate = () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  };
  const shown = value ? value.split('-').reverse().join('-') : placeholder;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.input, styles.selectRow, { flex: 1 }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.selectText, !value && { color: colors.muted }]}>{shown}</Text>
        <Text style={styles.caret}>📅</Text>
      </Pressable>
      {!!value && (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" style={styles.clearBtn}>
          <Text style={{ color: colors.muted, fontWeight: '800' }}>✕</Text>
        </Pressable>
      )}
      {open && (
        <DateTimePicker
          value={asDate()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={(_e, d) => {
            setOpen(false);
            if (d) onChange(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`);
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </View>
  );
}

/** The bottom sheet used everywhere the web app opens a .sheet. */
export function Sheet({
  visible, title, onClose, children, footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetScrim}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              <View style={{ padding: spacing.lg, paddingTop: spacing.sm }}>{children}</View>
            </ScrollView>
            {!!footer && <View style={styles.sheetFooter}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A horizontally scrollable chip row, matching the web's .filter-bar. */
export function ChipRow({
  options, value, onChange,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value || 'all'}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: {
    ...font.tiny, color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 6,
  } as TextStyle,
  hint: { textTransform: 'none', fontWeight: '500', letterSpacing: 0 },
  input: {
    minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
    backgroundColor: colors.white,
  },
  inputMulti: { minHeight: 92, textAlignVertical: 'top' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as ViewStyle,
  selectText: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  caret: { color: colors.muted, fontSize: 14, marginLeft: spacing.sm },
  clearBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(17,24,39,.45)', justifyContent: 'center', padding: spacing.lg },
  pickerCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg },
  pickerTitle: { ...font.h3, color: colors.text, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    paddingHorizontal: spacing.md, borderRadius: radius.md, minHeight: 48,
  },
  pickerLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  pickerSub: { ...font.small, color: colors.muted, marginTop: 1 },
  pickerEmpty: { ...font.small, color: colors.muted, padding: spacing.lg, textAlign: 'center' },
  tick: { color: colors.primary, fontWeight: '900', fontSize: 16 },

  sheetScrim: { flex: 1, backgroundColor: 'rgba(17,24,39,.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: spacing.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 8 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  sheetTitle: { ...font.h2, color: colors.text, flex: 1 },
  close: { fontSize: 18, color: colors.muted, paddingHorizontal: 6 },
  sheetFooter: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },

  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: 2 },
  chip: {
    height: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...font.small, color: colors.muted },
  chipTextOn: { color: colors.white },
});
