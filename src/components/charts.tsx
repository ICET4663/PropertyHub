import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

export function Donut({ size = 130, stroke = 14, progress, color, trackColor, children }: {
  size?: number; stroke?: number; progress: number; color: string; trackColor: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {p > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {children}
      </View>
    </View>
  );
}

export function MiniBars({ data, height = 150, color, labelColor }: {
  data: { label: string; value: number; display?: string }[];
  height?: number; color?: string; labelColor?: string;
}) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  const barColor = color ?? t.colors.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, justifyContent: 'space-between' }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 42));
        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 9, color: labelColor ?? t.colors.subtext, marginBottom: 4 }} numberOfLines={1}>
              {d.display ?? d.value}
            </Text>
            <View style={{ width: 22, height: h, backgroundColor: barColor, borderRadius: 5, opacity: i === data.length - 1 ? 1 : 0.45 }} />
            <Text style={{ fontSize: 10, color: labelColor ?? t.colors.subtext, marginTop: 6 }} numberOfLines={1}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function HBars({ data, color }: {
  data: { label: string; value: number; display?: string; color?: string }[];
  color?: string;
}) {
  const t = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View>
      {data.map((d, i) => (
        <View key={i} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.colors.text, flex: 1 }} numberOfLines={1}>{d.label}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: d.color ?? color ?? t.colors.primary }}>{d.display ?? d.value}</Text>
          </View>
          <View style={{ height: 7, borderRadius: 4, backgroundColor: t.colors.inputBg, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, height: '100%', backgroundColor: d.color ?? color ?? t.colors.primary, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
