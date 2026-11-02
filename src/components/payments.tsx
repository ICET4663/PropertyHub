/** Charges, Paystack attempts and receipts: shared by the tenant's lease screen and the staff ledger. */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { CreditCard, Printer, Receipt } from 'lucide-react-native';
import { colors } from '../theme';
import { useLookup, useStore } from '../store/AppContext';
import { useRouter } from '../nav/router';
import { useNow } from '../hooks/useNow';
import { printPage } from '../lib/export';
import { Badge, Button, Card, CardHeader, Dialog, KV, Grid, Notice, Row, T, type Tone } from './ui';
import type { Payment, PaystackStatus } from '../types';
import { daysUntil, fmtDate, fmtStamp, naira } from '../utils';

export const PAYSTACK_STATUS: Record<PaystackStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting for Paystack', tone: 'info' },
  success: { label: 'Successful', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  abandoned: { label: 'Not completed', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'purple' },
};

export const PaystackBadge = ({ s }: { s: PaystackStatus }) => <Badge label={PAYSTACK_STATUS[s].label} tone={PAYSTACK_STATUS[s].tone} dot />;

/** Paid online, paid (recorded by staff), due or overdue. A pending charge past its date counts as overdue. */
export function chargeState(p: Payment): { label: string; tone: Tone } {
  if (p.status === 'paid') return p.reference ? { label: 'Paid online', tone: 'success' } : { label: 'Paid', tone: 'success' };
  if (p.status === 'overdue' || daysUntil(p.date) < 0) return { label: 'Overdue', tone: 'danger' };
  return { label: 'Due', tone: 'warning' };
}

export const ChargeBadge = ({ p }: { p: Payment }) => { const c = chargeState(p); return <Badge label={c.label} tone={c.tone} dot />; };

export const isOutstanding = (p: Payment) => p.status === 'pending' || p.status === 'overdue';

/** A receipt for a charge paid through Paystack, built from the server's record. */
export function ReceiptDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { state } = useStore();
  const lookup = useLookup();
  if (!payment) return null;
  const tx = state.transactions.find((x) => x.reference === payment.reference);
  const tenant = lookup.tenant(payment.tenantId);
  const unit = lookup.unit(tenant?.unitId);
  const prop = lookup.property(tenant?.propertyId);
  return (
    <Dialog open onClose={onClose} title="Payment receipt" subtitle={state.settings.orgName || undefined}
      footer={Platform.OS === 'web' ? <Button title="Print" icon={Printer} variant="secondary" onPress={() => printPage()} /> : undefined}>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <T size={12} color={colors.subtext}>{payment.label}</T>
        <T size={28} weight="bold">{naira(payment.amount)}</T>
        <Badge label="Paid" tone="success" dot style={{ alignSelf: 'center', marginTop: 6 }} />
      </View>
      <Grid cols={{ mobile: 2 }} gap={14} style={{ marginTop: 14 }}>
        <KV label="Tenant" value={tenant?.name ?? '—'} />
        <KV label="Home" value={prop ? `${prop.short}${unit ? `, Flat ${unit.code}` : ''}` : '—'} />
        <KV label="Paid on" value={payment.paidAt ? fmtStamp(payment.paidAt) : fmtDate(payment.date)} />
        <KV label="Method" value={payment.method} />
        <KV label="Reference" value={<T mono size={12.5}>{payment.reference ?? '—'}</T>} />
        <KV label="Lease" value={payment.leaseId ?? '—'} />
      </Grid>
      <T size={11.5} color={colors.subtext} style={{ marginTop: 16 }}>
        {tx ? 'Confirmed by Paystack. ' : ''}Keep this reference if you contact the management office about this payment.
      </T>
    </Dialog>
  );
}

/** An error as a sentence, ending in a full stop. */
const sentence = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return /[.!?]$/.test(m) ? m : `${m}.`; };

const RESULT: Record<PaystackStatus, { tone: Tone; title: string; body: string }> = {
  success: { tone: 'success', title: 'Payment received', body: 'Paystack confirmed your payment. Your receipt is in your payment history.' },
  pending: { tone: 'info', title: 'Waiting for Paystack to confirm', body: 'This page updates as soon as Paystack confirms. Don’t pay again in the meantime.' },
  abandoned: { tone: 'warning', title: 'Payment not completed', body: 'You left checkout before paying. Nothing was charged.' },
  failed: { tone: 'danger', title: 'Payment failed', body: 'Paystack couldn’t take the payment. Nothing was charged. Try again or use another card.' },
  refunded: { tone: 'info', title: 'Payment refunded', body: 'This payment was refunded.' },
};

