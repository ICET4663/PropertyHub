import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, CircleCheck, KeyRound, Lock, Mail, Phone, RefreshCw, ShieldCheck, Smartphone, Circle, Info } from 'lucide-react-native';
import { colors, font, radius, useBreakpoint } from '../theme';
import { useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { Badge, Button, Checkbox, Input, Link, Notice, RadioCard, T, Touch, useToast, IconTile } from '../components/ui';
import { Brand } from '../components/shell';
import { CityScape } from '../components/art';
import { maskEmail, maskPhone, passwordScore } from '../utils';

// ---------------------------------------------------------------- flow state shared across auth screens

interface Flow {
  pendingUserId?: string; // passed password, awaiting 2FA
  signup?: { tenantId: string; userId: string; name: string; email: string; phone: string };
  resetUserId?: string;
  codeMode?: 'signup' | 'reset' | 'otp';
  otpUserId?: string;
}
const FlowCtx = createContext<{ flow: Flow; setFlow: (f: Partial<Flow>) => void }>({ flow: {}, setFlow: () => {} });
export function AuthFlowProvider({ children }: { children: React.ReactNode }) {
  const [flow, set] = useState<Flow>({});
  return <FlowCtx.Provider value={{ flow, setFlow: (f) => set((s) => ({ ...s, ...f })) }}>{children}</FlowCtx.Provider>;
}
const useFlow = () => useContext(FlowCtx);

export const DEMO_CODE = '481093';

// ---------------------------------------------------------------- layout

function AuthLayout({ children, variant = 'staff', top }: { children: React.ReactNode; variant?: 'staff' | 'tenant'; top?: React.ReactNode }) {
  const { state } = useStore();
  const { bp, height } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const managed = state.units.length;
  const chips = [`${state.locations.length} locations`, `${state.blocks.length} blocks`, `${managed} units managed`];
  const headline = variant === 'tenant' ? 'Your home, handled in a few taps.' : 'Every block, unit and tenant — visible at a glance.';
  const body = variant === 'tenant'
    ? 'Check your lease, report an issue and follow every repair from submission to sign-off.'
    : 'PropertyHub gives landlords and managers one trusted view of occupancy, leases and maintenance across every location.';
  const Chips = ({ small }: { small?: boolean }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: small ? 12 : 22 }}>
      {chips.map((c) => (
        <View key={c} style={{ borderWidth: 1, borderColor: colors.sidebarBorder, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
          <T size={12} weight="semibold" color={colors.sidebarText}><T size={12} weight="bold" color={colors.accent}>{c.split(' ')[0]}</T> {c.split(' ').slice(1).join(' ')}</T>
        </View>
      ))}
    </View>
  );
  const form = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.card }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: bp === 'mobile' ? 20 : 40, paddingTop: 18, paddingBottom: 18 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 }}>{top}</View>
        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 28 }}>
          <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>{children}</View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <T size={11.5} color={colors.faint}>{`© ${new Date().getFullYear()} PropertyHub`}</T>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {['Privacy', 'Terms', 'Help centre'].map((l) => <T key={l} size={11.5} color={colors.subtext}>{l}</T>)}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
  if (bp === 'mobile') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.card }}>
        <View style={{ backgroundColor: colors.sidebar, paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 18 }}>
          <Brand />
          <T size={19} weight="bold" color={colors.white} style={{ marginTop: 16, letterSpacing: -0.3 }}>{headline}</T>
          <Chips small />
        </View>
        {form}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.card }}>
      <View style={{ width: bp === 'desktop' ? '44%' : '42%', maxWidth: 620, backgroundColor: colors.sidebar, paddingTop: 36 + insets.top, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 44 }}>
          <Brand size="lg" />
          <T size={bp === 'desktop' ? 34 : 27} weight="bold" color={colors.white} style={{ marginTop: height > 700 ? 56 : 32, letterSpacing: -0.8, lineHeight: bp === 'desktop' ? 42 : 34 }}>{headline}</T>
          <T size={14.5} color={colors.sidebarText} style={{ marginTop: 16, maxWidth: 440, lineHeight: 22 }}>{body}</T>
          <Chips />
        </View>
        <View style={{ flex: 1 }} />
        <CityScape height={Math.min(340, height * 0.42)} />
      </View>
      <View style={{ flex: 1 }}>{form}</View>
    </View>
  );
}

