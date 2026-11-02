import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput,
  TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { Check, ChevronDown, Eye, EyeOff, X, CircleCheck, TriangleAlert, Info, Phone } from 'lucide-react-native';
import { AVATAR_TONES, colors, font, radius, shadow, useBreakpoint } from '../theme';
import { hashIndex, initials } from '../utils';

// ---------------------------------------------------------------- Text

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

export function T({ children, size = 14, weight = 'regular', color = colors.text, style, numberOfLines, center, mono, upper, onPress, selectable }: {
  children?: React.ReactNode; size?: number; weight?: Weight; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number;
  center?: boolean; mono?: boolean; upper?: boolean; onPress?: () => void; selectable?: boolean;
}) {
  return (
    <Text
      onPress={onPress}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: mono ? font.mono : font[weight], fontSize: size, color, lineHeight: Math.round(size * 1.42) },
        mono && { fontWeight: '600', fontSize: size - 1, letterSpacing: 0.2 },
        center && { textAlign: 'center' },
        upper && { textTransform: 'uppercase', letterSpacing: 0.6 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export const H1 = (p: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
  const { isMobile } = useBreakpoint();
  return <T size={isMobile ? 22 : 26} weight="bold" style={[{ letterSpacing: -0.4 }, p.style]}>{p.children}</T>;
};

export function Link({ children, onPress, size = 13, color = colors.primary, weight = 'semibold' }: { children: React.ReactNode; onPress?: () => void; size?: number; color?: string; weight?: Weight }) {
  return <T size={size} weight={weight} color={color} onPress={onPress} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>{children}</T>;
}

// ---------------------------------------------------------------- Pressable w/ hover

// On web, a Pressable with role "button" renders a <button>, and <button> cannot nest.
// Inner Touches (e.g. an action button inside a pressable card) drop the role so they render as a <div>.
const InsideTouch = createContext(false);

export function Touch({ onPress, style, hoverStyle, children, disabled, accessibilityLabel, className }: {
  onPress?: () => void; style?: StyleProp<ViewStyle>; hoverStyle?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean; accessibilityLabel?: string; className?: string;
}) {
  const nested = useContext(InsideTouch);
  return (
    <Pressable
      className={className}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={nested && Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={accessibilityLabel}
      style={(s: any) => [style, s.hovered && !disabled && hoverStyle, s.pressed && !disabled && { opacity: 0.85 }]}
    >
      <InsideTouch.Provider value>{children}</InsideTouch.Provider>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Button

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost' | 'soft' | 'accent' | 'dark';

export function Button({ title, onPress, variant = 'primary', icon: Icon, iconRight: IconR, size = 'md', full, disabled, loading, style }: {
  title?: string; onPress?: () => void; variant?: BtnVariant; icon?: LucideIcon; iconRight?: LucideIcon; size?: 'sm' | 'md' | 'lg';
  full?: boolean; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary, hover: colors.primaryHover },
    secondary: { bg: colors.card, fg: colors.text, border: colors.border, hover: colors.cardAlt },
    ghost: { bg: 'transparent', fg: colors.textSoft, border: 'transparent', hover: colors.neutralSoft },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger, hover: colors.dangerDeep },
    dangerGhost: { bg: 'transparent', fg: colors.danger, border: 'transparent', hover: colors.dangerSoft },
    soft: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft, hover: '#D6E6DD' },
    accent: { bg: colors.accent, fg: '#3B2A07', border: colors.accent, hover: '#DDA23A' },
    dark: { bg: 'rgba(255,255,255,0.08)', fg: colors.white, border: 'rgba(255,255,255,0.25)', hover: 'rgba(255,255,255,0.14)' },
  }[variant];
  const h = size === 'sm' ? 32 : size === 'lg' ? 46 : 40;
  const fs = size === 'sm' ? 12.5 : 13.5;
  return (
    <Touch
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-7 rounded-md border ${full ? 'self-stretch' : ''} ${disabled ? 'opacity-50' : ''}`}
      style={[
        { height: h, paddingHorizontal: title ? (size === 'sm' ? 12 : 16) : 0, width: title ? undefined : h, backgroundColor: v.bg, borderColor: v.border },
        style,
      ]}
      hoverStyle={{ backgroundColor: v.hover }}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} color={v.fg} strokeWidth={2} /> : null}
      {title ? <T size={fs} weight="semibold" color={v.fg} numberOfLines={1}>{title}</T> : null}
      {IconR ? <IconR size={14} color={v.fg} strokeWidth={2} /> : null}
    </Touch>
  );
}

/** Opens the phone dialler. Renders nothing without a number. */
export function CallButton({ phone, name, compact }: { phone?: string; name: string; compact?: boolean }) {
  const digits = phone?.replace(/[^\d+]/g, '');
  if (!digits) return null;
  const call = () => { void Linking.openURL(`tel:${digits}`).catch(() => {}); };
  return compact
    ? <IconButton icon={Phone} onPress={call} bordered size={40} color={colors.primary} accessibilityLabel={`Call ${name}`} />
    : <Touch onPress={call} accessibilityLabel={`Call ${name}`} className="flex-row items-center gap-7 h-40 px-14 rounded-md bg-primary-soft">
      <Phone size={15} color={colors.primary} strokeWidth={2} /><T size={13.5} weight="semibold" color={colors.primary}>Call</T>
    </Touch>;
}

export function IconButton({ icon: Icon, onPress, badge, size = 38, color = colors.textSoft, bordered, accessibilityLabel }: {
  icon: LucideIcon; onPress?: () => void; badge?: number; size?: number; color?: string; bordered?: boolean; accessibilityLabel?: string;
}) {
  return (
    <Touch
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-md border-border ${bordered ? 'border bg-card' : 'border-0 bg-transparent'}`}
      style={{ width: size, height: size }}
      hoverStyle={{ backgroundColor: colors.neutralSoft }}
    >
      <Icon size={19} color={color} strokeWidth={1.8} />
      {badge ? (
        <View className="absolute top-2 right-1 min-w-17 h-17 rounded-[9px] bg-danger items-center justify-center px-4 border-2 border-card">
          <T size={9.5} weight="bold" color={colors.white} style={{ lineHeight: 12 }}>{badge > 99 ? '99+' : badge}</T>
        </View>
      ) : null}
    </Touch>
  );
}

// ---------------------------------------------------------------- Surfaces

// Cards: bg-card rounded-lg border border-border. The shadow stays a style object (shadow.card) so it
// looks the same on iOS, Android and the web.
export function Card({ children, style, pad = 20, onPress, tint, className = '' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number; onPress?: () => void; tint?: string; className?: string }) {
  const cls = `bg-card rounded-lg border border-border ${className}`;
  const s = [shadow.card, { padding: pad }, tint ? { backgroundColor: tint } : null, style];
  if (onPress) return <Touch onPress={onPress} className={cls} style={s} hoverStyle={{ borderColor: colors.borderStrong }}>{children}</Touch>;
  return <View className={cls} style={s}>{children}</View>;
}

export function CardHeader({ title, subtitle, right, style, className = '' }: { title: string; subtitle?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>; className?: string }) {
  return (
    <View className={`flex-row flex-wrap items-start justify-between gap-12 mb-16 ${className}`} style={style}>
      {/* Keeps the title readable on phones: long right-hand content wraps below it instead of squeezing it. */}
      <View className="grow shrink basis-0 min-w-160">
        <T size={15.5} weight="semibold">{title}</T>
        {subtitle ? <T size={12.5} color={colors.subtext} style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right ? <View className="shrink">{right}</View> : null}
    </View>
  );
}

export function Divider({ style, vertical, className = '' }: { style?: StyleProp<ViewStyle>; vertical?: boolean; className?: string }) {
  return <View className={`bg-border ${vertical ? 'w-1 self-stretch' : 'h-1'} ${className}`} style={style} />;
}

// ---------------------------------------------------------------- Badges

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'neutral' | 'primary' | 'accent' | 'dangerSolid';

export const toneColors: Record<Tone, [string, string]> = {
  success: [colors.successSoft, colors.success],
  danger: [colors.dangerSoft, colors.danger],
  warning: [colors.warningSoft, colors.warning],
  info: [colors.infoSoft, colors.info],
  purple: [colors.purpleSoft, colors.purple],
  neutral: [colors.neutralSoft, colors.subtext],
  primary: [colors.primarySoft, colors.primary],
  accent: [colors.accentSoft, colors.accentDeep],
  dangerSolid: [colors.dangerDeep, colors.white],
};

export function Badge({ label, tone = 'neutral', dot, size = 'md', icon: Icon, style, className = '' }: { label: string | number; tone?: Tone; dot?: boolean; size?: 'sm' | 'md'; icon?: LucideIcon; style?: StyleProp<ViewStyle>; className?: string }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View className={`flex-row items-center self-start rounded-full gap-5 ${size === 'sm' ? 'px-7 py-2' : 'px-9 py-3.5'} ${className}`} style={[{ backgroundColor: bg }, style]}>
      {dot ? <View className="w-6 h-6 rounded-[3px]" style={{ backgroundColor: fg }} /> : null}
      {Icon ? <Icon size={11} color={fg} strokeWidth={2.2} /> : null}
      <T size={size === 'sm' ? 10.5 : 11.5} weight="semibold" color={fg} numberOfLines={1}>{label}</T>
    </View>
  );
}