/**
 * The tenant's outstanding charges with a Pay button each, and the outcome of the last checkout.
 * Coming back from Paystack on the web opens /myLease?reference=..., which is checked here once.
 */
export function ChargesToPay({ style }: { style?: StyleProp<ViewStyle> }) {
  const { state, myTenant, payOnline, checkPayment } = useStore();
  const { route, replace } = useRouter();
  const [paying, setPaying] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: PaystackStatus; reference?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const returned = route.params.reference;
  const handled = useRef<string | null>(null);

  const check = async (reference: string) => {
    setChecking(true);
    setError(null);
    try {
      setResult({ status: await checkPayment(reference), reference });
    } catch (e) {
      setError(`Couldn’t check the payment. ${sentence(e)}`);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!returned || handled.current === returned) return;
    handled.current = returned;
    void check(returned);
    replace('myLease'); // a refresh shouldn't check again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

  // A receipt that lands after we asked (webhook, live update) replaces the "waiting" message.
  const tx = result?.reference ? state.transactions.find((x) => x.reference === result.reference) : undefined;
  const shown = tx && tx.status !== result?.status ? { ...result!, status: tx.status } : result;

  if (!myTenant) return null;
  const due = state.payments.filter((p) => p.tenantId === myTenant.id && isOutstanding(p)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!due.length && !shown && !error) return null;

  const pay = async (id: string) => {
    setPaying(id);
    setResult(null);
    setError(null);
    try {
      const outcome = await payOnline(id);
      if (outcome) setResult(outcome);
    } catch (e) {
      setError(`Couldn’t start the payment. ${sentence(e)} Nothing was charged.`);
    } finally {
      setPaying(null);
    }
  };

  return (
    <Card style={style}>
      <CardHeader title="To pay" subtitle={due.length ? 'Paid securely through Paystack' : undefined} />
      {error ? <Notice tone="danger" style={{ marginBottom: 14 }}>{error}</Notice> : null}
      {shown ? (
        <Notice tone={RESULT[shown.status].tone} title={RESULT[shown.status].title} style={{ marginBottom: due.length ? 14 : 0 }}
          action={shown.status === 'pending' && shown.reference ? <Button title="Check again" size="sm" variant="secondary" loading={checking} onPress={() => check(shown.reference!)} /> : undefined}>
          {RESULT[shown.status].body}
        </Notice>
      ) : checking ? <Notice tone="info" title="Checking your payment…" style={{ marginBottom: 14 }} /> : null}
      <View style={{ gap: 14 }}>
        {due.map((p) => {
          const waiting = state.transactions.some((x) => x.paymentId === p.id && x.status === 'pending' && now - new Date(x.createdAt).getTime() < 30 * 60_000);
          return (
            <View key={p.id} style={{ gap: 8 }}>
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1 }}>
                  <T size={13} weight="semibold">{p.label}</T>
                  <T size={11.5} color={colors.subtext}>Due {fmtDate(p.date)}</T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T size={14} weight="bold">{naira(p.amount)}</T>
                  <ChargeBadge p={p} />
                </View>
              </Row>
              <Button title={`Pay ${naira(p.amount)}`} icon={CreditCard} full loading={paying === p.id} disabled={!!paying && paying !== p.id} onPress={() => pay(p.id)} />
              {waiting ? <T size={11.5} color={colors.subtext}>You started a payment for this recently. If you completed it, wait for the confirmation before paying again.</T> : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** One line of payment history, with a receipt for charges paid online. */
export function PaymentLine({ p, onReceipt }: { p: Payment; onReceipt: (p: Payment) => void }) {
  return (
    <Row justify="space-between" align="flex-start">
      <View style={{ flex: 1 }}>
        <T size={13} weight="semibold">{p.label}</T>
        <T size={11.5} color={colors.subtext}>{fmtDate(p.date)} · {p.method}</T>
        {p.reference ? <Button title="Receipt" icon={Receipt} size="sm" variant="ghost" style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: 2 }} onPress={() => onReceipt(p)} /> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <T size={13} weight="bold" color={chargeState(p).tone === 'danger' ? colors.danger : colors.text}>{naira(p.amount)}</T>
        {p.status !== 'paid' ? <ChargeBadge p={p} /> : null}
      </View>
    </Row>
  );
}
