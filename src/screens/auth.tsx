import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, CircleCheck, KeyRound, Lock, Mail, RefreshCw, ShieldCheck, Circle } from 'lucide-react-native';
import { colors, font, radius, useBreakpoint } from '../theme';
import { useStore, type CodePurpose } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { Badge, Button, Checkbox, Input, Link, Notice, T, Touch, useToast, IconTile } from '../components/ui';
import { Brand } from '../components/shell';
import { CityScape } from '../components/art';
import { maskEmail, passwordScore } from '../utils';

// ---------------------------------------------------------------- flow state shared across auth screens

interface Flow {
  email?: string; // where the current code was sent
  codeMode?: CodePurpose;
  signup?: { name: string; email: string; phone: string };
}
const FlowCtx = createContext<{ flow: Flow; setFlow: (f: Partial<Flow>) => void }>({ flow: {}, setFlow: () => {} });
export function AuthFlowProvider({ children }: { children: React.ReactNode }) {
  const [flow, set] = useState<Flow>({});
  return <FlowCtx.Provider value={{ flow, setFlow: (f) => set((s) => ({ ...s, ...f })) }}>{children}</FlowCtx.Provider>;
}
const useFlow = () => useContext(FlowCtx);

/** Digits in an emailed code. Must match Supabase → Authentication → Providers → Email → "Email OTP length". */
const CODE_LENGTH = 6;
const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

// ---------------------------------------------------------------- layout

function AuthLayout({ children, variant = 'staff', top }: { children: React.ReactNode; variant?: 'staff' | 'tenant'; top?: React.ReactNode }) {
  const { state } = useStore();
  const { navigate } = useRouter();
  const { bp, height } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const managed = state.units.length;
  // Portfolio counts are only readable once signed in (row level security), so signed-out visitors see none.
  const chips = managed ? [`${state.locations.length} locations`, `${state.blocks.length} blocks`, `${managed} units managed`] : [];
  const headline = variant === 'tenant' ? 'Your home, handled in a few taps.' : 'Manage every block, unit and tenant from one place.';
  const body = variant === 'tenant'
    ? 'Check your lease, report an issue and follow every repair from submission to sign-off.'
    : 'PropertyHub gives landlords and managers one trusted view of occupancy, leases and maintenance across every location.';

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
            <Link size={11.5} color={colors.subtext} onPress={() => navigate('privacy')}>Privacy</Link>
            <Link size={11.5} color={colors.subtext} onPress={() => navigate('terms')}>Terms</Link>
            {Platform.OS === 'web' ? <Link size={11.5} color={colors.subtext} onPress={() => navigate('welcome', { section: 'faq' })}>Help</Link> : null}
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
          <Chips small chips={chips} />
        </View>
        {form}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.card }}>
      <View style={{ width: bp === 'desktop' ? '44%' : '42%', maxWidth: 620, backgroundColor: colors.sidebar, paddingTop: 36 + insets.top, overflow: 'hidden', flex: 1, flexDirection: 'column', justifyContent: "space-between", }}>
        <View style={{ paddingHorizontal: 44 }}>
          <Brand size="lg" />
          <Chips chips={chips} />
        </View>
        <View style={{ paddingHorizontal: 44 }}>
            <T size={bp === 'desktop' ? 34 : 26} weight="bold" color={colors.white} style={{ marginTop: height > 700 ? 56 : 32, letterSpacing: -0.5, lineHeight: bp === 'desktop' ? 44 : 34, maxWidth: 440 }}>{headline}</T>
            <T size={14} weight= '' color={colors.sidebarText} style={{ marginTop: 19, maxWidth: 440, lineHeight: 22 }}>{body}</T>
        </View>
        {/* <View style={{ flex: 1 }} /> */}
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
      <T size={24} weight="bold" style={{ letterSpacing: -0.5 }} style={{ textAlign: 'center'}} center={center}>{title}</T>
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

// ---------------------------------------------------------------- Sign in

// Seeded by `npm run db:seed` (password demo1234). Their emails don't receive mail, so two-step can't be used with them.
const DEMO_ACCOUNTS = [
  { email: 'femi@adewaleproperties.ng', label: 'Femi Adewale', role: 'Super Admin' },
  { email: 'grace@adewaleproperties.ng', label: 'Grace Uche', role: 'Property Manager' },
  { email: 'chidinma.okafor@mail.com', label: 'Chidinma Okafor', role: 'Tenant' },
];

