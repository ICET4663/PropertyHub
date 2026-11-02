/**
 * Account security for every role: change password, sign out everywhere, and delete the account
 * (both app stores require in-app deletion). Used on the tenant Profile and the staff My account screens.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { KeyRound, LogOut, Trash2 } from 'lucide-react-native';
import { colors } from '../theme';
import { useStore } from '../store/AppContext';
import { Button, Card, CardHeader, Dialog, Input, Notice, Row, T, useConfirm, useToast } from './ui';

const strongEnough = (p: string) => p.length >= 8 && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updatePassword } = useStore();
  const toast = useToast();
  const [f, setF] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const close = () => { setF({ password: '', confirm: '' }); setError(''); onClose(); };
  const save = async () => {
    if (!strongEnough(f.password)) { setError('Use at least 8 characters with a number and a symbol.'); return; }
    if (f.password !== f.confirm) { setError('The two passwords don’t match.'); return; }
    setLoading(true);
    const r = await updatePassword(f.password); // signs out every session, this one included
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Password changed. Sign in with your new password.');
  };
  return (
    <Dialog open={open} onClose={close} title="Change password" subtitle="You'll be signed out on every device, then sign in again with the new password." width={440}
      footer={<><Button title="Cancel" variant="secondary" onPress={close} /><Button title="Change password" onPress={save} loading={loading} /></>}>
      <View style={{ gap: 14 }}>
        <Input label="New password" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secure placeholder="At least 8 characters" autoComplete="new-password" hint="At least 8 characters with a number and a symbol" />
        <Input label="Repeat new password" value={f.confirm} onChangeText={(v) => setF({ ...f, confirm: v })} secure autoComplete="new-password" onSubmitEditing={save} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deleteAccount, me } = useStore();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isTenant = me?.role === 'tenant';
  const close = () => { setPassword(''); setError(''); onClose(); };
  const remove = async () => {
    if (!password) { setError('Enter your password to confirm.'); return; }
    setLoading(true);
    const r = await deleteAccount(password);
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Your account has been deleted.');
  };
  return (
    <Dialog open={open} onClose={close} title="Delete your account?" width={460}
      footer={<><Button title="Cancel" variant="secondary" onPress={close} /><Button title="Delete my account" variant="danger" icon={Trash2} onPress={remove} loading={loading} /></>}>
      <View style={{ gap: 14 }}>
        <T size={13.5} color={colors.textSoft} style={{ lineHeight: 20 }}>
          {isTenant
            ? 'You will be signed out everywhere and won’t be able to sign in again with this email. Your property management office keeps your tenancy records (lease, charges, payments, documents and repair history) as their records require, and is told that you deleted your account.'
            : 'You will be signed out everywhere and won’t be able to sign in again with this email. The jobs, notes and records you worked on stay with the organisation, and your administrators are told so they can reassign your work.'}
        </T>
        <Notice tone="danger" title="This can't be undone">To use PropertyHub again you would need a new account.</Notice>
        <Input label="Your password" value={password} onChangeText={setPassword} secure autoComplete="current-password" onSubmitEditing={remove} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}

export function AccountSecurityCard() {
  const { signOutEverywhere } = useStore();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null);
  return (
    <>
      <Card>
        <CardHeader title="Security" />
        <View style={{ gap: 14 }}>
          <Row justify="space-between" gap={12}>
            <View style={{ flex: 1 }}><T size={13} weight="semibold">Password</T><T size={11.5} color={colors.subtext}>Changing it signs you out on every device.</T></View>
            <Button title="Change password" icon={KeyRound} size="sm" variant="secondary" onPress={() => setDialog('password')} />
          </Row>
          <Row justify="space-between" gap={12}>
            <View style={{ flex: 1 }}><T size={13} weight="semibold">Sign out of all devices</T><T size={11.5} color={colors.subtext}>Ends every session, on phones and browsers.</T></View>
            <Button title="Sign out everywhere" icon={LogOut} size="sm" variant="secondary"
              onPress={() => confirm.ask({ title: 'Sign out everywhere?', body: 'Every phone and browser signed in to this account will be signed out, this one included.', confirm: 'Sign out everywhere', onConfirm: () => void signOutEverywhere() })} />
          </Row>
        </View>
      </Card>
      <Card>
        <CardHeader title="Delete account" />
        <Row justify="space-between" gap={12} wrap>
          <T size={12.5} color={colors.subtext} style={{ flex: 1, minWidth: 200 }}>Permanently remove your sign-in. Records your organisation must keep are kept.</T>
          <Button title="Delete account" icon={Trash2} size="sm" variant="dangerGhost" onPress={() => setDialog('delete')} />
        </Row>
      </Card>
      <ChangePasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />
      <DeleteAccountDialog open={dialog === 'delete'} onClose={() => setDialog(null)} />
      {confirm.node}
    </>
  );
}
