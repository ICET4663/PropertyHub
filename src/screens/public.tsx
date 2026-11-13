import React, { useCallback, useEffect, useRef, useState } from 'react';
import {Animated, Image, Pressable, ImageBackground, useWindowDimensions, Platform, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { Link as RouterLink, Redirect, type Href } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import {
  Bell, Building2, ChevronDown,ChevronUp, ClipboardCheck, Pin, CreditCard, FileText, KeyRound, LineChart, Mail, ShieldCheck, Smartphone, UserCheck, Wrench,
} from 'lucide-react-native';
import { colors, font, radius, shadow, useBreakpoint } from '../theme';
import { useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { homeRouteFor, Brand, Brand2 } from '../components/shell';
import { Button, IconTile, T, Touch } from '../components/ui';

/** Support inbox shown on the public pages. Set EXPO_PUBLIC_SUPPORT_EMAIL; without it, visitors are pointed to their management office. */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';

const LEGAL_UPDATED = '28 October 2026';

/** Wide version of the background photo, shared by the navbar and the hero. */
 const LANDING_BACKGROUND =
  'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794575977/aerial-shot-colorful-buildings-surrounded-by-trees_1_qmiw1d.jpg';

// const LANDING_BACKGROUND =
//   'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794498080/henry-lawani-ubF-Cg0L0hM-unsplash_1_rxx53u.jpg';

const FAQ_SIDEIMAGE ='https://res.cloudinary.com/dyz6uugbr/image/upload/v1794569699/Thoughtful_Afro_with_Red_Bandana_eqnigp.png'

const SLIDER_IMAGES: { uri: string; alt: string }[] = [
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794388699/bishop-ayide-HXcHJS61mjM-unsplash_qmsn9n.jpg', alt: 'Sample 1' },
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794402238/moon-bouy-wPqtamiIraM-unsplash_gw1deq.jpg', alt: 'Sample 2' },
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794404338/brett-jordan-jUHskkXQGs0-unsplash_c7bekr.jpg', alt: 'Sample 3' },
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794404359/divaris-shirichena-gRRFvq0ewaI-unsplash_j3g4zo.jpg', alt: 'Sample 4' },
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794404385/brett-jordan-NAaCaQrpX5I-unsplash_gahxhz.jpg', alt: 'Sample 5' },
  { uri: 'https://res.cloudinary.com/dyz6uugbr/image/upload/v1794403206/nir-log-R4Y62I2yem0-unsplash_efkjlk.jpg', alt: 'Sample 6' },
];


// ---------------------------------------------------------------- shared pieces

/** A real heading on the web (h1–h3), so screen readers and outlines see the page structure. */
function Heading({ level, children, size, color = colors.text, center, style }: {
  level: 1 | 2 | 3; children: React.ReactNode; size: number; color?: string; center?: boolean; style?: TextStyle;
}) {
  return (
    <Text
      role="heading"
      aria-level={level}
      style={[{ fontFamily: font.bold, fontSize: size, color, lineHeight: Math.round(size * 1.25), letterSpacing: size > 24 ? -0.6 : -0.2 }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

/** A link that renders as a real <a href> on the web. */
function PageLink({ href, children, color = colors.primary, size = 13.5 }: { href: Href | string; children: React.ReactNode; color?: string; size?: number }) {
  return (
    <RouterLink href={href as Href} style={{ fontFamily: font.semibold, fontSize: size, color, lineHeight: Math.round(size * 1.42), textDecorationLine: 'underline' }}>
      {children}
    </RouterLink>
  );
}

function Section({ children, tint, onLayout, label }: { children: React.ReactNode; tint?: string; onLayout?: (y: number) => void; label?: string }) {
  const { isMobile } = useBreakpoint();
  return (
    <View
      role={label ? 'region' : undefined}
      aria-label={label}
      onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}
      style={{ backgroundColor: tint, paddingVertical: isMobile ? 44 : 72, paddingHorizontal: isMobile ? 16 : 32 }}
    >
      <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center' }}>{children}</View>
    </View>
  );
}

function SectionIntro({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  const { isMobile } = useBreakpoint();
  return (
    <View style={{ marginBottom: isMobile ? 24 : 36, maxWidth: 680, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 20 }}>
      <T size={11} weight="bold" color={colors.sidebar} upper style={{ marginBottom: 3}}>{kicker}</T>
      <Heading level={2} style={{ fontWeight: 900}} size={isMobile ? 24 : 28}>{title}</Heading>
      {body ? <T size={14} color={colors.textSoft} style={{width: '100%', maxWidth: 300,  marginTop: 8, lineHeight: 23, textAlign:'center' }}>{body}</T> : null}
    </View>
  );
}


/** Infinite, auto-playing image slider with previous/next buttons and an "n/total" counter. */
function ImageSlider({ images, interval = 4000 }: { images: { uri: string; alt: string }[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const prevIndex = useRef(0);
  const opacities = useRef(images.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const total = images.length;

  // wrap around in both directions = infinite
  const go = useCallback((step: number) => setIndex((i) => (i + step + total) % total), [total]);

  // crossfade whenever the index changes
  useEffect(() => {
    if (prevIndex.current === index) return;
    Animated.parallel([
      Animated.timing(opacities[prevIndex.current], { toValue: 0, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacities[index], { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    prevIndex.current = index;
  }, [index, opacities]);

  // autoplay: depends on index, so any manual click restarts the countdown
  useEffect(() => {
    if (paused || total < 2) return;
    const t = setTimeout(() => go(1), interval);
    return () => clearTimeout(t);
  }, [index, paused, interval, go, total]);

  return (
    <View style={{flexDirection: 'row', justifyContent: 'flex-end'}}>
     <View style={{ width: '100%'}}> 
      <T size={15.5} weight="medium" color={colors.warningSoft} style={{marginBottom: 17 }}>Family House Luxury</T>
     <Pressable
      onHoverIn={() => setPaused(true)}
      onHoverOut={() => setPaused(false)}
      style={{ width: '100%', height: 240, overflow: 'hidden', backgroundColor: colors.sidebar,  }}
    >
      {images.map((img, i) => (
        <Animated.View key={img.uri} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: opacities[i] }]}>
          <Image source={{ uri: img.uri }} accessibilityLabel={img.alt} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        </Animated.View>
      ))}
      {/* counter, e.g. 4/9 */}
    </Pressable>
     <View
      style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      width: '100%',
      marginVertical: 19
    }}
  >
    {images.map((_, i) => (
      <View
        key={i}
        style={{
          flex: 1,
          height: 1.7,
          backgroundColor: i === index ? '#737373' : '#FFFFFF',
        }}
      />
     ))}
    </View>
     <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 10}}>
      
      <T size={13} weight="medium" color={colors.sidebarText} onPress={() => go(-1)}>PREV</T>
      <View
        pointerEvents="none"
        style={{paddingHorizontal: 10, paddingVertical: 4 }}
      >
        <T size={13} weight="medium" color={colors.white}>{`${index + 1}/${total}`}</T>
      </View>
      <T size={13} weight='medium' color="#fff" onPress={() => go(1)}>NEXT</T>
     </View> 
     </View> 
    </View>  
  );
}


function Footer() {
  const insets = useSafeAreaInsets();
  const { isMobile } = useBreakpoint();
  return (
    <View role="contentinfo" style={{ backgroundColor: '#E5E5E5', paddingVertical: 28, paddingHorizontal: 16, paddingBottom: 28 + insets.bottom, }}>
      <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: isMobile ? 'column' : 'row', gap: 22, justifyContent: isMobile ? 'center' : 'space-between', alignItems: 'center' }}>
        <Brand2 size='lg' />
        <View style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: 16 }}>
          <PageLink size={13} href="/privacy" color={colors.neutral700}>Privacy</PageLink>
          <PageLink size={13} href="/terms" color={colors.neutral700}>Terms</PageLink>
          <PageLink size={13} href="/signIn" color={colors.neutral700}>Sign in</PageLink>
        </View>
        <T size={12} color={colors.neutral700}>{`© ${new Date().getFullYear()} PropertyHub`}</T>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- landing page
type AudienceStep = { title: string; text: string };
const AUDIENCES: { icon: LucideIcon; color: string; who: string; steps: AudienceStep[] }[] = [
  {
    icon: Building2,
    color: '#3439CA',
    who: 'Property managers',
    steps: [
      { title: 'Set up your properties', text: 'Set up locations, blocks and units, and see which are let, vacant or under repair.' },
      { title: 'Add your tenants', text: 'Add tenants, create their sign-in details and share them by WhatsApp or email.' },
      { title: 'Run leases and repairs', text: 'Create, renew and end leases; assign repairs to a caretaker or vendor.' },
    ],
  },
  {
    icon: KeyRound,
    color: '#0D9488',
    who: 'Tenants',
    steps: [
      { title: 'Sign in', text: 'Use the email and password your property manager shared with you by WhatsApp or email.' },
      { title: 'Upload your ID', text: 'Then see your lease, charges and documents in one place.' },
      { title: 'Report an issue', text: 'Add photos, follow the repair live, and confirm when it is fixed.' },
    ],
  },
  {
    icon: Wrench,
    color: '#EA580C',
    who: 'Caretakers',
    steps: [
      { title: "Open today's jobs", text: 'See what is in progress, due today and coming up.' },
      { title: 'Call and prepare', text: 'Call the tenant in one tap and read the access notes before you go.' },
      { title: 'Finish the job', text: 'Start the job, add completion photos and mark it fixed for the tenant to confirm.' },
    ],
  },
];
// const AUDIENCES: { icon: LucideIcon; color: string; who: string; steps: string[] }[] = [
//   {
//     icon: Building2,
//     color: '#3439CA',
//     who: 'Property managers',
//     steps: [
//       'Set up locations, blocks and units, and see which are let, vacant or under repair.',
//       'Add tenants, create their sign-in details and share them by WhatsApp or email.',
//       'Create, renew and end leases; assign repairs to a caretaker or vendor.',
//     ],
//   },
//   {
//     icon: KeyRound,
//     color: '#0D9488',
//     who: 'Tenants',
//     steps: [
//       'Sign in with the email and password your property manager shared with you by WhatsApp or email.',
//       'Upload your ID, then see your lease, charges and documents in one place.',
//       'Report an issue with photos, follow the repair live, and confirm when it is fixed.',
//     ],
//   },
//   {
//     icon: Wrench,
//     color: '#EA580C',
//     who: 'Caretakers',
//     steps: [
//       'Open the app to today\'s jobs: what is in progress, due today and coming up.',
//       'Call the tenant in one tap and read the access notes before you go.',
//       'Start the job, add completion photos and mark it fixed for the tenant to confirm.',
//     ],
//   },
// ];

const FEATURES: { icon: LucideIcon; title: string; body: string; color: string }[] = [
  { icon: Building2, title: 'Portfolio and occupancy', body: 'Every location, block and unit with its status, rent and current tenant.', color:"#7C3AED" },
  { icon: UserCheck, title: 'Tenant onboarding', body: 'Manager-created sign-ins, ID uploads and a review step before a tenant gets full access.', color:"#3439CA" },
  { icon: FileText, title: 'Leases and documents', body: 'Lease terms, renewals and move-outs, with agreements and papers stored privately.', color: '#0D9488' },
  { icon: ClipboardCheck, title: 'Repairs from report to sign-off', body: 'Photos at every step, a full history, and the tenant confirms or disputes the result.', color: '#D97706' },
  { icon: CreditCard, title: 'Rent and charges', body: 'Tenants pay through Paystack. A charge shows as paid only after the payment is confirmed.', color: '#16A34A' },
  { icon: Bell, title: 'Live updates and reminders', body: 'Status changes appear within seconds, with reminders before rent is due and leases end.', color: '#DB2777' },
  { icon: LineChart, title: 'Reports and exports', body: 'Occupancy, rent and maintenance reports, and CSV exports for your accounts.', color: '#0284C7' },
  { icon: ShieldCheck, title: 'Access by role', body: 'Managers, caretakers, accountants and tenants each see only what their role allows.', color: '#475569' },
];

type FaqEntry = { id: string; q: string; a: string };

const FAQ: FaqEntry[] = [
  {
    id: 'account',
    q: 'How do I get an account?',
    a: 'Accounts are created for you. Your property manager or administrator sets up your sign-in and shares your email and a temporary password by WhatsApp or email. Please change the password after you first sign in.',
  },
  {
    id: 'privacy',
    q: 'Who can see my ID and documents?',
    a: "Your files are kept in private storage and open only through links that expire after 10 minutes. Only you, your property's managers, and your organisation's administrators and accountants can open your ID. Other tenants and caretakers cannot.",
  },
  {
    id: 'pay-rent',
    q: 'How do I pay rent?',
    a: 'Open My lease and choose Pay now next to a charge. Payments are processed by Paystack, so PropertyHub never sees or stores your card details.',
  },
  {
    id: 'mobile-app',
    q: 'Is there a mobile app?',
    a: "The iPhone and Android apps are coming soon. Until then, PropertyHub works in your phone's web browser.",
  },
  {
    id: 'forgot-password',
    q: 'I forgot my password.',
    a: 'Choose Forgot password on the sign-in page and we will email you a code to set a new one. You can also sign in with an emailed code instead of a password.',
  },
];

type SectionKey = 'how' | 'features' | 'faq' | 'support';

// ---------------------------------------------------------------- pinned note
 const NOTE_FONT = Platform.select({
  web: '"Comic Sans MS", "Chalkboard SE", sans-serif',
  ios: 'Chalkboard SE',
  default: undefined,
});

function NoteCard({ index, step, color, rotate, style }: {
  index: number; step: AudienceStep; color: string; rotate: string; style?: object;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        {
          width: 270,
          maxWidth: '100%',
          backgroundColor: colors.card,
          borderRadius: 25,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 8,
          zIndex: hover ? 5 : 1,
          transform: [{ rotate: hover ? '0deg' : rotate }, { scale: hover ? 1.04 : 1 }],
          ...(Platform.OS === 'web' ? ({ transition: 'transform 0.3s ease' } as object) : null),
        },
        shadow.card,
        style,
      ]}
    >
      <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 8 }}>
        <Pin size={28} color={color} fill={color} />
      </View>
      <View style={{ backgroundColor: `${color}12`, borderColor: `${color}33`, borderWidth: 1, borderRadius: 15, padding: 15 }}>
        <T size={28} color={color} style={{ fontFamily: NOTE_FONT, marginBottom: 14 }}>{`0${index + 1}`}</T>
        <Heading level={3} size={16} style={{ marginBottom: 8 }}>{step.title}</Heading>
        <T size={13} color={colors.textSoft} style={{ lineHeight: 21 }}>{step.text}</T>
      </View>
    </Pressable>
  );
}

const DESKTOP_HEIGHT = 560;
const SLOTS = [
  { left: '8%' as const, top: 0, rotate: '4deg' },
  { right: '8%' as const, top: 150, rotate: '-4deg' },
  { left: '8%' as const, top: 330, rotate: '4deg' },
];


function FaqItem({ item, expanded, onToggle }: { item: FaqEntry; expanded: boolean; onToggle: () => void }) {
  const buttonId = `faq-${item.id}-button`;
  const panelId = `faq-${item.id}-panel`;
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: expanded ? colors.borderStrong : colors.border,
      }}
    >
      <View role="heading" aria-level={3}>
        <Touch
          id={buttonId}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={item.q}
          aria-expanded={expanded}
          aria-controls={panelId}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 18, minHeight: 56 }}
        >
          <T size={15} weight="bold" color={colors.text} style={{ flex: 1, lineHeight: 21 }}>{item.q}</T>
          <Chevron size={18} color={colors.textSoft} />
        </Touch>
      </View>

      {/* Hidden rather than unmounted, so the answers stay in the DOM for search engines */}
      <View
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        style={{ display: expanded ? 'flex' : 'none' }}
      >
        <T size={14} color={colors.textSoft} style={{ paddingBottom: 18, paddingRight: 30, lineHeight: 22 }}>
          {item.a}
        </T>
      </View>
    </View>
  );
}


