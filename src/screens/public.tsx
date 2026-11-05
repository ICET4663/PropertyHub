/**
 * Public pages: the web landing page for signed-out visitors, and the privacy notice and terms of use.
 * They open whether or not someone is signed in. On phones the landing page is skipped (sign-in opens
 * instead), but privacy and terms stay reachable from the sign-in and sign-up screens.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View, type TextStyle } from 'react-native';
import { Link as RouterLink, Redirect, type Href } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import {
  Bell, Building2, ChevronDown, ClipboardCheck, CreditCard, FileText, KeyRound, LineChart, Mail, ShieldCheck, Smartphone, UserCheck, Wrench,
} from 'lucide-react-native';
import { colors, font, radius, shadow, useBreakpoint } from '../theme';
import { useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { homeRouteFor, Brand } from '../components/shell';
import { CityScape } from '../components/art';
import { Button, IconTile, T, Touch } from '../components/ui';

/** Support inbox shown on the public pages. Set EXPO_PUBLIC_SUPPORT_EMAIL; without it, visitors are pointed to their management office. */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';

const LEGAL_UPDATED = '28 October 2026';

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
    <View style={{ marginBottom: isMobile ? 24 : 36, maxWidth: 680 }}>
      <T size={12} weight="bold" color={colors.accentDeep} upper style={{ marginBottom: 8 }}>{kicker}</T>
      <Heading level={2} size={isMobile ? 24 : 32}>{title}</Heading>
      {body ? <T size={15} color={colors.textSoft} style={{ marginTop: 10, lineHeight: 23 }}>{body}</T> : null}
    </View>
  );
}

