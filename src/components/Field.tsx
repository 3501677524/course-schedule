/** 表单控件：文本框、数字框、选择器、时间选择 */
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from './theme';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize, autoCorrect,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      style={[
        styles.input,
        { backgroundColor: colors.cardSoft, color: colors.text, borderColor: colors.border },
        multiline ? styles.inputMulti : null,
      ]}
    />
  );
}

export function NumberField({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  const { colors } = useTheme();
  const [text, setText] = useState<string>(String(value));
  return (
    <View style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.cardSoft }]}>
      <Pressable accessibilityRole="button" onPress={() => { const n = Math.max(0, (Number(text) || 0) - step); setText(String(n)); onChange(n); }} style={styles.stepBtn}>
        <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '700' }}>−</Text>
      </Pressable>
      <TextInput
        value={text}
        keyboardType="numeric"
        onChangeText={(t) => { setText(t); const n = Number(t); if (Number.isFinite(n)) onChange(n); }}
        style={[styles.stepInput, { color: colors.text }]}
      />
      <Pressable accessibilityRole="button" onPress={() => { const n = (Number(text) || 0) + step; setText(String(n)); onChange(n); }} style={styles.stepBtn}>
        <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '700' }}>+</Text>
      </Pressable>
    </View>
  );
}

export function Picker({ options, value, onChange }: { options: Array<{ label: string; value: string }>; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  if (Platform.OS === 'web') {
    return (
      <View style={styles.pickerWrap}>
        {options.map((o) => (
          <Pressable key={o.value} accessibilityRole="button" onPress={() => onChange(o.value)} style={[styles.pickItem, { backgroundColor: o.value === value ? colors.primary : colors.cardSoft, borderColor: colors.border }]}>
            <Text style={{ color: o.value === value ? '#fff' : colors.textSecondary, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.pickerWrap}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="button" onPress={() => onChange(o.value)} style={[styles.pickItem, { backgroundColor: o.value === value ? colors.primary : colors.cardSoft, borderColor: colors.border }]}>
          <Text style={{ color: o.value === value ? '#fff' : colors.textSecondary, fontSize: 13 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 时间选择（HH:mm 字符串） */
export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map((x) => Number(x) || 0);
  const base = new Date(2000, 0, 1, h, m, 0);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.timeBtn, { borderColor: colors.border, backgroundColor: colors.cardSoft }]}>
        <Text style={{ color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] }}>{value}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={base}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (date) {
              onChange(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
            }
          }}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ paddingVertical: 6 }}>
          <Text style={{ color: colors.primary }}>完成</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 日期选择（YYYY-MM-DD 字符串） */
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const parts = value.split('-').map(Number);
  const base = parts.length === 3 && parts.every((n) => Number.isFinite(n))
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date();
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.timeBtn, { borderColor: colors.border, backgroundColor: colors.cardSoft }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{value || '选择日期'}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={base}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (date) {
              onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
            }
          }}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ paddingVertical: 6 }}>
          <Text style={{ color: colors.primary }}>完成</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 日期 + 时间组合（ISO 字符串） */
export function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const d = new Date(value);
  const valid = !Number.isNaN(d.getTime());
  const dateKey = valid ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  const timeKey = valid ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '09:00';

  const apply = (nextDate: string, nextTime: string) => {
    if (!nextDate) return;
    const [y, m, day] = nextDate.split('-').map(Number);
    const [hh, mm] = nextTime.split(':').map(Number);
    onChange(new Date(y, m - 1, day, hh, mm, 0, 0).toISOString());
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1.4 }}>
        <DateField value={dateKey} onChange={(v) => apply(v, timeKey)} />
      </View>
      <View style={{ flex: 1 }}>
        <TimeField value={timeKey} onChange={(v) => apply(dateKey, v)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 7 },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  inputMulti: { minHeight: 76, textAlignVertical: 'top' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, alignSelf: 'flex-start', overflow: 'hidden' },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  stepInput: { width: 62, textAlign: 'center', fontSize: 16, paddingVertical: 8 },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pickItem: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  timeBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
});