export function CountPill({ n, active }: { n: number | string; active?: boolean }) {
  return (
    <View className={`rounded-full px-7 py-1 ml-6 ${active ? 'bg-primary-soft' : 'bg-neutral-soft'}`}>
      <T size={11} weight="semibold" color={active ? colors.primary : colors.subtext}>{n}</T>
    </View>
  );
}

// ---------------------------------------------------------------- Avatar & icon tiles

export function Avatar({ name, size = 32, tone }: { name: string; size?: number; tone?: [string, string] }) {
  const [bg, fg] = tone ?? AVATAR_TONES[hashIndex(name, AVATAR_TONES.length)];
  return (
    <View className="items-center justify-center" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}>
      <T size={Math.max(9, size * 0.34)} weight="bold" color={fg} style={{ lineHeight: size * 0.5 }}>{initials(name)}</T>
    </View>
  );
}

export function IconTile({ icon: Icon, tone = 'primary', size = 34, iconSize }: { icon: LucideIcon; tone?: Tone; size?: number; iconSize?: number }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View className="rounded-md items-center justify-center" style={{ width: size, height: size, backgroundColor: bg }}>
      <Icon size={iconSize ?? size * 0.5} color={fg} strokeWidth={1.9} />
    </View>
  );
}

// ---------------------------------------------------------------- Forms