function BackLink({ label, to, onPress }: { label: string; to?: string; onPress?: () => void }) {
  const { navigate } = useRouter();
  return (
    <Touch onPress={onPress ?? (() => navigate(to ?? 'signIn'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ArrowLeft size={15} color={colors.textSoft} />
      <T size={12.5} weight="semibold" color={colors.textSoft}>{label}</T>
    </Touch>
  );
}

function Heading({ icon: Icon, title, body, tone = 'primary', center }: { icon?: any; title: string; body?: React.ReactNode; tone?: 'primary' | 'success'; center?: boolean }) {
  return (
    <View style={{ alignItems: center ? 'center' : 'flex-start', marginBottom: 24 }}>
      {Icon ? (
        <View style={{ marginBottom: 18 }}>
          {tone === 'success'
            ? <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={colors.white} strokeWidth={2.6} /></View></View>
            : <IconTile icon={Icon} tone="primary" size={40} />}
        </View>
      ) : null}
      <T size={24} weight="bold" style={{ letterSpacing: -0.5 }} center={center}>{title}</T>
      {body ? (typeof body === 'string' ? <T size={13.5} color={colors.subtext} style={{ marginTop: 6, lineHeight: 20 }} center={center}>{body}</T> : body) : null}
    </View>
  );
}

// ---------------------------------------------------------------- 6-digit code input

function CodeInput({ value, onChange, length = 6, error }: { value: string; onChange: (v: string) => void; length?: number; error?: boolean }) {
  const ref = useRef<TextInput>(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 10 }}>
      {Array.from({ length }).map((_, i) => {
        const ch = value[i];
        const active = focus && (i === value.length || (i === length - 1 && value.length === length));
        return (
          <View key={i} style={{ flex: 1, maxWidth: 54, height: 56, borderRadius: radius.md, borderWidth: active ? 2 : 1, borderColor: error ? colors.danger : active ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
            <T size={22} weight="semibold">{ch ?? ''}</T>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0, color: 'transparent', fontFamily: font.regular }, Platform.OS === 'web' ? ({ outlineStyle: 'none', caretColor: 'transparent' } as any) : null]}
      />
    </Pressable>
  );
}

function DemoHint({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 }}>
      <Info size={14} color={colors.accentDeep} />
      <T size={12} color={colors.accentDeep} style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

// ---------------------------------------------------------------- Sign in

const DEMO_ACCOUNTS = [
  { email: 'femi@adewaleproperties.ng', label: 'Femi Adewale', role: 'Super Admin · two-step on' },
  { email: 'grace@adewaleproperties.ng', label: 'Grace Uche', role: 'Property Manager' },
  { email: 'chidinma.okafor@mail.com', label: 'Chidinma Okafor', role: 'Tenant' },
];

export function SignInScreen() {
  const { checkCredentials, startSession, findAccount } = useStore();
  const { navigate } = useRouter();
  const { setFlow } = useFlow();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = () => {
    setError('');
    if (!email.trim() || !password) { setError('Enter your email or phone number and password.'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const r = checkCredentials(email, password);
      if (!r.ok) { setError(r.error); return; }
      if (r.needsTwoStep) { setFlow({ pendingUserId: r.userId }); navigate('twoStep'); return; }
      startSession(r.userId);
    }, 450);
  };

  const otp = () => {
    const u = findAccount(email);
    if (!u) { setError('Enter the email or phone number on your account first.'); return; }
    setFlow({ codeMode: 'otp', otpUserId: u.id });
    navigate('verifyCode');
  };

  return (
    <AuthLayout top={<><View /><T size={12.5} color={colors.subtext}>New tenant? <Link size={12.5} onPress={() => navigate('signUp')}>Create an account</Link></T></>}>
      <Heading title="Welcome back" body="Sign in to manage your properties or your tenancy. We'll take you to the right workspace for your role." />
      <View style={{ gap: 16 }}>
        <Input label="Email or phone number" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
        <Input label="Password" value={password} onChangeText={setPassword} secure placeholder="Enter your password" labelRight={<Link size={12} onPress={() => navigate('forgot')}>Forgot password?</Link>} onSubmitEditing={submit} autoComplete="password" />
        <Checkbox checked={keep} onChange={setKeep} label="Keep me signed in on this device" />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button title="Sign in" onPress={submit} loading={loading} size="lg" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /><T size={12} color={colors.faint}>or</T><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>
        <Button title="Sign in with a one-time code" icon={Smartphone} variant="secondary" size="lg" onPress={otp} />
        <Notice tone="info" icon={ShieldCheck}>Landlords, property managers and tenants all sign in here. Access is limited to what your role allows.</Notice>
      </View>
      <View style={{ marginTop: 22, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, padding: 12 }}>
        <T size={11} weight="bold" color={colors.faint} upper style={{ marginBottom: 6 }}>Demo accounts · password demo1234</T>
        {DEMO_ACCOUNTS.map((d) => (
          <Touch key={d.email} onPress={() => { setEmail(d.email); setPassword('demo1234'); setError(''); }} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 }} hoverStyle={{ backgroundColor: colors.cardAlt }}>
            <T size={12.5} weight="semibold">{d.label}</T>
            <T size={12} color={colors.subtext}>{d.role}</T>
          </Touch>
        ))}
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Tenant sign up

export function SignUpScreen() {
  const { registerTenant } = useStore();
  const { navigate } = useRouter();
  const { setFlow } = useFlow();
  const [f, setF] = useState({ name: '', email: '', phone: '', invite: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const score = passwordScore(f.password);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().split(' ').length < 2) e.name = 'Enter your first and last name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
    if (f.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number.';
    if (f.password.length < 8 || !/\d/.test(f.password) || !/[^A-Za-z0-9]/.test(f.password)) e.password = 'Use at least 8 characters with a number and a symbol.';
    if (!agree) e.agree = 'Please accept the terms to continue.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = registerTenant(f);
    if (!r.ok) { setErrors({ email: r.error }); return; }
    setFlow({ signup: { tenantId: r.tenantId, userId: r.userId, name: f.name, email: f.email, phone: f.phone }, codeMode: 'signup' });
    navigate('verify');
  };

  const strength = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return (
    <AuthLayout variant="tenant" top={<><BackLink label="Back to sign in" /><T size={12} color={colors.subtext}>Step 1 of 2</T></>}>
      <Heading title="Create your tenant account" body="Use the email or phone number your landlord has on file so we can link you to your unit." />
      <View style={{ gap: 14 }}>
        <Input label="Full name" value={f.name} onChangeText={set('name')} placeholder="e.g. Chidinma Okafor" error={errors.name} autoComplete="name" />
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Input fieldStyle={{ flex: 1, minWidth: 170 }} label="Email address" value={f.email} onChangeText={set('email')} placeholder="you@mail.com" autoCapitalize="none" keyboardType="email-address" error={errors.email} />
          <Input fieldStyle={{ flex: 1, minWidth: 150 }} label="Phone number" value={f.phone} onChangeText={set('phone')} placeholder="+234 803 000 0000" keyboardType="phone-pad" error={errors.phone} />
        </View>
        <Input label="Property invite code" optional value={f.invite} onChangeText={set('invite')} placeholder="e.g. PALM-A4-7Q2" autoCapitalize="characters" hint="Found in the welcome message from your property manager." />
        <View>
          <Input label="Create password" value={f.password} onChangeText={set('password')} secure placeholder="At least 8 characters" error={errors.password} />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < score ? (score <= 1 ? colors.danger : score === 2 ? colors.warning : colors.primary) : colors.neutralSoft }} />)}
            <T size={11.5} weight="semibold" color={score >= 3 ? colors.primary : colors.subtext} style={{ width: 58, textAlign: 'right' }}>{f.password ? strength : ''}</T>
          </View>
          <T size={11.5} color={colors.subtext} style={{ marginTop: 4 }}>At least 8 characters with a number and a symbol</T>
        </View>
        <Checkbox checked={agree} onChange={setAgree} label={<T size={12.5} color={colors.textSoft}>I agree to the PropertyHub <T size={12.5} weight="semibold" color={colors.primary}>Terms</T> and <T size={12.5} weight="semibold" color={colors.primary}>Privacy Policy</T></T>} />
        {errors.agree ? <T size={11.5} color={colors.danger}>{errors.agree}</T> : null}
        <Button title="Create account" onPress={submit} size="lg" />
        <T size={12} color={colors.subtext} center>Your account is reviewed by your property manager before full access is granted.</T>
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Verify contact details

export function VerifyScreen() {
  const { flow, setFlow } = useFlow();
  const { navigate } = useRouter();
  const s = flow.signup;
  if (!s) return <MissingFlow />;
  return (
    <AuthLayout variant="tenant" top={<><View /><T size={12} color={colors.subtext}>Step 2 of 2</T></>}>
      <Heading icon={Mail} title="Verify your contact details" body="We need to confirm both so you receive lease reminders and repair updates." />
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13 }}>
          <IconTile icon={Check} tone="success" size={30} />
          <View style={{ flex: 1 }}><T size={13} weight="semibold">Email address</T><T size={12} color={colors.subtext}>{s.email}</T></View>
          <Badge label="Verified" tone="success" dot />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, padding: 13 }}>
          <IconTile icon={Phone} tone="accent" size={30} />
          <View style={{ flex: 1 }}><T size={13} weight="semibold">Phone number</T><T size={12} color={colors.subtext}>{s.phone}</T></View>
          <Badge label="Pending" tone="warning" dot />
        </View>
        <Button title="Send code to my phone" size="lg" style={{ marginTop: 12 }} onPress={() => { setFlow({ codeMode: 'signup' }); navigate('verifyCode'); }} />
        <T size={12.5} color={colors.subtext} center style={{ marginTop: 6 }}>Wrong number? <Link size={12.5} onPress={() => navigate('signUp')}>Edit contact details</Link></T>
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Enter code

export function VerifyCodeScreen() {
  const { flow, setFlow } = useFlow();
  const { state, startSession } = useStore();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [secs, setSecs] = useState(42);
  useEffect(() => { const t = setInterval(() => setSecs((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(t); }, []);
  const mode = flow.codeMode ?? 'signup';
  const phone = mode === 'signup' ? flow.signup?.phone : state.users.find((u) => u.id === (mode === 'reset' ? flow.resetUserId : flow.otpUserId))?.phone;
  if (!phone) return <MissingFlow />;
  const verify = () => {
    if (code.length < 6) { setError('Enter all 6 digits.'); return; }
    if (code !== DEMO_CODE) { setError('That code isn’t right. Check the SMS and try again.'); return; }
    if (mode === 'signup') navigate('accountReady');
    else if (mode === 'reset') navigate('reset');
    else { startSession(flow.otpUserId!); setFlow({ otpUserId: undefined }); }
  };
  return (
    <AuthLayout variant={mode === 'signup' ? 'tenant' : 'staff'} top={<BackLink label="Back" onPress={() => back('signIn')} />}>
      <Heading icon={Smartphone} title="Enter the 6-digit code" body={<T size={13.5} color={colors.subtext} style={{ marginTop: 6, lineHeight: 20 }}>We sent a code by SMS to <T size={13.5} weight="semibold" color={colors.text}>{maskPhone(phone)}</T>. It expires in 10 minutes.</T>} />
      <CodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} error={!!error} />
      {error ? <T size={12} color={colors.danger} style={{ marginTop: 8 }}>{error}</T> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <T size={12.5} color={colors.subtext}>Didn't get it? {secs > 0 ? <T size={12.5} weight="semibold" color={colors.text}>Resend in 00:{String(secs).padStart(2, '0')}</T> : <Link size={12.5} onPress={() => { setSecs(42); toast('A new code is on its way.'); }}>Resend code</Link>}</T>
        <Link size={12.5} onPress={() => toast('We’ll call you shortly with your code.', 'info')}>Call me instead</Link>
      </View>
      <Button title="Verify and continue" size="lg" style={{ marginTop: 22 }} onPress={verify} />
      <DemoHint>Demo: use code {DEMO_CODE}</DemoHint>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Account created

export function AccountReadyScreen() {
  const { flow } = useFlow();
  const { state, startSession } = useStore();
  const s = flow.signup;
  if (!s) return <MissingFlow />;
  const t = state.tenants.find((x) => x.id === s.tenantId);
  const unit = state.units.find((u) => u.id === t?.unitId);
  const prop = state.properties.find((p) => p.id === unit?.propertyId);
  const block = state.blocks.find((b) => b.id === unit?.blockId);
  return (
    <AuthLayout variant="tenant">
      <Heading center icon={Check} tone="success" title="Your account is ready" body={`Welcome to PropertyHub, ${s.name.split(' ')[0]}. Your property manager will confirm your tenancy details shortly — we'll notify you once it's approved.`} />
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, gap: 11 }}>
        {[
          ['Linked unit', unit && prop ? `${prop.short} · ${block?.name} · Flat ${unit.code}` : 'Not linked yet'],
          ['Tenant ID', t?.code ?? '—'],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <T size={12.5} color={colors.subtext}>{k}</T><T size={12.5} weight="semibold">{v}</T>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={12.5} color={colors.subtext}>Approval</T><Badge label="Awaiting manager" tone="warning" dot />
        </View>
      </View>
      <Button title="Go to my dashboard" size="lg" style={{ marginTop: 20 }} onPress={() => startSession(s.userId)} />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Forgot password

export function ForgotScreen() {
  const { findAccount } = useStore();
  const { navigate } = useRouter();
  const { setFlow } = useFlow();
  const [q, setQ] = useState('');
  const [via, setVia] = useState<'email' | 'sms'>('email');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const user = q.trim().length > 3 ? findAccount(q) : null;
  const send = () => {
    if (!user) { setError('We couldn’t find an account with that email or phone number.'); return; }
    setFlow({ resetUserId: user.id, codeMode: 'reset' });
    if (via === 'sms') navigate('verifyCode');
    else setSent(true);
  };
  if (sent && user) {
    return (
      <AuthLayout top={<BackLink label="Back to sign in" />}>
        <Heading icon={Mail} title="Check your email" body={<T size={13.5} color={colors.subtext} style={{ marginTop: 6, lineHeight: 20 }}>We sent a secure reset link to <T size={13.5} weight="semibold" color={colors.text}>{maskEmail(user.email)}</T>. The link expires in 30 minutes.</T>} />
        <Button title="Open reset link" size="lg" onPress={() => navigate('reset')} />
        <Button title="Send it again" variant="ghost" style={{ marginTop: 8 }} onPress={() => setSent(false)} />
        <DemoHint>Demo: the reset link opens right here in the app.</DemoHint>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout top={<BackLink label="Back to sign in" />}>
      <Heading icon={Lock} title="Forgot your password?" body="Enter the email or phone number linked to your account and we'll send you a secure reset link or code." />
      <View style={{ gap: 16 }}>
        <Input label="Email or phone number" value={q} onChangeText={(v) => { setQ(v); setError(''); }} placeholder="you@example.com" autoCapitalize="none" error={error} />
        <View style={{ gap: 8 }}>
          <T size={12.5} weight="semibold" color={colors.textSoft}>Send reset via</T>
          <RadioCard selected={via === 'email'} onPress={() => setVia('email')} title="Email link" sub={user ? maskEmail(user.email) : 'To the email on your account'} />
          <RadioCard selected={via === 'sms'} onPress={() => setVia('sms')} title="SMS code" sub={user ? maskPhone(user.phone) : 'To the phone on your account'} />
        </View>
        <Button title={via === 'email' ? 'Send reset link' : 'Send reset code'} size="lg" onPress={send} />
        <T size={12.5} color={colors.subtext} center>Remembered it? <Link size={12.5} onPress={() => navigate('signIn')}>Sign in</Link></T>
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Reset password

export function ResetScreen() {
  const { flow } = useFlow();
  const { resetPassword } = useStore();
  const { navigate } = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  if (!flow.resetUserId) return <MissingFlow />;
  const rules = [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper and lower case letters' },
    { ok: /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw), label: 'A number and a symbol' },
    { ok: !!pw && pw === pw2, label: 'Both passwords match' },
  ];
  const mismatch = pw2.length > 0 && pw !== pw2;
  const submit = () => {
    setTried(true);
    if (!rules.every((r) => r.ok)) return;
    resetPassword(flow.resetUserId!, pw);
    navigate('resetDone');
  };
  return (
    <AuthLayout top={<BackLink label="Back to sign in" />}>
      <Heading icon={RefreshCw} title="Set a new password" body="Choose a password you haven't used before on PropertyHub." />
      <View style={{ gap: 14 }}>
        <Input label="New password" value={pw} onChangeText={setPw} secure placeholder="New password" />
        <Input label="Confirm new password" value={pw2} onChangeText={setPw2} secure placeholder="Repeat password" error={mismatch || (tried && !pw2) ? 'Passwords don’t match yet.' : undefined} />
        <View style={{ backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 12, gap: 7 }}>
          {rules.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.ok ? <Check size={14} color={colors.primary} strokeWidth={2.6} /> : <Circle size={13} color={colors.faint} />}
              <T size={12.5} color={r.ok ? colors.primary : colors.subtext}>{r.label}</T>
            </View>
          ))}
        </View>
        <Button title="Reset password" size="lg" onPress={submit} />
      </View>
    </AuthLayout>
  );
}

export function ResetDoneScreen() {
  const { navigate } = useRouter();
  const toast = useToast();
  return (
    <AuthLayout>
      <Heading center icon={Lock} tone="success" title="Password updated" body="Your password was changed successfully. For your security, you've been signed out of all other devices." />
      <Button title="Back to sign in" size="lg" onPress={() => navigate('signIn')} />
      <T size={12.5} color={colors.subtext} center style={{ marginTop: 14 }}>Didn't make this change? <Link size={12.5} onPress={() => toast('Support has been notified and will contact you.', 'info')}>Contact support</Link></T>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Two-step verification

export function TwoStepScreen() {
  const { flow, setFlow } = useFlow();
  const { startSession } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [error, setError] = useState('');
  if (!flow.pendingUserId) return <MissingFlow />;
  const verify = () => {
    if (code.length < 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    if (code !== DEMO_CODE) { setError('That code isn’t right. Codes refresh every 30 seconds.'); return; }
    const id = flow.pendingUserId!;
    setFlow({ pendingUserId: undefined });
    startSession(id);
  };
  return (
    <AuthLayout top={<><BackLink label="Use a different account" onPress={() => { setFlow({ pendingUserId: undefined }); navigate('signIn'); }} /><Badge label="Optional · recommended for admins" tone="success" size="sm" /></>}>
      <Heading icon={ShieldCheck} title="Two-step verification" body="Your account can see every tenant record. Confirm it's you with the code from your authenticator app." />
      <CodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} error={!!error} />
      {error ? <T size={12} color={colors.danger} style={{ marginTop: 8 }}>{error}</T> : null}
      <Checkbox checked={trust} onChange={setTrust} label="Trust this device for 30 days" style={{ marginTop: 16 }} />
      <Button title="Verify and sign in" size="lg" style={{ marginTop: 18 }} onPress={verify} />
      <T size={12.5} color={colors.subtext} style={{ marginTop: 18 }}>Can't use your authenticator?</T>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
        <Link size={12.5} onPress={() => toast('We sent a code by SMS to your phone.')}>Send code by SMS</Link>
        <Link size={12.5} onPress={() => toast('Enter one of your saved backup codes instead.', 'info')}>Use a backup code</Link>
      </View>
      <DemoHint>Demo: use code {DEMO_CODE}</DemoHint>
    </AuthLayout>
  );
}

function MissingFlow() {
  const { replace } = useRouter();
  useEffect(() => { replace('signIn'); }, [replace]);
  return null;
}

export { KeyRound, CircleCheck };
