import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
  colors: {
    bg: string;
    card: string;
    cardAlt: string;
    text: string;
    subtext: string;
    border: string;
    primary: string;
    primarySoft: string;
    onPrimary: string;
    accent: string;
    accentSoft: string;
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    warningSoft: string;
    info: string;
    infoSoft: string;
    tabBar: string;
    headerBg: string;
    inputBg: string;
    overlay: string;
    shadow: string;
  };
}

const lightColors: Theme['colors'] = {
  bg: '#F2F5FA',
  card: '#FFFFFF',
  cardAlt: '#F7F9FD',
  text: '#0E1B2C',
  subtext: '#64748B',
  border: '#E4E9F2',
  primary: '#0B2545',
  primarySoft: '#E8EEF7',
  onPrimary: '#FFFFFF',
  accent: '#E8A33D',
  accentSoft: '#FDF3E3',
  success: '#1E9E6A',
  successSoft: '#E3F5EC',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  info: '#3B82F6',
  infoSoft: '#E8F0FE',
  tabBar: '#FFFFFF',
  headerBg: '#FFFFFF',
  inputBg: '#F1F4FA',
  overlay: 'rgba(11, 37, 69, 0.45)',
  shadow: '#0B2545',
};

const darkColors: Theme['colors'] = {
  bg: '#0A1220',
  card: '#131D31',
  cardAlt: '#182440',
  text: '#F1F5F9',
  subtext: '#8CA0B8',
  border: '#22304A',
  primary: '#5B8DD9',
  primarySoft: '#1B2B47',
  onPrimary: '#FFFFFF',
  accent: '#F0B45C',
  accentSoft: '#2E2410',
  success: '#34C77B',
  successSoft: '#12352A',
  danger: '#F0616B',
  dangerSoft: '#3A1B22',
  warning: '#F5A524',
  warningSoft: '#3A2C12',
  info: '#60A5FA',
  infoSoft: '#16283F',
  tabBar: '#101A2E',
  headerBg: '#101A2E',
  inputBg: '#1A2740',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return {
    dark,
    colors: dark ? darkColors : lightColors,
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
};

export const AVATAR_COLORS = [
  '#0B2545', '#1E9E6A', '#E8A33D', '#7C5CFC', '#E5484D',
  '#0E7C86', '#C9526E', '#3B82F6', '#8B5CF6', '#D97706',
];