export function Field({ label, required, hint, error, children, right, style, optional }: {
  label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle>; optional?: boolean;
}) {
  return (
    <View className="gap-6" style={style}>
      {label ? (
        <View className="flex-row justify-between items-center">
          <T size={12.5} weight="semibold" color={colors.textSoft}>
            {label}{required ? <T size={12.5} color={colors.danger}> *</T> : null}{optional ? <T size={12} color={colors.faint}> (optional)</T> : null}
          </T>
          {right}
        </View>
      ) : null}
      {children}
      {error ? <T size={11.5} color={colors.danger} weight="medium">{error}</T> : hint ? <T size={11.5} color={colors.subtext}>{hint}</T> : null}
    </View>
  );
}

export function Input({ label, required, hint, error, secure, leftIcon: L, right, multiline, style, fieldStyle, optional, labelRight, ...rest }: TextInputProps & {
  label?: string; required?: boolean; hint?: string; error?: string; secure?: boolean; leftIcon?: LucideIcon; right?: React.ReactNode;
  fieldStyle?: StyleProp<ViewStyle>; optional?: boolean; labelRight?: React.ReactNode;
}) {
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <Field label={label} required={required} hint={hint} error={error} style={fieldStyle} optional={optional} right={labelRight}>
      <View style={[styles.input, multiline && { height: undefined, minHeight: 92, alignItems: 'flex-start', paddingVertical: 10 }, focus && styles.inputFocus, !!error && { borderColor: colors.danger }, rest.editable === false && { backgroundColor: colors.cardAlt }]}>
        {L ? <L size={16} color={colors.faint} strokeWidth={1.8} /> : null}
        <TextInput
          {...rest}
          multiline={multiline}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.faint}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          style={[{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.text, paddingVertical: 0, minHeight: multiline ? 70 : undefined, textAlignVertical: multiline ? 'top' : 'center' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null, style]}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            {hidden ? <Eye size={16} color={colors.faint} /> : <EyeOff size={16} color={colors.faint} />}
          </Pressable>
        ) : null}
        {right}
      </View>
    </Field>
  );
}

