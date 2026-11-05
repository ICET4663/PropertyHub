/**
 * Creating sign-ins for other people and sharing them. Public sign-up is closed: a Super Admin (any role)
 * or a property manager (their own tenants) creates the account with a generated temporary password,
 * then sends the email and password to the person by WhatsApp or email.
 */
import React, { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { Copy, KeyRound, Mail, MessageCircle, RefreshCw, Share2 } from 'lucide-react-native';
import { colors } from '../theme';
import { useStore, type CreateUserResult } from '../store/AppContext';
import type { Tenant } from '../types';
import { Button, Dialog, Input, KV, Notice, Row, T, useToast } from './ui';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?';

function randomInt(max: number): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] % max;
  return Math.floor(Math.random() * max);
}
const pick = (set: string) => set[randomInt(set.length)];

/** A temporary password that is easy to read out or type: e.g. "Kp7m-Rt4x!9". Always has upper, lower, digit and symbol. */
export function generatePassword(): string {
  const chunk = () => pick(UPPER) + pick(LOWER) + pick(DIGITS) + pick(LOWER);
  return `${chunk()}-${chunk()}${pick(SYMBOLS)}${pick(DIGITS)}`;
}

export function passwordOk(p: string) {
  return p.length >= 8 && /\d/.test(p) && /[A-Za-z]/.test(p) && /[^A-Za-z0-9]/.test(p);
}

/** Digits only, in international form for wa.me. Nigerian local numbers (080…) become 23480…. */
export function whatsappNumber(phone?: string): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = `234${d.slice(1)}`;
  return d;
}

function signInUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/signIn`;
  return '';
}

export interface Credentials { name: string; email: string; password: string; phone?: string; roleLabel: string; needsConfirmation?: boolean }

export function credentialsMessage(c: Credentials, org: string): string {
  const url = signInUrl();
  return [
    `Hello ${c.name.split(' ')[0]},`,
    '',
    `Your ${org} PropertyHub ${c.roleLabel.toLowerCase()} account is ready.`,
    '',
    `Username (email): ${c.email}`,
    `Temporary password: ${c.password}`,
    url ? `Sign in: ${url}` : 'Sign in with the PropertyHub app.',
    '',
    c.needsConfirmation ? 'First confirm your email using the code we sent you, then sign in.' : '',
    'Please change your password after you first sign in, and do not share it with anyone.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

/** Password field with a "Generate" button; starts with a generated password. */
export function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input label="Temporary password" required value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false}
      hint="Generated for you. You'll share it with the user next; ask them to change it after signing in."
      right={<Button title="Generate" icon={RefreshCw} size="sm" variant="ghost" onPress={() => onChange(generatePassword())} />} />
  );
}

/** Shown after an account is created: the credentials, plus WhatsApp, email and copy/share. */
export function ShareCredentialsDialog({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  const { state } = useStore();
  const toast = useToast();
  if (!creds) return null;
  const org = state.settings.orgName || 'PropertyHub';
  const text = credentialsMessage(creds, org);
  const wa = whatsappNumber(creds.phone);
  const open = (url: string, fallback: string) => { void Linking.openURL(url).catch(() => toast(fallback, 'danger')); };
  const whatsapp = () => open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, 'Couldn’t open WhatsApp.');
  const email = () => open(`mailto:${creds.email}?subject=${encodeURIComponent(`Your ${org} PropertyHub sign-in`)}&body=${encodeURIComponent(text)}`, 'Couldn’t open your email app.');
  const copy = async () => {
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard;
    if (Platform.OS === 'web' && clip?.writeText) {
      try { await clip.writeText(text); toast('Sign-in details copied', 'success'); } catch { toast('Couldn’t copy. Select the text and copy it instead.', 'danger'); }
      return;
    }
    await Share.share({ message: text }).catch(() => undefined);
  };
  return (
    <Dialog open onClose={onClose} title="Share sign-in details" subtitle={`${creds.name} · ${creds.roleLabel}`} width={500}
      footer={<Button title="Done" onPress={onClose} />}>
      <View style={{ gap: 14 }}>
        <Notice tone="success" icon={KeyRound}>Account created. Send these details to {creds.name.split(' ')[0]} now. The password isn’t shown again; you can send a reset email later from Users.</Notice>
        <View style={{ gap: 12, padding: 14, borderRadius: 10, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }}>
          <KV label="Username (email)" value={<T size={14} weight="semibold" selectable>{creds.email}</T>} />
          <KV label="Temporary password" value={<T size={15} weight="bold" mono selectable>{creds.password}</T>} />
        </View>
        {creds.needsConfirmation ? <Notice tone="warning">The account server isn’t set up yet, so {creds.name.split(' ')[0]} must confirm their email with the code we sent before this password works. Deploy the create-account function to skip this.</Notice> : null}
        <Row wrap gap={10}>
          <Button title="Send on WhatsApp" icon={MessageCircle} onPress={whatsapp} style={{ flexGrow: 1 }} />
          <Button title="Send by email" icon={Mail} variant="secondary" onPress={email} style={{ flexGrow: 1 }} />
          <Button title={Platform.OS === 'web' ? 'Copy' : 'Share'} icon={Platform.OS === 'web' ? Copy : Share2} variant="secondary" onPress={() => void copy()} style={{ flexGrow: 1 }} />
        </Row>
        {!wa ? <T size={12} color={colors.subtext}>No phone number on file: WhatsApp will ask you to choose a contact.</T> : null}
      </View>
    </Dialog>
  );
}

/** Lets a Super Admin or the tenant's property manager create the tenant's sign-in, then share it. */
export function CreateTenantLoginDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const { createUser } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [forId, setForId] = useState<string | null>(null);
  if (tenant && forId !== tenant.id) { setForId(tenant.id); setEmail(tenant.email); setPassword(generatePassword()); setError(''); setCreds(null); }
  if (creds) return <ShareCredentialsDialog creds={creds} onClose={() => { setCreds(null); onClose(); }} />;
  if (!tenant) return null;
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && passwordOk(password);
  const submit = async () => {
    setLoading(true); setError('');
    try {
      const r: CreateUserResult = await createUser({ name: tenant.name, email: email.trim(), phone: tenant.phone, password, role: 'tenant', access: 'Own tenancy', tenantId: tenant.id });
      if (!r.ok) setError(r.error);
      else setCreds({ name: tenant.name, email: email.trim().toLowerCase(), password, phone: tenant.whatsapp || tenant.phone, roleLabel: 'Tenant', needsConfirmation: r.needsConfirmation });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open onClose={() => { if (!loading) onClose(); }} title="Create tenant login" subtitle={`${tenant.name} · ${tenant.code}`} width={480}
      footer={<><Button title="Cancel" variant="secondary" disabled={loading} onPress={onClose} /><Button title="Create login" loading={loading} disabled={!valid || loading} onPress={() => void submit()} /></>}>
      <View style={{ gap: 14 }}>
        <Input label="Username (email)" required value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" hint="The tenant signs in with this email." />
        <PasswordField value={password} onChange={setPassword} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}
