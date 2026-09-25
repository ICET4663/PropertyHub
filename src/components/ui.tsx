import React from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '../theme';
import { initials } from '../utils';

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: any; onPress?: () => void }) {
  const t = useTheme();
  const inner = (
    <View style={[styles.card, { backgroundColor: t.colors.card, shadowColor: t.colors.shadow }, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return <TouchableOpacity activeOpacity={0.75} onPress={onPress}>{inner}</TouchableOpacity>;
  }
  return inner;
}

export function Badge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={color} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function StatCard({ icon, label, value, sub, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub?: string; color: string; onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Card style={styles.statCard} onPress={onPress}>
      <View style={[styles.statIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: t.colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.colors.subtext }]} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: t.colors.subtext }]} numberOfLines={1}>{sub}</Text> : null}
    </Card>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, small, disabled, style }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  icon?: keyof typeof Ionicons.glyphMap; small?: boolean; disabled?: boolean; style?: any;
}) {
  const t = useTheme();
  const bg =
    variant === 'primary' ? t.colors.primary
    : variant === 'success' ? t.colors.success
    : variant === 'danger' ? t.colors.danger
    : 'transparent';
  const color =
    variant === 'primary' || variant === 'success' || variant === 'danger'
      ? '#FFFFFF'
      : t.colors.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: t.colors.border },
        variant === 'ghost' && { backgroundColor: t.colors.primarySoft },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={small ? 14 : 16} color={color} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? c : t.colors.cardAlt, borderColor: active ? c : t.colors.border }]}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : t.colors.subtext }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={[styles.searchBar, { backgroundColor: t.colors.inputBg }]}>
      <Ionicons name="search" size={16} color={t.colors.subtext} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.subtext}
        style={[styles.searchInput, { color: t.colors.text }]}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={16} color={t.colors.subtext} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.fieldLabel, { color: t.colors.subtext }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.colors.subtext}
        style={[styles.fieldInput, { backgroundColor: t.colors.inputBg, color: t.colors.text, borderColor: t.colors.border }]}
        {...props}
      />
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: t.colors.text }]}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ color: t.colors.primary, fontWeight: '600', fontSize: 13 }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; message?: string; actionLabel?: string; onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.colors.primarySoft }]}>
        <Ionicons name={icon} size={28} color={t.colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMsg, { color: t.colors.subtext }]}>{message}</Text> : null}
      {actionLabel ? <Button title={actionLabel} onPress={onAction} small style={{ marginTop: spacing.md }} /> : null}
    </View>
  );
}

export function ProgressBar({ progress, color, height = 8, track }: { progress: number; color: string; height?: number; track?: string }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? t.colors.inputBg, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

export function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.colors.inputBg }]}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          onPress={() => onChange(o)}
          style={[styles.segment, value === o && { backgroundColor: t.colors.card, shadowColor: t.colors.shadow }]}
        >
          <Text style={{ fontSize: 13, fontWeight: value === o ? '700' : '500', color: value === o ? t.colors.text : t.colors.subtext }}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg }}>
      <ActivityIndicator size="large" color={t.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  statCard: { flex: 1, padding: spacing.md },
  statIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  statLabel: { fontSize: 12, marginTop: 2 },
  statSub: { fontSize: 11, marginTop: 2 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, paddingHorizontal: spacing.lg, borderRadius: radius.md,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full,
    borderWidth: 1, marginRight: spacing.sm,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, borderRadius: radius.md, height: 42,
  },
  searchInput: { flex: 1, marginLeft: spacing.sm, fontSize: 14, padding: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    fontSize: 15, borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md, marginTop: spacing.lg,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyMsg: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1,
  },
});