export function Checkbox({ checked, onChange, label, sub, style }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; sub?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={() => onChange(!checked)} className={`flex-row gap-9 ${sub ? 'items-start' : 'items-center'}`} style={style} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View className={`w-17 h-17 rounded-[4.5px] border-[1.5px] items-center justify-center ${checked ? 'border-primary bg-primary' : 'border-border-strong bg-card'} ${sub ? 'mt-1' : ''}`}>
        {checked ? <Check size={12} color={colors.white} strokeWidth={3} /> : null}
      </View>
      {label ? (
        <View className="flex-1">
          {typeof label === 'string' ? <T size={13} color={colors.textSoft}>{label}</T> : label}
          {sub ? <T size={11.5} color={colors.subtext}>{sub}</T> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function Radio({ selected }: { selected: boolean }) {
  return (
    <View className={`w-17 h-17 rounded-[9px] border-[1.5px] items-center justify-center bg-card ${selected ? 'border-primary' : 'border-border-strong'}`}>
      {selected ? <View className="w-9 h-9 rounded-[5px] bg-primary" /> : null}
    </View>
  );
}

export function RadioCard({ selected, onPress, title, sub, icon: Icon, right, style }: { selected: boolean; onPress: () => void; title: string; sub?: string; icon?: LucideIcon; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Touch onPress={onPress} className={`flex-row items-center gap-11 border-[1.5px] rounded-md p-12 ${selected ? 'border-primary bg-primary-tint' : 'border-border bg-card'}`} style={style} hoverStyle={{ borderColor: selected ? colors.primary : colors.borderStrong }}>
      {Icon ? <Icon size={17} color={selected ? colors.primary : colors.subtext} /> : <Radio selected={selected} />}
      <View className="flex-1">
        <T size={13} weight="semibold">{title}</T>
        {sub ? <T size={11.5} color={colors.subtext}>{sub}</T> : null}
      </View>
      {right}
    </Touch>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => { Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start(); }, [value, anim]);
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Animated.View style={{ width: 38, height: 22, borderRadius: 11, padding: 3, backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [colors.borderStrong, colors.primary] }) }}>
        <Animated.View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) }] }} />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Popover / Select / Menu

interface Anchor { x: number; y: number; w: number; h: number }

export function Popover({ open, onClose, anchor, children, width, align = 'left' }: { open: boolean; onClose: () => void; anchor: Anchor | null; children: React.ReactNode; width?: number; align?: 'left' | 'right' }) {
  const { width: sw, height: sh } = useBreakpoint();
  if (!open || !anchor) return null;
  const w = Math.min(width ?? Math.max(anchor.w, 200), sw - 24);
  let left = align === 'right' ? anchor.x + anchor.w - w : anchor.x;
  left = Math.max(12, Math.min(left, sw - w - 12));
  const below = anchor.y + anchor.h + 6;
  const maxH = Math.max(160, sh - below - 16);
  const flipUp = maxH < 220 && anchor.y > sh / 2;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.popover, { left, width: w }, flipUp ? { bottom: sh - anchor.y + 6, maxHeight: anchor.y - 24 } : { top: below, maxHeight: maxH }]}>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { ref, anchor, open, close, isOpen: !!anchor };
}

export interface Option<V extends string = string> { value: V; label: string; sub?: string }