function Footer() {
  const insets = useSafeAreaInsets();
  return (
    <View role="contentinfo" style={{ backgroundColor: colors.sidebar, paddingVertical: 28, paddingHorizontal: 16, paddingBottom: 28 + insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <PageLink href="/privacy" color={colors.sidebarText}>Privacy</PageLink>
          <PageLink href="/terms" color={colors.sidebarText}>Terms</PageLink>
          <PageLink href="/signIn" color={colors.sidebarText}>Sign in</PageLink>
        </View>
        <T size={12.5} color={colors.sidebarText}>{`© ${new Date().getFullYear()} PropertyHub`}</T>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- landing page

const AUDIENCES: { icon: LucideIcon; who: string; steps: string[] }[] = [
  {
    icon: Building2,
    who: 'Property managers',
    steps: [
      'Set up locations, blocks and units, and see which are let, vacant or under repair.',
      'Add tenants, create their sign-in details and share them by WhatsApp or email.',
      'Create, renew and end leases; assign repairs to a caretaker or vendor.',
    ],
  },
  {
    icon: KeyRound,
    who: 'Tenants',
    steps: [
      'Sign in with the email and password your property manager shared with you by WhatsApp or email.',
      'Upload your ID, then see your lease, charges and documents in one place.',
      'Report an issue with photos, follow the repair live, and confirm when it is fixed.',
    ],
  },
  {
    icon: Wrench,
    who: 'Caretakers',
    steps: [
      'Open the app to today\'s jobs: what is in progress, due today and coming up.',
      'Call the tenant in one tap and read the access notes before you go.',
      'Start the job, add completion photos and mark it fixed for the tenant to confirm.',
    ],
  },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Building2, title: 'Portfolio and occupancy', body: 'Every location, block and unit with its status, rent and current tenant.' },
  { icon: UserCheck, title: 'Tenant onboarding', body: 'Manager-created sign-ins, ID uploads and a review step before a tenant gets full access.' },
  { icon: FileText, title: 'Leases and documents', body: 'Lease terms, renewals and move-outs, with agreements and papers stored privately.' },
  { icon: ClipboardCheck, title: 'Repairs from report to sign-off', body: 'Photos at every step, a full history, and the tenant confirms or disputes the result.' },
  { icon: CreditCard, title: 'Rent and charges', body: 'Tenants pay through Paystack. A charge shows as paid only after the payment is confirmed.' },
  { icon: Bell, title: 'Live updates and reminders', body: 'Status changes appear within seconds, with reminders before rent is due and leases end.' },
  { icon: LineChart, title: 'Reports and exports', body: 'Occupancy, rent and maintenance reports, and CSV exports for your accounts.' },
  { icon: ShieldCheck, title: 'Access by role', body: 'Managers, caretakers, accountants and tenants each see only what their role allows.' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I get an account?',
    a: 'Accounts are created for you. Your property manager or administrator sets up your sign-in and shares your email and a temporary password by WhatsApp or email. Change the password after you first sign in.',
  },
  {
    q: 'Who can see my ID and documents?',
    a: 'Files are kept in private storage and open through links that expire after 10 minutes. Only you, the managers of your property and your organisation\'s administrators and accountants can open your ID. Other tenants and caretakers cannot.',
  },
  {
    q: 'How do I pay rent?',
    a: 'Open My lease and choose Pay now next to a charge. Payment is handled by Paystack; PropertyHub never sees or stores your card details.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'The iPhone and Android apps are coming soon. Until then, PropertyHub works in your phone\'s web browser.',
  },
  {
    q: 'I forgot my password.',
    a: 'Choose Forgot password on the sign-in page and we will email you a code to set a new one. You can also sign in with an emailed code instead of a password.',
  },
];

type SectionKey = 'how' | 'features' | 'faq' | 'support';

export function LandingScreen() {
  const { me } = useStore();
  const { route, navigate } = useRouter();
  const { isMobile, bp } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [open, setOpen] = useState<number | null>(null);
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
      scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[jump.to] ?? 0) - 8), animated: true });
      setJump(null);
    }, jump.delay);
    return () => clearTimeout(t);
  }, [jump]);

  // Phones skip the landing page.
  if (Platform.OS !== 'web') return <Redirect href={me ? '/' : '/signIn'} />;

  const signIn = me ? () => navigate(homeRouteFor(me.role)) : () => navigate('signIn');
  const navItems: [SectionKey, string][] = [['how', 'How it works'], ['features', 'Features'], ['faq', 'FAQ']];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Head>
        <title>PropertyHub · Property management for managers, tenants and caretakers</title>
        <meta name="description" content="PropertyHub keeps units, tenants, leases, rent and repairs in one place. Managers run the portfolio, tenants pay rent and report issues, caretakers work their jobs." />
      </Head>
      <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1 }}>
        {/* header */}
        <View role="banner" style={{ backgroundColor: colors.sidebar, paddingTop: insets.top + 14, paddingBottom: 14, paddingHorizontal: isMobile ? 16 : 32 }}>
          <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Brand />
            <View role="navigation" aria-label="Page sections" style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 4 : 8 }}>
              {!isMobile ? navItems.map(([k, label]) => (
                <Touch key={k} onPress={() => jumpTo(k)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm }} hoverStyle={{ backgroundColor: colors.sidebarRaised }}>
                  <T size={13.5} weight="semibold" color={colors.sidebarText}>{label}</T>
                </Touch>
              )) : null}
              <Button title={me ? 'Open app' : 'Sign in'} variant="accent" size="sm" onPress={signIn} />
            </View>
          </View>
        </View>

        {/* hero */}
        <View role="main" style={{ flex: 1 }}>
          <View style={{ backgroundColor: colors.sidebar, overflow: 'hidden' }}>
            <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: isMobile ? 16 : 32, paddingTop: isMobile ? 28 : 64, paddingBottom: isMobile ? 28 : 40 }}>
              <View style={{ maxWidth: 680 }}>
                <Heading level={1} size={bp === 'desktop' ? 46 : isMobile ? 30 : 38} color={colors.white}>
                  Units, tenants, rent and repairs, <Text style={{ color: colors.accent }}>in one place.</Text>
                </Heading>
                <T size={isMobile ? 15 : 17} color={colors.sidebarText} style={{ marginTop: 16, lineHeight: isMobile ? 23 : 27 }}>
                  PropertyHub gives property managers one view of occupancy, leases and maintenance, and gives tenants a simple way to pay rent, report issues and follow every repair to sign-off.
                </T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
                  <Button title={me ? 'Open PropertyHub' : 'Sign in'} variant="accent" size="lg" onPress={signIn} style={isMobile ? { flexGrow: 1 } : undefined} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 18 }}>
                  <Smartphone size={16} color={colors.accent} style={{ marginTop: 1 }} />
                  <T size={13} color={colors.sidebarText} style={{ flex: 1 }}>{"iPhone and Android apps coming soon. PropertyHub already works in your phone's browser."}</T>
                </View>
              </View>
            </View>
            <View aria-hidden importantForAccessibility="no-hide-descendants">
              <CityScape height={isMobile ? 150 : 240} />
            </View>
          </View>

          {/* how it works */}
          <Section onLayout={(y) => measure('how', y)} label="How it works">
            <SectionIntro kicker="How it works" title="One app, three ways in" body="Everyone signs in at the same place and lands in the workspace for their role." />
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
              {AUDIENCES.map((a) => (
                <View key={a.who} style={[{ flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 22 }, shadow.card]}>
                  <IconTile icon={a.icon} tone="primary" size={40} />
                  <Heading level={3} size={18} style={{ marginTop: 14, marginBottom: 12 }}>{a.who}</Heading>
                  {a.steps.map((s, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 10, marginTop: i ? 10 : 0 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <T size={11.5} weight="bold" color={colors.primary}>{i + 1}</T>
                      </View>
                      <T size={14} color={colors.textSoft} style={{ flex: 1, lineHeight: 21 }}>{s}</T>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Section>

          {/* features */}
          <Section tint={colors.card} onLayout={(y) => measure('features', y)} label="Features">
            <SectionIntro kicker="Features" title="What PropertyHub does" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
              {FEATURES.map((f) => (
                <View key={f.title} style={{ width: bp === 'desktop' ? '25%' : isMobile ? '100%' : '50%', padding: 8 }}>
                  <View style={{ flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18 }}>
                    <IconTile icon={f.icon} tone="accent" size={36} />
                    <Heading level={3} size={15.5} style={{ marginTop: 12 }}>{f.title}</Heading>
                    <T size={13.5} color={colors.textSoft} style={{ marginTop: 6, lineHeight: 20 }}>{f.body}</T>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          {/* FAQ */}
          <Section onLayout={(y) => measure('faq', y)} label="Frequently asked questions">
            <SectionIntro kicker="FAQ" title="Questions people ask" />
            <View style={{ maxWidth: 780, gap: 10 }}>
              {FAQ.map((f, i) => {
                const expanded = open === i;
                return (
                  <View key={f.q} style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: expanded ? colors.borderStrong : colors.border }}>
                    <Touch onPress={() => setOpen(expanded ? null : i)} accessibilityLabel={f.q} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
                      <View style={{ flex: 1 }} aria-expanded={expanded}>
                        <Heading level={3} size={15}>{f.q}</Heading>
                      </View>
                      <ChevronDown size={18} color={colors.textSoft} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    </Touch>
                    {expanded ? <T size={14} color={colors.textSoft} style={{ paddingHorizontal: 16, paddingBottom: 16, lineHeight: 21 }}>{f.a}</T> : null}
                  </View>
                );
              })}
            </View>
          </Section>

          {/* support */}
          <Section tint={colors.card} onLayout={(y) => measure('support', y)} label="Support">
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
          </Section>
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