export function LandingScreen() {
  const { me } = useStore();
  const { route, navigate } = useRouter();
  const { isMobile, bp } = useBreakpoint();
  const [active, setActive] = useState(0);
  const audience = AUDIENCES[active];
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  // const [open, setOpen] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(FAQ[0].id);
  // Section offsets are measured relative to <View role="main">, so the hero's height is added when scrolling.
  const heroHeight = useRef(0);
  const measure = useCallback((k: SectionKey, y: number) => { offsets.current[k] = y; }, []);
  // Header links set the section to scroll to; /welcome?section=faq (the "Help" link on sign-in) starts with one,
  // which waits a moment for the sections to lay out.
  const [jump, setJump] = useState<{ to: SectionKey; delay: number } | null>(() => {
    const to = route.params.section as SectionKey | undefined;
    return to ? { to, delay: 250 } : null;
  });
  const jumpTo = (to: SectionKey) => setJump({ to, delay: 0 });
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => {
      const y = heroHeight.current + (offsets.current[jump.to] ?? 0) - 8;
      scroll.current?.scrollTo({ y: Math.max(0, y), animated: true });
      setJump(null);
    }, jump.delay);
    return () => clearTimeout(t);
  }, [jump]);

  // Phones skip the landing page.
  if (Platform.OS !== 'web') return <Redirect href={me ? '/' : '/signIn'} />;

  const signIn = me ? () => navigate(homeRouteFor(me.role)) : () => navigate('signIn');
  const navItems: [SectionKey, string][] = [['how', 'How it works'], ['features', 'Features'], ['faq', 'FAQ']];

  const { height: screenHeight } = useWindowDimensions();


  const { width: screenWidth } = useWindowDimensions();
  const showSlider = screenWidth >= 992;
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <Head>
        <title>PropertyHub · Property management for managers, tenants and caretakers</title>
        <meta name="description" content="PropertyHub keeps units, tenants, leases, rent and repairs in one place. Managers run the portfolio, tenants pay rent and report issues, caretakers work their jobs." />
      </Head>
      <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* header */}
          <View role="banner" style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: isMobile ? 16 : 32, backgroundColor: colors.white }}>
            <View style={{ width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,  backgroundColor: '#F5F5F5', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 15}}>
              <Brand2 size='lg'/>
              <View role="navigation" aria-label="Page sections" style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 8 }}>
                {!isMobile ? navItems.map(([k, label]) => (
                  <Touch key={k} onPress={() => jumpTo(k)} onHoverIn={() => setHoveredNav(k)} onHoverOut={() => setHoveredNav(null)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, }} hoverStyle={{ backgroundColor: '#FFFFFF' }}>
                    <T size={13.5} weight="semibold" color={hoveredNav === k ? '#3439CA' : colors.neutral600}>{label}</T>
                  </Touch>
                )) : null}
              </View>
              <Button title={me ? 'Open app' : 'Sign in'} variant="primary" size="sm" style={{borderRadius: 80, paddingVertical: 17 ,paddingHorizontal: 20}} onPress={signIn} />
            </View>
          </View>
         {/* navbar + hero share one background image */}
         <ImageBackground
          source={{ uri: LANDING_BACKGROUND }}
          resizeMode="cover"
          onLayout={(e) => { heroHeight.current = e.nativeEvent.layout.height; }}
          style={{ overflow: 'hidden', minHeight: screenHeight - (insets.top + 92), borderRadius: 20, marginHorizontal: isMobile ? 16 : 32 }}
        >
          {/* dark overlay so text stays readable */}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.44)' }]}
          />
          {/* hero */}
          <View style={{flex: 1, width: '100%', justifyContent: 'flex-end', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: isMobile ? 16 : 32, paddingTop: isMobile ? 0: 0, paddingBottom: isMobile ? 28 : 40 }}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,}}>
             <View style={{ width: '100%', maxWidth: 500 }}>
              <Heading level={1} size={bp === 'desktop' ? 36 : isMobile ? 30 : 32} weight='bold' color={colors.white}>
                MAKE EVERY PROPERTY COUNT AND DETAIL MATTER
              </Heading>
              <T size={isMobile ? 14 : 15} color={colors.sidebarText} style={{ marginTop: 9, lineHeight: isMobile ? 23 : 23 }}>
                PropertyHub gives property managers one view of occupancy, leases and maintenance, and gives tenants a simple way to pay rent, report issues and follow every repair to sign-off.
              </T>
             </View>
              {showSlider ? (
               <View style={{ flex: 1, maxWidth: 280 }}>
                 <ImageSlider images={SLIDER_IMAGES} interval={4000} />
                 <Button title={me ? 'EXPLORE NOW' : 'Sign in'} variant="secondary" size="md" style={{borderRadius: 0}} onPress={signIn} />
               </View>
              ) : null}
            </View> 
          </View>
        </ImageBackground>

        {/* everything below the hero */}
        <View role="main" style={{ flex: 1 }}>
          {/* how it works */}
          <Section onLayout={(y) => measure('how', y)} label="How it works">
            <SectionIntro kicker="How it works" title="One app, three ways in" body="Everyone signs in at the same place and lands in the workspace for their role." />
          <View style={{ marginTop: 13 }}>
         {/* Audience switcher */}
         <View
          style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 10,
         }}
       >
        {AUDIENCES.map((a, i) => {
          const selected = i === active;
          return (
            <Pressable
              key={a.who}
              onPress={() => setActive(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? a.color : '#D4D4D4',
                backgroundColor: selected ? `${a.color}14` : colors.card,
              }}
            >
              <a.icon size={15} color={selected ? a.color : colors.neutral600} />
              <T
                size={13}
                weight={selected ? 'bold' : 'medium'}
                color={selected ? a.color : colors.neutral600}
              >
                {a.who}
              </T>
            </Pressable>
          );
        })}
      </View>
 
      {/* Notes */}
      {isMobile ? (
        <View style={{ marginTop: 28, gap: 20, alignItems: 'center' }}>
          {audience.steps.map((s, i) => (
            <NoteCard
              key={`${audience.who}-${s.title}`}
              index={i}
              step={s}
              color={audience.color}
              rotate={i % 2 === 0 ? '1.5deg' : '-1.5deg'}
              style={{ width: '80%' }}
            />
          ))}
        </View>
         ) : (
        <View
          style={{
            marginTop: 36,
            width: '100%',
            maxWidth: 900,
            alignSelf: 'center',
            height: DESKTOP_HEIGHT,
          }}
        >
          {/* dashed connector */}
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 1000 ${DESKTOP_HEIGHT}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0 }}
            pointerEvents="none"
          >
            <Path
              d="M 380 125 C 500 125, 520 270, 620 270 C 520 300, 500 430, 380 445"
              stroke={colors.border}
              strokeWidth={2}
              strokeDasharray="8 6"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
 
          {audience.steps.map((s, i) => {
            const { rotate, ...pos } = SLOTS[i];
            return (
              <NoteCard
                key={`${audience.who}-${s.title}`}
                index={i}
                step={s}
                color={audience.color}
                rotate={rotate}
                style={{ position: 'absolute', ...pos }}
              />
            );
           })}
          </View>
          )}
         </View>
          </Section>

          {/* features */}
          <Section tint={colors.card} onLayout={(y) => measure('features', y)} label="Features">
            <SectionIntro kicker="Features" title="What PropertyHub does" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
              {FEATURES.map((f) => (
                <View key={f.title} style={{ width: bp === 'desktop' ? '25%' : isMobile ? '100%' : '50%', padding: 8 }}>
                  <View style={{ flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18 }}>
                    <IconTile icon={f.icon} color={f.color} size={36} />
                    <Heading level={3} size={15} style={{ marginTop: 12 }}>{f.title}</Heading>
                    <T size={12} color={colors.textSoft} style={{ marginTop: 6, lineHeight: 20 }}>{f.body}</T>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          {/* FAQ */}
          <Section onLayout={(y) => measure('faq', y)} label="Frequently asked questions">
           <SectionIntro kicker="FAQ" title="Questions people ask" />
           <View style={{ width: '100%', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 40, backgroundColor: '#FAFAFA', padding: isMobile ? 16 : 32, borderRadius: 20}}>
            <View style={{ width: '100%', flex: isMobile ? undefined : 1, maxWidth: isMobile ? undefined : 580, gap: 10}}>
              {FAQ.map((f) => (
                  <FaqItem
                    key={f.id}
                    item={f}
                    expanded={open === f.id}
                    onToggle={() => setOpen((cur) => (cur === f.id ? null : f.id))}
               />
             ))}
             </View>
              <View
               style={{
                  width: isMobile ? '100%' : 470,
                  height: isMobile ? 280 : 370,
                  overflow: 'hidden',
               }}
               >
                <Image
                  source={{ uri: FAQ_SIDEIMAGE }}
                  accessibilityLabel="FAQ"
                  resizeMode="cover"
                  style={{
                    width: '100%',
                    height: '100%',
                   }}
                 />
               </View>
            </View>
            {/* <View style={{ width:'100%' ,maxWidth: 780, gap: 10,  alignSelf: 'center' }}>
              {FAQ.map((f, i) => {
                const expanded = open === i;
                return (
                  <View key={f.q} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: expanded ? colors.borderStrong : colors.border }}>
                    <Touch onPress={() => setOpen(expanded ? null : i)} accessibilityLabel={f.q} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
                      <View style={{ flex: 1 }} aria-expanded={expanded}>
                        <Heading level={3} size={15}>{f.q}</Heading>
                      </View>
                      <ChevronDown size={18} color={colors.textSoft} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    </Touch>
                    {expanded ? <T size={14} color={colors.textSoft} style={{ paddingHorizontal: 16, paddingBottom: 16, lineHeight: 21 }}>{f.a}</T> : null}
                  </View>
                );
              })}
            </View> */}
          </Section>

          {/* support */}
          {/* <Section tint={colors.card} onLayout={(y) => measure('support', y)} label="Support">
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 20, alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: isMobile ? undefined : 1, maxWidth: 640 }}>
                <T size={12} weight="bold" color={colors.accentDeep} upper style={{ marginBottom: 8 }}>Support</T>
                <Heading level={2} size={isMobile ? 22 : 26}>Need a hand?</Heading>
                <T size={15} color={colors.textSoft} style={{ marginTop: 10, lineHeight: 23 }}>
                  {SUPPORT_EMAIL
                    ? 'Questions about your lease, rent or a repair are best sent to your property management office. For problems with the app itself, email us.'
                    : 'Questions about your lease, rent, a repair or the app are best sent to your property management office. Signed-in tenants find the office number on their Home screen.'}
                </T>
              </View>
              {SUPPORT_EMAIL ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Mail size={16} color={colors.primary} />
                  <PageLink href={`mailto:${SUPPORT_EMAIL}`} size={15}>{SUPPORT_EMAIL}</PageLink>
                </View>
              ) : null}
            </View>
          </Section> */}
        </View>
        <Footer />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------- privacy and terms

interface LegalSection { title: string; body: string[] }

function LegalPage({ title, description, intro, sections }: { title: string; description: string; intro: string; sections: LegalSection[] }) {
  const { me } = useStore();
  const { back } = useRouter();
  const { isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Head>
        <title>{`${title} · PropertyHub`}</title>
        <meta name="description" content={description} />
      </Head>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View role="banner" style={{ backgroundColor: colors.sidebar, paddingTop: insets.top + 14, paddingBottom: 14, paddingHorizontal: 16 }}>
          <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Brand />
            <Button title="Back" variant="dark" size="sm" onPress={() => back(me ? homeRouteFor(me.role) : Platform.OS === 'web' ? 'welcome' : 'signIn')} />
          </View>
        </View>
        <View role="main" style={{ flex: 1, paddingHorizontal: 16, paddingVertical: isMobile ? 28 : 48 }}>
          <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
            <Heading level={1} size={isMobile ? 26 : 34}>{title}</Heading>
            <T size={13} color={colors.textSoft} style={{ marginTop: 6 }}>{`Last updated ${LEGAL_UPDATED}`}</T>
            <T size={15} color={colors.textSoft} style={{ marginTop: 18, lineHeight: 24 }}>{intro}</T>
            {sections.map((s) => (
              <View key={s.title} style={{ marginTop: 28 }}>
                <Heading level={2} size={18}>{s.title}</Heading>
                {s.body.map((p, i) => <T key={i} size={14.5} color={colors.textSoft} style={{ marginTop: 10, lineHeight: 23 }}>{p}</T>)}
              </View>
            ))}
            <View style={{ marginTop: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              <PageLink href={title === 'Privacy notice' ? '/terms' : '/privacy'}>{title === 'Privacy notice' ? 'Terms of use' : 'Privacy notice'}</PageLink>
              {SUPPORT_EMAIL ? <PageLink href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</PageLink> : null}
            </View>
          </View>
        </View>
        <Footer />
      </ScrollView>
    </View>
  );
}

const contactLine = SUPPORT_EMAIL
  ? `Contact your property management office, or email ${SUPPORT_EMAIL}.`
  : 'Contact your property management office.';

export function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy notice"
      description="What personal information PropertyHub holds, why, who can see it and what your choices are."
      intro="PropertyHub is used by property management organisations to run their buildings. The organisation that manages your home decides what information it collects through PropertyHub and is responsible for it. This notice explains what the app holds and who can see it."
      sections={[
        {
          title: 'What we hold',
          body: [
            'Account details: your name, email address and phone number, and your role.',
            'Tenant records: date of birth, previous address, employment, next of kin, your ID type and number, and copies of your ID, photo and signed agreements that you or your manager upload.',
            'Your tenancy: unit, lease terms, charges, payment records and receipts, maintenance requests with their photos and history, documents and messages from your manager.',
            'Payments: the amount, status and Paystack reference of each payment. Card and bank details are entered on Paystack\'s page and are never seen or stored by PropertyHub.',
            'Phones: if you allow notifications, a push token that lets us send them to your phone. The app keeps a copy of your own data on your phone so it opens without a signal; it is deleted when you sign out.',
            'Activity: a log of actions such as approvals, lease changes and status updates, with who made them and when.',
          ],
        },
        {
          title: 'Why we use it',
          body: [
            'To manage your tenancy: verifying who you are, keeping your lease and charges, collecting rent, carrying out repairs and sending reminders and notices. We do not sell your information or use it for advertising.',
          ],
        },
        {
          title: 'Who can see it',
          body: [
            'Access depends on role. Tenants see only their own home. Managers see the properties they manage. Caretakers see the jobs and properties they work on, but not ID documents, charges or payments. Accountants and administrators of your organisation see payment and account records.',
            'Files are kept in private storage and open only through links that expire after 10 minutes.',
          ],
        },
        {
          title: 'Services we rely on',
          body: [
            'Supabase hosts the database, sign-in and file storage. Paystack processes payments. Notifications reach your phone through Expo\'s push service and Apple or Google. Each receives only what it needs to do that job.',
          ],
        },
        {
          title: 'How long we keep it',
          body: [
            'Your records are kept while your tenancy is active and afterwards for as long as your management organisation needs them for its legal and accounting records.',
          ],
        },
        {
          title: 'Your choices',
          body: [
            'You can update your contact details from your profile, turn notifications off in your phone\'s settings, and ask your management organisation for a copy of your information or for corrections.',
            'You can delete your account yourself from Profile (tenants) or My account (staff). This removes your sign-in and your phone\'s notification tokens straight away. Your management organisation keeps the tenancy and work records it needs, as described above, and can delete them on request when it no longer needs them.',
            contactLine,
          ],
        },
      ]}
    />
  );
}

export function TermsScreen() {
  return (
    <LegalPage
      title="Terms of use"
      description="The rules for using PropertyHub as a property manager, staff member or tenant."
      intro="These terms cover your use of the PropertyHub app. Your lease or employment agreement with your property management organisation still governs your tenancy or your work; these terms do not change it."
      sections={[
        {
          title: 'Your account',
          body: [
            'Use your own account and keep your password private. Tell your property manager straight away if you think someone else has used it. You are responsible for what is done through your account.',
            'Tenant accounts are reviewed by the property manager before full access is given, and end when the tenancy ends.',
          ],
        },
        {
          title: 'Using PropertyHub',
          body: [
            'Give accurate information, including on your ID and in repair reports. Only upload documents and photos you are entitled to share.',
            'Do not try to reach information your role does not allow, interfere with the service, or use it to send messages that are false, abusive or unrelated to the property.',
          ],
        },
        {
          title: 'Payments',
          body: [
            'Payments are processed by Paystack under its own terms. A charge shows as paid only after Paystack confirms the payment to us. If you are charged twice or a payment does not appear, contact your property management office; refunds are handled by them.',
          ],
        },
        {
          title: 'Repairs and notices',
          body: [
            'Reporting an issue in the app does not replace emergency services. In an emergency such as fire, gas or flooding, call the emergency services and your management office first.',
            'Notices, reminders and status updates in the app are provided for convenience. Dates and amounts in your lease remain the reference.',
          ],
        },
        {
          title: 'Availability and changes',
          body: [
            'We work to keep PropertyHub available but cannot promise it will always be uninterrupted. We may update the app and these terms; when the terms change, the date at the top of this page changes too.',
          ],
        },
        {
          title: 'Questions',
          body: [contactLine],
        },
      ]}
    />
  );
}