export function Select<V extends string>({ value, options, onChange, placeholder = 'Select', label, required, error, hint, style, compact, prefix, fieldStyle, optional, disabled }: {
  value: V | '' | null | undefined; options: Option<V>[]; onChange: (v: V) => void; placeholder?: string; label?: string; required?: boolean; error?: string; hint?: string;
  style?: StyleProp<ViewStyle>; compact?: boolean; prefix?: string; fieldStyle?: StyleProp<ViewStyle>; optional?: boolean; disabled?: boolean;
}) {
  const { ref, anchor, open, close, isOpen } = useAnchor();
  const sel = options.find((o) => o.value === value);
  return (
    <Field label={label} required={required} error={error} hint={hint} style={fieldStyle} optional={optional}>
      <View ref={ref} collapsable={false}>
        <Touch disabled={disabled} onPress={open} style={[styles.input, compact && { height: 38 }, isOpen && styles.inputFocus, !!error && { borderColor: colors.danger }, disabled && { backgroundColor: colors.cardAlt }, style]} hoverStyle={{ borderColor: colors.borderStrong }}>
          <T size={13.5} color={sel ? colors.text : colors.faint} numberOfLines={1} style={{ flex: 1 }}>{prefix ? `${prefix}${sel?.label ?? placeholder}` : sel?.label ?? placeholder}</T>
          <ChevronDown size={15} color={colors.subtext} />
        </Touch>
      </View>
      <Popover open={isOpen} anchor={anchor} onClose={close}>
        {options.map((o) => (
          <Touch key={o.value} onPress={() => { onChange(o.value); close(); }} className={MENU_ITEM} hoverStyle={{ backgroundColor: colors.cardAlt }}>
            <View className="flex-1">
              <T size={13.5} weight={o.value === value ? 'semibold' : 'regular'}>{o.label}</T>
              {o.sub ? <T size={11.5} color={colors.subtext}>{o.sub}</T> : null}
            </View>
            {o.value === value ? <Check size={15} color={colors.primary} /> : null}
          </Touch>
        ))}
      </Popover>
    </Field>
  );
}

export interface MenuItem { label: string; icon?: LucideIcon; onPress: () => void; danger?: boolean; section?: string }