export function SignInScreen() {
  const { signIn, sendCode } = useStore();
  const { navigate } = useRouter();
  const { setFlow } = useFlow();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'password' | 'code' | null>(null);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Enter your email address and password.'); return; }
    setLoading('password');
    const r = await signIn(email, password);
    setLoading(null);
    if (!r.ok) { setError(r.error); return; }
    if (r.needsTwoStep) { setFlow({ email: email.trim(), codeMode: 'twoStep' }); navigate('twoStep'); }
    // otherwise the store has opened the app for this role
  };

  const otp = async () => {
    setError('');
    if (!isEmail(email)) { setError('Enter the email address on your account first.'); return; }
    setLoading('code');
    const r = await sendCode(email, 'signin');
    setLoading(null);
    if (!r.ok) { setError(r.error); return; }
    setFlow({ email: email.trim(), codeMode: 'signin' });
    navigate('verifyCode');
  };

  return (
    <AuthLayout top={<>{Platform.OS === 'web' ? <BackLink label="PropertyHub home" to="welcome" /> : <View />}<T size={12.5} color={colors.subtext}>No account? Ask your property manager.</T></>}>
      <Heading title="Welcome back" body="Sign in to manage your properties or your tenancy. We'll take you to the right workspace for your role." />
      <View style={{ gap: 16 }}>
        <Input label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
        <Input label="Password" value={password} onChangeText={setPassword} secure placeholder="Enter your password" labelRight={<Link size={12} onPress={() => navigate('forgot')}>Forgot password?</Link>} onSubmitEditing={submit} autoComplete="password" />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button title="Sign in" onPress={submit} loading={loading === 'password'} style={{ backgroundColor: '#3439CA'}} disabled={!!loading} size="lg" />
        {/* <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /><T size={12} color={colors.faint}>or</T><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>
        <Button title="Email me a sign-in code" icon={Mail} variant="secondary" size="lg" onPress={otp} loading={loading === 'code'} disabled={!!loading} /> */}
        {/* <Notice tone="info" icon={ShieldCheck}>Landlords, property managers and tenants all sign in here. Access is limited to what your role allows.</Notice> */}
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
  const { signUp } = useStore();
  const { navigate, route } = useRouter();
  const { setFlow } = useFlow();
  // A welcome message can link straight here with the code filled in: /signUp?invite=PALM-A4-7Q2
  const [f, setF] = useState({ name: '', email: '', phone: '', invite: (route.params.invite ?? '').toUpperCase(), password: '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const score = passwordScore(f.password);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.name.trim().split(' ').length < 2) e.name = 'Enter your first and last name.';
    if (!isEmail(f.email)) e.email = 'Enter a valid email address.';
    if (f.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid phone number.';
    if (f.password.length < 8 || !/\d/.test(f.password) || !/[^A-Za-z0-9]/.test(f.password)) e.password = 'Use at least 8 characters with a number and a symbol.';
    if (!agree) e.agree = 'Please accept the terms to continue.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    const r = await signUp(f);
    setLoading(false);
    if (!r.ok) { setErrors({ email: r.error }); return; }
    setFlow({ signup: { name: f.name, email: f.email.trim(), phone: f.phone }, email: f.email.trim(), codeMode: 'signup' });
    navigate(r.needsCode ? 'verifyCode' : 'accountReady');
  };

  const strength = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return (
    <AuthLayout variant="tenant" top={<><BackLink label="Back to sign in" /><T size={12} color={colors.subtext}>Step 1 of 2</T></>}>
      <Heading title="Create your tenant account" body="Use the email your landlord has on file so we can link you to your unit." />
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
        <Checkbox checked={agree} onChange={setAgree} label={<T size={12.5} color={colors.textSoft}>I agree to the PropertyHub <Link size={12.5} onPress={() => navigate('terms')}>Terms</Link> and <Link size={12.5} onPress={() => navigate('privacy')}>Privacy notice</Link></T>} />
        {errors.agree ? <T size={11.5} color={colors.danger}>{errors.agree}</T> : null}
        <Button title="Create account" onPress={submit} loading={loading} size="lg" />
        <T size={12} color={colors.subtext} center>Your account is reviewed by your property manager before full access is granted.</T>
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Enter an emailed code (sign-up, sign-in, password reset)

function useResendTimer(seconds = 60) {
  const [secs, setSecs] = useState(seconds);
  useEffect(() => { const t = setInterval(() => setSecs((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(t); }, []);
  return { secs, restart: () => setSecs(seconds) };
}

export function VerifyCodeScreen() {
  const { flow } = useFlow();
  const { verifyCode, sendCode } = useStore();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useResendTimer();
  const mode = flow.codeMode;
  const email = flow.email;
  if (!email || !mode || mode === 'twoStep') return <MissingFlow />;

  const verify = async () => {
    if (code.length < CODE_LENGTH) { setError(`Enter all ${CODE_LENGTH} digits.`); return; }
    setLoading(true);
    const r = await verifyCode(email, code, mode);
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    if (mode === 'signup') navigate('accountReady');
    else if (mode === 'reset') navigate('reset');
    // signin: the store has opened the app
  };
  const resend = async () => {
    const r = await sendCode(email, mode);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    timer.restart();
    toast('A new code is on its way.');
  };

  return (
    <AuthLayout variant={mode === 'signup' ? 'tenant' : 'staff'} top={<><BackLink label="Back" onPress={() => back('signIn')} />{mode === 'signup' ? <T size={12} color={colors.subtext}>Step 2 of 2</T> : <View />}</>}>
      <Heading icon={Mail} title={mode === 'signup' ? 'Verify your email' : `Enter the ${CODE_LENGTH}-digit code`} body={<T size={13.5} color={colors.subtext} style={{ marginTop: 6, lineHeight: 20 }}>We emailed a code to <T size={13.5} weight="semibold" color={colors.text}>{maskEmail(email)}</T>. Check your spam folder if it isn’t there in a minute.</T>} />
      <CodeInput length={CODE_LENGTH} value={code} onChange={(v) => { setCode(v); setError(''); }} error={!!error} />
      {error ? <T size={12} color={colors.danger} style={{ marginTop: 8 }}>{error}</T> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <T size={12.5} color={colors.subtext}>Didn’t get it? {timer.secs > 0 ? <T size={12.5} weight="semibold" color={colors.text}>Resend in 00:{String(timer.secs).padStart(2, '0')}</T> : <Link size={12.5} onPress={resend}>Resend code</Link>}</T>
      </View>
      <Button title="Verify and continue" size="lg" style={{ marginTop: 22 }} onPress={verify} loading={loading} />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Account created

export function AccountReadyScreen() {
  const { flow } = useFlow();
  const { state, enter } = useStore();
  const s = flow.signup;
  if (!s) return <MissingFlow />;
  // Not "entered" yet, but the data this tenant may see is already loaded, so their record is the one with this email.
  const t = state.tenants.find((x) => x.email.toLowerCase() === s.email.toLowerCase());
  const unit = state.units.find((u) => u.id === t?.unitId);
  const prop = state.properties.find((p) => p.id === unit?.propertyId);
  const block = state.blocks.find((b) => b.id === unit?.blockId);
  const approved = t?.status === 'active';
  return (
    <AuthLayout variant="tenant">
      <Heading center icon={Check} tone="success" title="Your account is ready" body={approved
        ? `Welcome to PropertyHub, ${s.name.split(' ')[0]}. We found your tenancy, so everything is ready for you.`
        : `Welcome to PropertyHub, ${s.name.split(' ')[0]}. Your property manager will confirm your tenancy details shortly — we'll notify you once it's approved.`} />
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
          <T size={12.5} color={colors.subtext}>Approval</T>{approved ? <Badge label="Approved" tone="success" dot /> : <Badge label="Awaiting manager" tone="warning" dot />}
        </View>
      </View>
      <Button title="Go to my dashboard" size="lg" style={{ marginTop: 20 }} onPress={enter} />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Forgot password

export function ForgotScreen() {
  const { sendCode } = useStore();
  const { navigate } = useRouter();
  const { setFlow } = useFlow();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const send = async () => {
    if (!isEmail(email)) { setError('Enter the email address on your account.'); return; }
    setLoading(true);
    const r = await sendCode(email, 'reset');
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    setFlow({ email: email.trim(), codeMode: 'reset' });
    navigate('verifyCode');
  };
  return (
    <AuthLayout top={<BackLink label="Back to sign in" />}>
      <Heading icon={Lock} title="Forgot your password?" body="Enter the email address on your account and we'll email you a code to set a new password." />
      <View style={{ gap: 16 }}>
        <Input label="Email address" value={email} onChangeText={(v) => { setEmail(v); setError(''); }} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" error={error} onSubmitEditing={send} />
        <Button title="Send reset code" size="lg" onPress={send} loading={loading} />
        <T size={12.5} color={colors.subtext} center>Remembered it? <Link size={12.5} onPress={() => navigate('signIn')}>Sign in</Link></T>
      </View>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Reset password

export function ResetScreen() {
  const { flow } = useFlow();
  const { updatePassword } = useStore();
  const { navigate } = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (flow.codeMode !== 'reset') return <MissingFlow />;
  const rules = [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: 'Upper and lower case letters' },
    { ok: /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw), label: 'A number and a symbol' },
    { ok: !!pw && pw === pw2, label: 'Both passwords match' },
  ];
  const mismatch = pw2.length > 0 && pw !== pw2;
  const submit = async () => {
    setTried(true);
    if (!rules.every((r) => r.ok)) return;
    setLoading(true);
    const r = await updatePassword(pw);
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
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
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button title="Reset password" size="lg" onPress={submit} loading={loading} />
      </View>
    </AuthLayout>
  );
}

export function ResetDoneScreen() {
  const { navigate } = useRouter();
  return (
    <AuthLayout>
      <Heading center icon={Lock} tone="success" title="Password updated" body="Your password was changed and you've been signed out on every device. Sign in again with your new password." />
      <Button title="Back to sign in" size="lg" onPress={() => navigate('signIn')} />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Two-step verification

export function TwoStepScreen() {
  const { flow, setFlow } = useFlow();
  const { verifyCode, sendCode } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useResendTimer();
  const email = flow.email;
  if (!email || flow.codeMode !== 'twoStep') return <MissingFlow />;
  const verify = async () => {
    if (code.length < CODE_LENGTH) { setError(`Enter the ${CODE_LENGTH}-digit code from your email.`); return; }
    setLoading(true);
    const r = await verifyCode(email, code, 'twoStep');
    setLoading(false);
    if (!r.ok) setError(r.error);
  };
  const resend = async () => {
    const r = await sendCode(email, 'twoStep');
    if (!r.ok) { toast(r.error, 'danger'); return; }
    timer.restart();
    toast('A new code is on its way.');
  };
  return (
    <AuthLayout top={<><BackLink label="Use a different account" onPress={() => { setFlow({ email: undefined, codeMode: undefined }); navigate('signIn'); }} /><Badge label="Two-step is on for this account" tone="success" size="sm" /></>}>
      <Heading icon={ShieldCheck} title="Two-step verification" body={<T size={13.5} color={colors.subtext} style={{ marginTop: 6, lineHeight: 20 }}>Your password was right. To finish signing in, enter the code we emailed to <T size={13.5} weight="semibold" color={colors.text}>{maskEmail(email)}</T>.</T>} />
      <CodeInput length={CODE_LENGTH} value={code} onChange={(v) => { setCode(v); setError(''); }} error={!!error} />
      {error ? <T size={12} color={colors.danger} style={{ marginTop: 8 }}>{error}</T> : null}
      <Button title="Verify and sign in" size="lg" style={{ marginTop: 18 }} onPress={verify} loading={loading} />
      <T size={12.5} color={colors.subtext} style={{ marginTop: 18 }}>Didn’t get it? {timer.secs > 0 ? <T size={12.5} weight="semibold" color={colors.text}>Resend in 00:{String(timer.secs).padStart(2, '0')}</T> : <Link size={12.5} onPress={resend}>Resend code</Link>}</T>
    </AuthLayout>
  );
}

function MissingFlow() {
  const { replace } = useRouter();
  useEffect(() => { replace('signIn'); }, [replace]);
  return null;
}

export { KeyRound, CircleCheck };

const Chips = ({ small, chips }: { small?: boolean; chips: string[] }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: small ? 12 : 22 }}>
    {chips.map((c) => (
      <View key={c} style={{ borderWidth: 1, borderColor: colors.sidebarBorder, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
        <T size={12} weight="semibold" color={colors.sidebarText}><T size={12} weight="bold" color={colors.accent}>{c.split(' ')[0]}</T> {c.split(' ').slice(1).join(' ')}</T>
      </View>
    ))}
  </View>
);
