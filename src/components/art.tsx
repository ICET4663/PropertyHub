import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';

/** Two-building illustration used on property cards and headers. */
export function BuildingArt({ bg, a, b, height = 130, width = 320 }: { bg: string; a: string; b: string; height?: number; width?: number }) {
  const W = 320, H = 130;
  const win = (x0: number, y0: number, cols: number, rows: number, gx: number, gy: number, s: number, fill: string) => {
    const out: React.ReactNode[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<Rect key={`${x0}-${r}-${c}`} x={x0 + c * gx} y={y0 + r * gy} width={s} height={s} fill={fill} />);
    return out;
  };
  const light = (hex: string) => (hex === '#8A6A34' ? '#F2E2BF' : '#DDE8E3');
  return (
    <View style={{ height, backgroundColor: bg, overflow: 'hidden' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet">
        {/* tall building */}
        <Rect x={86} y={22} width={92} height={112} fill={a} />
        <Rect x={86} y={18} width={92} height={6} fill={a} opacity={0.75} />
        {win(96, 32, 5, 5, 16, 20, 9, light(a))}
        {/* short building */}
        <Rect x={196} y={52} width={70} height={82} fill={b} />
        <Rect x={196} y={48} width={70} height={6} fill={b} opacity={0.75} />
        {win(205, 62, 4, 4, 15, 18, 8, light(b))}
      </Svg>
    </View>
  );
}

/** Dark cityscape with lit windows and a moon, used on the auth panel. */
export function CityScape({ height = 300 }: { height?: number }) {
  const W = 560, H = 300;
  const lit = new Set(['0-1', '1-3', '2-0', '3-2', '4-4', '5-1', '6-3', '2-4']);
  const tower = (x: number, y: number, w: number, cols: number, rows: number, key: string, shade: string) => {
    const nodes: React.ReactNode[] = [<Rect key={`${key}-b`} x={x} y={y} width={w} height={H - y} fill={shade} />];
    const gx = (w - 16) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = lit.has(`${(r + key.length) % 8}-${(c + r) % 5}`) && (r * cols + c + key.length) % 3 === 0;
      nodes.push(<Rect key={`${key}-${r}-${c}`} x={x + 8 + c * gx + gx * 0.2} y={y + 12 + r * 22} width={gx * 0.55} height={11} fill={on ? '#E8B04B' : '#23493E'} opacity={on ? 0.95 : 0.9} />);
    }
    return nodes;
  };
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <G>
          <Circle cx={430} cy={60} r={52} fill="#E8B04B" opacity={0.08} />
          <Circle cx={430} cy={60} r={30} fill="#B99A53" opacity={0.55} />
        </G>
        {tower(0, 150, 110, 5, 7, 'a', '#15372E')}
        {tower(120, 70, 150, 6, 11, 'bb', '#1B4136')}
        {tower(290, 120, 130, 5, 8, 'ccc', '#173B31')}
        {tower(430, 170, 130, 5, 6, 'dddd', '#15372E')}
        <Rect x={0} y={H - 16} width={W} height={16} fill="#0B221C" />
      </Svg>
    </View>
  );
}
