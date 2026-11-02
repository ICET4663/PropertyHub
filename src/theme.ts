import { useWindowDimensions } from 'react-native';

// PropertyHub design tokens — deep evergreen chrome, warm paper canvas, honey accent.
export const colors = {
  // chrome
  sidebar: '#0F2A23',
  sidebarRaised: '#173A30',
  sidebarBorder: '#1F4538',
  sidebarText: '#C9D6D0',
  sidebarMuted: '#7F998F',

  // canvas & surfaces
  bg: '#F3F2ED',
  card: '#FFFFFF',
  cardAlt: '#FAF9F5',
  border: '#E7E4DC',
  borderStrong: '#D6D2C7',
  inputBg: '#FFFFFF',

  // text
  text: '#14231E',
  textSoft: '#3B4A44',
  subtext: '#6E7A74',
  faint: '#9AA39E',

  // brand
  primary: '#1F5C4A',
  primaryHover: '#184B3C',
  primarySoft: '#E3EEE8',
  primaryTint: '#F0F6F2',
  accent: '#E8B04B',
  accentDeep: '#B7801F',
  accentSoft: '#FBF1DD',

  // semantic
  success: '#1F7A55',
  successSoft: '#E1F2E9',
  danger: '#D4483B',
  dangerDeep: '#A92E23',
  dangerSoft: '#FBE7E4',
  warning: '#C9851A',
  warningSoft: '#FCF0DA',
  info: '#3A6FD8',
  infoSoft: '#E6EEFC',
  purple: '#6F55C8',
  purpleSoft: '#EEEAFB',
  neutralSoft: '#EFEEEA',

  // data viz
  vizOccupied: '#1F5C4A',
  vizVacant: '#4C7FE0',
  vizMaint: '#E0A526',
  vizSage: '#9DB5AA',
  vizBronze: '#C68D2E',

  overlay: 'rgba(15, 42, 35, 0.45)',
  white: '#FFFFFF',
};

export const radius = { xs: 6, sm: 8, md: 10, lg: 14, xl: 18, full: 999 };

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  mono: 'Menlo',
};

export const shadow = {
  card: {
    shadowColor: '#0F2A23',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pop: {
    shadowColor: '#0F2A23',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint = width >= 1100 ? 'desktop' : width >= 720 ? 'tablet' : 'mobile';
  return { width, height, bp, isMobile: bp === 'mobile', isDesktop: bp === 'desktop' };
}

// Pick a value per breakpoint, falling back to the next smaller one.
export function useResponsive<T>(v: { mobile: T; tablet?: T; desktop?: T }): T {
  const { bp } = useBreakpoint();
  if (bp === 'desktop') return v.desktop ?? v.tablet ?? v.mobile;
  if (bp === 'tablet') return v.tablet ?? v.mobile;
  return v.mobile;
}

// Soft tones for initials avatars (bg, fg)
export const AVATAR_TONES: [string, string][] = [
  ['#FBEEDB', '#9A6414'],
  ['#E3EEE8', '#1F5C4A'],
  ['#E6EEFC', '#3A6FD8'],
  ['#EEEAFB', '#6F55C8'],
  ['#FBE7E4', '#B23A2F'],
  ['#E8F3F1', '#1D7468'],
];
