import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, font } from '../theme';
import { T } from './ui';

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(120, e.nativeEvent.layout.width)) };
}

/** Multi-segment donut. Segments drawn clockwise from 12 o'clock with small gaps. */
export function Donut({ size = 180, stroke = 22, segments, children, gap = 0.012 }: { size?: number; stroke?: number; segments: Array<{ value: number; color: string }>; children?: React.ReactNode; gap?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const visible = segments.filter((s) => s.value > 0);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.neutralSoft} strokeWidth={stroke} fill="none" />
        {visible.map((s, i) => {
          const frac = s.value / total;
          const g = visible.length > 1 ? gap : 0;
          const len = Math.max(0, frac - g) * c;
          const el = (
            <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset * c}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          offset += frac;
          return el;
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

/** Vertical bars with value labels. */
export function BarChart({ data, height = 220, barWidth, valueColor }: { data: Array<{ label: string; value: number; color?: string; valueColor?: string; bold?: boolean }>; height?: number; barWidth?: number; valueColor?: string }) {
  const { w, onLayout } = useWidth();
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotH = height - 56;
  const slot = w / Math.max(1, data.length);
  const bw = barWidth ?? Math.min(58, slot * 0.62);
  return (
    <View onLayout={onLayout} style={{ height }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: plotH + 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * plotH);
          return (
            <View key={i} style={{ width: slot, alignItems: 'center', justifyContent: 'flex-end' }}>
              <T size={12} weight="bold" color={d.valueColor ?? valueColor ?? colors.text} style={{ marginBottom: 4 }}>{d.value}</T>
              <View style={{ width: bw, height: h, backgroundColor: d.color ?? colors.primary, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {data.map((d, i) => (
          <View key={i} style={{ width: slot, alignItems: 'center', paddingHorizontal: 2 }}>
            <T size={11.5} weight={d.bold ? 'semibold' : 'regular'} color={d.bold ? colors.text : colors.subtext} center numberOfLines={2}>{d.label}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal label / bar / value rows (e.g. requests by category). */
export function HBarList({ data, color = colors.primary, labelWidth = 130, showValue = true, max: maxIn }: { data: Array<{ label: string; value: number; color?: string; display?: string; muted?: boolean }>; color?: string; labelWidth?: number; showValue?: boolean; max?: number }) {
  const max = maxIn ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 13 }}>
      {data.map((d) => (
        <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <T size={12.5} color={d.muted ? colors.faint : colors.textSoft} style={{ width: labelWidth }} numberOfLines={1}>{d.label}</T>
          <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.neutralSoft, overflow: 'hidden' }}>
            <View style={{ width: `${(d.value / max) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: d.color ?? color }} />
          </View>
          {showValue ? <T size={12.5} weight="bold" style={{ width: 34, textAlign: 'right' }}>{d.display ?? d.value}</T> : null}
        </View>
      ))}
    </View>
  );
}

/** Line/area chart with optional dashed target line. */
export function LineChart({ points, height = 240, target, unit = '', yMax, yTicks, highlightLast = true }: {
  points: Array<{ label: string; sub?: string; value: number }>; height?: number; target?: number; unit?: string; yMax?: number; yTicks?: number[]; highlightLast?: boolean;
}) {
  const { w, onLayout } = useWidth();
  const padL = 30, padR = 16, padT = 16, padB = 44;
  const max = yMax ?? Math.max(...points.map((p) => p.value), target ?? 0) * 1.15;
  const plotW = Math.max(40, w - padL - padR);
  const plotH = height - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = `M${x(0)},${y(0)} L${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' L')} L${x(points.length - 1)},${y(0)} Z`;
  const ticks = yTicks ?? [0, Math.round(max / 2), Math.round(max)];
  const last = points[points.length - 1];
  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.12" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {ticks.map((t) => <Line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />)}
        <Path d={area} fill="url(#area)" />
        {target !== undefined ? <Line x1={padL} x2={w - padR} y1={y(target)} y2={y(target)} stroke={colors.vizMaint} strokeWidth={1.6} strokeDasharray="6 5" /> : null}
        <Polyline points={line} fill="none" stroke={colors.primary} strokeWidth={2.4} strokeLinejoin="round" />
        {points.map((p, i) => {
          const isLast = highlightLast && i === points.length - 1;
          return <Circle key={i} cx={x(i)} cy={y(p.value)} r={isLast ? 5.5 : 4.5} fill={isLast ? colors.primary : colors.card} stroke={colors.primary} strokeWidth={2} />;
        })}
      </Svg>
      {ticks.map((t) => (
        <T key={t} size={11} color={colors.subtext} style={{ position: 'absolute', left: 0, top: y(t) - 8, width: padL - 6, textAlign: 'right' }}>{`${t}${unit}`}</T>
      ))}
      {highlightLast && last ? (
        <T size={11.5} weight="bold" style={{ position: 'absolute', left: x(points.length - 1) - 24, top: y(last.value) - 24, width: 40, textAlign: 'center' }}>{`${last.value}${unit}`}</T>
      ) : null}
      {points.map((p, i) => (
        <View key={i} style={{ position: 'absolute', left: x(i) - 30, width: 60, top: height - padB + 10, alignItems: 'center' }}>
          <T size={11.5} color={colors.subtext}>{p.label}</T>
          {p.sub ? <T size={11} weight={i === points.length - 1 ? 'bold' : 'regular'} color={i === points.length - 1 ? colors.primary : colors.faint}>{p.sub}</T> : null}
        </View>
      ))}
    </View>
  );
}

/** Monthly bars drawn against a full-height track (reports occupancy by month). */
export function TrackBars({ data, height = 220 }: { data: Array<{ label: string; value: number; display: string }>; height?: number }) {
  const plotH = height - 50;
  return (
    <View style={{ height, flexDirection: 'row', gap: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <T size={11} weight="semibold" color={colors.textSoft}>{d.display}</T>
          <View style={{ width: '100%', maxWidth: 46, height: plotH, backgroundColor: colors.neutralSoft, borderRadius: 5, marginTop: 6, justifyContent: 'flex-end', overflow: 'hidden' }}>
            <View style={{ height: `${d.value * 100}%`, backgroundColor: colors.primary, borderRadius: 5 }} />
          </View>
          <T size={11} color={colors.subtext} style={{ marginTop: 6 }}>{d.label}</T>
        </View>
      ))}
    </View>
  );
}

/** Lease timeline with milestone dots. */
export function Timeline({ progress, marks }: { progress: number; marks: Array<{ at: number; label: string; sub?: string; tone?: 'done' | 'todo' | 'danger' }> }) {
  const { w, onLayout } = useWidth();
  return (
    <View onLayout={onLayout} style={{ height: 70, marginHorizontal: 8 }}>
      <View style={{ position: 'absolute', top: 18, left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.neutralSoft }} />
      <View style={{ position: 'absolute', top: 18, left: 0, width: `${Math.min(1, Math.max(0, progress)) * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
      {marks.map((m, i) => {
        const left = m.at * w;
        const c = m.tone === 'danger' ? colors.danger : m.tone === 'done' ? colors.primary : colors.accent;
        return (
          <View key={i} style={{ position: 'absolute', left: left - 7, top: 13 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: c, backgroundColor: colors.card }} />
          </View>
        );
      })}
      {marks.map((m, i) => {
        const left = Math.max(0, Math.min(w - 90, m.at * w - 45));
        return (
          <View key={`l${i}`} style={{ position: 'absolute', left, top: 34, width: 90, alignItems: m.at === 0 ? 'flex-start' : m.at >= 0.98 ? 'flex-end' : 'center' }}>
            <T size={11} weight="semibold" color={m.tone === 'danger' ? colors.danger : colors.text} numberOfLines={1}>{m.label}</T>
            {m.sub ? <T size={10.5} color={colors.subtext} numberOfLines={1}>{m.sub}</T> : null}
          </View>
        );
      })}
    </View>
  );
}

export { Rect, font };