export function Menu({ trigger, items, width = 220, align = 'right', header }: { trigger: (open: () => void) => React.ReactNode; items: MenuItem[]; width?: number; align?: 'left' | 'right'; header?: string }) {
  const { ref, anchor, open, close, isOpen } = useAnchor();
  return (
    <>
      <View ref={ref} collapsable={false}>{trigger(open)}</View>
      <Popover open={isOpen} anchor={anchor} onClose={close} width={width} align={align}>
        {header ? <T size={10.5} weight="bold" color={colors.faint} upper style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>{header}</T> : null}
        {items.map((it, i) => (
          <Touch key={i} onPress={() => { close(); setTimeout(it.onPress, 0); }} className={MENU_ITEM} hoverStyle={{ backgroundColor: it.danger ? colors.dangerSoft : colors.cardAlt }}>
            {it.icon ? <it.icon size={15} color={it.danger ? colors.danger : colors.textSoft} strokeWidth={1.8} /> : null}
            <T size={13} color={it.danger ? colors.danger : colors.text} weight="medium">{it.label}</T>
          </Touch>
        ))}
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------- Tabs & segmented

export function Tabs<V extends string>({ tabs, value, onChange, style }: { tabs: { value: V; label: string; count?: number | string }[]; value: V; onChange: (v: V) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 }, style]} contentContainerStyle={{ gap: 22 }}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} className={`flex-row items-center py-11 border-b-2 -mb-1 ${active ? 'border-b-primary' : 'border-b-transparent'}`}>
            <T size={13} weight={active ? 'semibold' : 'medium'} color={active ? colors.text : colors.subtext}>{t.label}</T>
            {t.count !== undefined ? <CountPill n={t.count} active={active} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<V extends string>({ options, value, onChange, size = 'md' }: { options: { value: V; label: string; icon?: LucideIcon; count?: number }[]; value: V; onChange: (v: V) => void; size?: 'sm' | 'md' }) {
  return (
    <View className="flex-row flex-wrap self-start bg-neutral-soft rounded-md p-3">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} className={`flex-row items-center gap-6 rounded-sm ${size === 'sm' ? 'px-10 h-28' : 'px-13 h-32'} ${active ? 'bg-card' : ''}`} style={active ? shadow.card : undefined}>
            {o.icon ? <o.icon size={14} color={active ? colors.text : colors.subtext} /> : null}
            <T size={12.5} weight={active ? 'semibold' : 'medium'} color={active ? colors.text : colors.subtext}>{o.label}</T>
            {o.count !== undefined ? <T size={11} weight="semibold" color={colors.subtext}>{o.count}</T> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, icon: Icon }: { label: string; active?: boolean; onPress?: () => void; icon?: LucideIcon }) {
  return (
    <Touch onPress={onPress} className={`flex-row items-center gap-5 px-11 h-30 rounded-full border ${active ? 'border-primary bg-primary-soft' : 'border-border bg-card'}`} hoverStyle={{ borderColor: active ? colors.primary : colors.borderStrong }}>
      {Icon ? <Icon size={13} color={active ? colors.primary : colors.subtext} /> : active ? <Check size={12} color={colors.primary} strokeWidth={2.6} /> : null}
      <T size={12} weight={active ? 'semibold' : 'medium'} color={active ? colors.primary : colors.textSoft}>{label}</T>
    </Touch>
  );
}

// ---------------------------------------------------------------- Progress

export function ProgressBar({ value, color = colors.primary, track = colors.neutralSoft, height = 6, style }: { value: number; color?: string; track?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function SegmentBar({ segments, height = 8, style }: { segments: { value: number; color: string }[]; height?: number; style?: StyleProp<ViewStyle> }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <View style={[{ flexDirection: 'row', height, gap: 2 }, style]}>
      {segments.filter((s) => s.value > 0).map((s, i) => (
        <View key={i} style={{ flex: s.value / total, backgroundColor: s.color, borderRadius: height }} />
      ))}
    </View>
  );
}

export function Legend({ items, style }: { items: { label: string; color: string; value?: string | number }[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View className="flex-row flex-wrap gap-14" style={style}>
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-6">
          <View className="w-9 h-9 rounded-[2.5px]" style={{ backgroundColor: i.color }} />
          <T size={12} color={colors.subtext}>{i.label}{i.value !== undefined ? <T size={12} weight="semibold" color={colors.text}>  {i.value}</T> : null}</T>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- Layout helpers

/** Responsive grid: `cols` per breakpoint, optional per-child spans. */
export function Grid({ cols, gap = 16, children, spans, style }: { cols: { mobile: number; tablet?: number; desktop?: number }; gap?: number; children: React.ReactNode; spans?: ({ mobile?: number; tablet?: number; desktop?: number } | number)[]; style?: StyleProp<ViewStyle> }) {
  const { bp } = useBreakpoint();
  const n = bp === 'desktop' ? cols.desktop ?? cols.tablet ?? cols.mobile : bp === 'tablet' ? cols.tablet ?? cols.mobile : cols.mobile;
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, marginBottom: -gap }, style]}>
      {kids.map((child, i) => {
        const sp = spans?.[i];
        let span = 1;
        if (typeof sp === 'number') span = sp;
        else if (sp) span = (bp === 'desktop' ? sp.desktop ?? sp.tablet ?? sp.mobile : bp === 'tablet' ? sp.tablet ?? sp.mobile : sp.mobile) ?? 1;
        span = Math.min(span, n);
        return (
          <View key={i} style={{ width: `${(span / n) * 100}%`, paddingHorizontal: gap / 2, marginBottom: gap }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

export function Row({ children, gap = 10, style, wrap, align = 'center', justify, className = '' }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; className?: string }) {
  return <View className={`flex-row ${wrap ? 'flex-wrap' : 'flex-nowrap'} ${className}`} style={[{ alignItems: align, gap, justifyContent: justify }, style]}>{children}</View>;
}

export function KV({ label, value, children, style, valueColor }: { label: string; value?: React.ReactNode; children?: React.ReactNode; style?: StyleProp<ViewStyle>; valueColor?: string }) {
  return (
    <View className="gap-3 min-w-90" style={style}>
      <T size={11.5} color={colors.subtext}>{label}</T>
      {children ?? (typeof value === 'string' || typeof value === 'number' ? <T size={13.5} weight="semibold" color={valueColor}>{value}</T> : value)}
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View className="items-center py-36 px-20 gap-8">
      <IconTile icon={Icon} tone="neutral" size={44} />
      <T size={14.5} weight="semibold" style={{ marginTop: 4 }}>{title}</T>
      {body ? <T size={12.5} color={colors.subtext} center style={{ maxWidth: 360 }}>{body}</T> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ tone = 'info', icon, children, title, action, style }: { tone?: Tone; icon?: LucideIcon; children?: React.ReactNode; title?: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [bg, fg] = toneColors[tone];
  const Icon = icon ?? (tone === 'danger' || tone === 'warning' ? TriangleAlert : tone === 'success' ? CircleCheck : Info);
  // On phones the buttons go under the message so the text keeps the full width.
  const { isMobile } = useBreakpoint();
  const stacked = isMobile && !!action;
  return (
    <View className={`flex-row gap-10 rounded-md px-14 py-11 border ${stacked ? 'items-start' : 'items-center'}`} style={[{ backgroundColor: bg, borderColor: fg + '26' }, style]}>
      <Icon size={16} color={fg} strokeWidth={2} style={stacked ? { marginTop: 2 } : undefined} />
      <View style={{ flex: 1 }}>
        {title ? <T size={13} weight="semibold" color={tone === 'info' ? colors.text : fg}>{title}</T> : null}
        {typeof children === 'string' ? <T size={12.5} color={colors.textSoft}>{children}</T> : children}
        {stacked ? <View style={{ marginTop: 10, alignItems: 'flex-start' }}>{action}</View> : null}
      </View>
      {stacked ? null : action}
    </View>
  );
}

// ---------------------------------------------------------------- Dialogs

export function Dialog({ open, onClose, title, subtitle, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  const { isMobile, height } = useBreakpoint();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={open} animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: isMobile ? 'flex-end' : 'center', alignItems: 'center', padding: isMobile ? 0 : 24 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.dialog, isMobile ? { width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: height * 0.92 } : { width, maxHeight: height - 48 }]}>
          <View className="flex-row items-start p-20 pb-12 gap-12">
            <View className="flex-1">
              <T size={16.5} weight="semibold">{title}</T>
              {subtitle ? <T size={12.5} color={colors.subtext} style={{ marginTop: 2 }}>{subtitle}</T> : null}
            </View>
            <IconButton icon={X} onPress={onClose} size={32} accessibilityLabel="Close" />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 + (isMobile && !footer ? insets.bottom : 0) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View className="flex-row justify-end flex-wrap gap-10 p-16 border-t border-t-border" style={{ paddingBottom: 16 + (isMobile ? insets.bottom : 0) }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Sheet({ open, onClose, children, width = 440 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  const { isMobile } = useBreakpoint();
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ width: isMobile ? '100%' : width, backgroundColor: colors.card, height: '100%', ...shadow.pop }}>{children}</View>
      </View>
    </Modal>
  );
}

export function useConfirm() {
  const [cfg, setCfg] = useState<null | { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void }>(null);
  const node = (
    <Dialog open={!!cfg} onClose={() => setCfg(null)} title={cfg?.title ?? ''} width={440}
      footer={<><Button title="Cancel" variant="secondary" onPress={() => setCfg(null)} /><Button title={cfg?.confirm ?? 'Confirm'} variant={cfg?.danger ? 'danger' : 'primary'} onPress={() => { cfg?.onConfirm(); setCfg(null); }} /></>}>
      <T size={13.5} color={colors.textSoft}>{cfg?.body}</T>
    </Dialog>
  );
  return { ask: setCfg, node };
}

// ---------------------------------------------------------------- Toasts

interface ToastMsg { id: number; text: string; tone: 'success' | 'info' | 'danger' }
const ToastCtx = createContext<(text: string, tone?: ToastMsg['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const show = useCallback((text: string, tone: ToastMsg['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', gap: 8 }}>
        {items.map((t) => (
          <View key={t.id} className="flex-row items-center gap-10 bg-sidebar rounded-md px-16 py-12 max-w-480 mx-16" style={shadow.pop}>
            {t.tone === 'danger' ? <TriangleAlert size={16} color="#F4A49B" /> : <CircleCheck size={16} color={t.tone === 'info' ? '#9DC3F7' : '#8FD3B0'} />}
            <T size={13} weight="medium" color={colors.white} style={{ flexShrink: 1 }}>{t.text}</T>
          </View>
        ))}
      </View>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const MENU_ITEM = 'flex-row items-center gap-10 px-14 py-9';

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  input: { height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.inputBg, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFocus: { borderColor: colors.primary, ...(Platform.OS === 'web' ? ({ boxShadow: `0 0 0 3px ${colors.primarySoft}` } as any) : {}) },
  popover: { position: 'absolute', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 5, ...shadow.pop },
  dialog: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden', ...shadow.pop },
});
