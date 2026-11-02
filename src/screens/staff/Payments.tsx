/**
 * Payments ledger for accountants, managers and super admins (stage 6).
 * Charges are what tenants owe or paid; online payments are Paystack attempts, which only the server
 * writes. "Needs checking" lists what an accountant should reconcile by hand.
 */
import React, { useMemo, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { View } from 'react-native';
import { CircleCheck, Download, Receipt, RefreshCw } from 'lucide-react-native';
import { colors } from '../../theme';
import { useLookup, useScope, useStore } from '../../store/AppContext';
import { useRouter } from '../../nav/router';
import { LiveTag, Page, PageHeader } from '../../components/shell';
import { Badge, Button, Card, EmptyState, Grid, Notice, Row, Segmented, T, Tabs, useToast } from '../../components/ui';
import { DataTable, Pagination, usePaged } from '../../components/data';
import { ChargeBadge, PaystackBadge, ReceiptDialog, chargeState, isOutstanding } from '../../components/payments';
import { downloadCSV } from '../../lib/export';
import type { Payment, PaystackTransaction } from '../../types';
import { fmtDate, fmtStamp, naira, parseDate } from '../../utils';

type Tab = 'charges' | 'online' | 'check';
type ChargeFilter = 'all' | 'outstanding' | 'paid';

/** Attempts still waiting this long after they started are worth asking Paystack about. */
const STUCK_MS = 60 * 60_000;

export function PaymentsScreen() {
  const { state, checkPayment } = useStore();
  const scope = useScope();
  const lookup = useLookup();
  const { navigate } = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('charges');
  const [filter, setFilter] = useState<ChargeFilter>('all');
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const now = useNow();

  const tenantIds = useMemo(() => new Set(scope.tenants.map((t) => t.id)), [scope.tenants]);
  const charges = useMemo(() => state.payments.filter((p) => tenantIds.has(p.tenantId)).sort((a, b) => (a.date < b.date ? 1 : -1)), [state.payments, tenantIds]);
  const attempts = useMemo(() => state.transactions.filter((x) => tenantIds.has(x.tenantId)), [state.transactions, tenantIds]);
  const byId = useMemo(() => new Map(state.payments.map((p) => [p.id, p])), [state.payments]);

  const year = new Date().getFullYear();
  const paidThisYear = charges.filter((p) => p.status === 'paid' && parseDate(p.date).getFullYear() === year);
  const online = paidThisYear.filter((p) => p.reference);
  const byHand = paidThisYear.filter((p) => !p.reference);
  const outstanding = charges.filter(isOutstanding);
  const sum = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0);

  // Reconciliation: money Paystack took that didn't pay a charge, successes the ledger missed, attempts stuck waiting.
  const issues = useMemo(() => {
    const list: { tx: PaystackTransaction; problem: string; action: string }[] = [];
    for (const tx of attempts) {
      const charge = byId.get(tx.paymentId);
      if (tx.status === 'success' && charge?.reference !== tx.reference) {
        list.push({ tx, problem: charge?.status === 'paid' ? 'Paid twice: the charge was already paid' : 'Paystack took the money but the charge isn’t marked as paid', action: charge?.status === 'paid' ? 'Refund in the Paystack dashboard, then record it' : 'Check with Paystack' });
      } else if (tx.status === 'pending' && now - new Date(tx.createdAt).getTime() > STUCK_MS) {
        list.push({ tx, problem: 'Still waiting for Paystack after an hour', action: 'Check with Paystack' });
      } else if (tx.status === 'failed' && tx.gatewayResponse?.startsWith('Amount or currency')) {
        list.push({ tx, problem: 'Paystack reported an amount that doesn’t match the charge', action: 'Compare with the Paystack dashboard' });
      }
    }
    return list;
  }, [attempts, byId, now]);

  const shownCharges = charges.filter((p) => filter === 'all' || (filter === 'paid' ? p.status === 'paid' : isOutstanding(p)));
  const chargePage = usePaged(shownCharges, 25, `${filter}`);
  const attemptPage = usePaged(attempts, 25, 'online');

  const check = async (reference: string) => {
    setChecking(reference);
    try {
      const status = await checkPayment(reference);
      toast(`Paystack says: ${status === 'success' ? 'paid' : status === 'pending' ? 'still waiting' : status}`, status === 'success' ? 'success' : 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    } finally {
      setChecking(null);
    }
  };

  const tenantCell = (tenantId: string) => {
    const t = lookup.tenant(tenantId);
    return (
      <View>
        <T size={13} weight="semibold" numberOfLines={1}>{t?.name ?? tenantId}</T>
        <T size={11.5} color={colors.subtext} numberOfLines={1}>{lookup.property(t?.propertyId)?.short ?? '—'}{t?.unitId ? ` · ${lookup.unit(t.unitId)?.code}` : ''}</T>
      </View>
    );
  };

  const exportCSV = () => {
    const rows = tab === 'online'
      ? attempts.map((x) => ({ Reference: x.reference, Tenant: lookup.tenant(x.tenantId)?.name, Charge: byId.get(x.paymentId)?.label, 'Amount (NGN)': x.amount, 'Paystack fee (NGN)': x.fees ?? '', Channel: x.channel ?? '', Status: x.status, Started: x.createdAt, 'Paid at': x.paidAt ?? '' }))
      : charges.map((p) => ({ Charge: p.id, Tenant: lookup.tenant(p.tenantId)?.name, Lease: p.leaseId, Label: p.label, 'Amount (NGN)': p.amount, Date: p.date, Method: p.method, Status: chargeState(p).label, 'Paystack reference': p.reference ?? '' }));
    const ok = downloadCSV(`payments-${tab === 'online' ? 'paystack' : 'charges'}-${new Date().toISOString().slice(0, 10)}`, rows);
    toast(ok ? 'Exported (opens in Excel)' : rows.length ? 'Export is available on the web app' : 'Nothing to export', ok ? 'success' : 'info');
  };

  const tile = (label: string, value: string, sub: string, subTone?: string) => (
    <Card pad={16}>
      <T size={12} color={colors.subtext}>{label}</T>
      <T size={24} weight="bold" style={{ marginTop: 6 }}>{value}</T>
      <T size={11.5} color={subTone ?? colors.subtext}>{sub}</T>
    </Card>
  );

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Dashboard', to: 'dashboard' }, { label: 'Payments' }]} title="Payments"
        subtitle="Rent, service charge and deposits. Online payments go through Paystack and settle into the organisation’s account."
        badge={<LiveTag />}
        actions={tab !== 'check' ? <Button title="Export CSV" icon={Download} variant="secondary" onPress={exportCSV} /> : undefined} />

      <Grid cols={{ mobile: 2, desktop: 4 }} gap={12}>
        {tile(`Paid online in ${year}`, naira(sum(online)), `${online.length} through Paystack`)}
        {tile(`Recorded by hand in ${year}`, naira(sum(byHand)), `${byHand.length} cash or bank payments`)}
        {tile('Outstanding', naira(sum(outstanding)), `${outstanding.length} charges`, outstanding.length ? colors.danger : undefined)}
        {tile('Needs checking', String(issues.length), issues.length ? 'See the Needs checking tab' : 'Everything matches', issues.length ? colors.danger : colors.success)}
      </Grid>

      <Tabs value={tab} onChange={setTab} style={{ marginTop: 18, marginBottom: 16 }} tabs={[
        { value: 'charges', label: 'Charges', count: charges.length },
        { value: 'online', label: 'Paystack payments', count: attempts.length },
        { value: 'check', label: 'Needs checking', count: issues.length },
      ]} />

      {tab === 'charges' ? (
        <Card pad={0}>
          <View style={{ padding: 16 }}>
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: charges.length },
              { value: 'outstanding', label: 'Outstanding', count: outstanding.length },
              { value: 'paid', label: 'Paid', count: charges.length - outstanding.length },
            ]} />
          </View>
          <DataTable rows={chargePage.slice} keyOf={(p) => p.id}
            onRowPress={(p) => (p.reference ? setReceipt(p) : navigate('tenant', { id: p.tenantId }))}
            empty={<EmptyState icon={Receipt} title="No charges" />} columns={[
              { key: 't', title: 'Tenant', flex: 1.4, min: 170, render: (p) => tenantCell(p.tenantId) },
              { key: 'l', title: 'Charge', flex: 1.3, min: 160, render: (p) => <T size={13} color={colors.textSoft} numberOfLines={1}>{p.label}</T> },
              { key: 'a', title: 'Amount', min: 120, render: (p) => <T size={13} weight="semibold">{naira(p.amount)}</T> },
              { key: 'd', title: 'Date', min: 110, render: (p) => <T size={13} color={colors.textSoft}>{fmtDate(p.date)}</T> },
              { key: 'm', title: 'Method', flex: 1.1, min: 140, render: (p) => <T size={12.5} color={colors.textSoft} numberOfLines={1}>{p.method}</T> },
              { key: 's', title: 'Status', min: 120, render: (p) => <ChargeBadge p={p} /> },
            ]} />
          <Pagination page={chargePage.page} pages={chargePage.pages} onPage={chargePage.setPage} label={`${shownCharges.length} charges`} />
        </Card>
      ) : null}

      {tab === 'online' ? (
        <Card pad={0}>
          <DataTable rows={attemptPage.slice} keyOf={(x) => x.reference}
            onRowPress={(x) => { const p = byId.get(x.paymentId); if (x.status === 'success' && p?.reference === x.reference) setReceipt(p); }}
            empty={<EmptyState icon={Receipt} title="No online payments yet" body="Tenants pay from My lease in the app. Each attempt appears here, including ones they didn’t finish." />} columns={[
              { key: 'r', title: 'Reference', flex: 1.3, min: 180, render: (x) => <T mono size={12} color={colors.primary} numberOfLines={1}>{x.reference}</T> },
              { key: 't', title: 'Tenant', flex: 1.3, min: 170, render: (x) => tenantCell(x.tenantId) },
              { key: 'a', title: 'Amount', min: 120, render: (x) => <View><T size={13} weight="semibold">{naira(x.amount)}</T>{x.fees ? <T size={11} color={colors.subtext}>Fee {naira(x.fees)}</T> : null}</View> },
              { key: 'c', title: 'Channel', min: 100, render: (x) => <T size={12.5} color={colors.textSoft}>{x.channel ? x.channel.replace(/_/g, ' ') : '—'}</T> },
              { key: 'w', title: 'Started', min: 130, render: (x) => <T size={12.5} color={colors.textSoft}>{fmtStamp(x.createdAt)}</T> },
              { key: 's', title: 'Status', min: 150, render: (x) => <PaystackBadge s={x.status} /> },
              { key: 'x', title: '', min: 90, align: 'right', render: (x) => x.status === 'pending' || x.status === 'abandoned'
                ? <Button title="Check" icon={RefreshCw} size="sm" variant="secondary" loading={checking === x.reference} onPress={() => check(x.reference)} />
                : null },
            ]} />
          <Pagination page={attemptPage.page} pages={attemptPage.pages} onPage={attemptPage.setPage} label={`${attempts.length} attempts`} />
        </Card>
      ) : null}

      {tab === 'check' ? (
        <View style={{ gap: 14 }}>
          <Notice tone="info" title="Reconciling with Paystack">
            Match “Paid online” against the settlements in your Paystack dashboard. Refunds and vendor payouts aren’t made from this app yet: make them in Paystack or by bank transfer and record them with the tenant. Caution deposits are held by the organisation, not in escrow.
          </Notice>
          {issues.length ? (
            <Card pad={0}>
              <DataTable rows={issues} keyOf={(i) => i.tx.reference} columns={[
                { key: 'r', title: 'Reference', flex: 1.2, min: 180, render: (i) => <T mono size={12} numberOfLines={1}>{i.tx.reference}</T> },
                { key: 't', title: 'Tenant', flex: 1.2, min: 160, render: (i) => tenantCell(i.tx.tenantId) },
                { key: 'a', title: 'Amount', min: 110, render: (i) => <T size={13} weight="semibold">{naira(i.tx.amount)}</T> },
                { key: 'p', title: 'Problem', flex: 2, min: 220, render: (i) => <View style={{ gap: 4 }}><T size={12.5} weight="semibold">{i.problem}</T><T size={11.5} color={colors.subtext}>{i.action}</T></View> },
                { key: 'x', title: '', min: 90, align: 'right', render: (i) => i.action === 'Check with Paystack'
                  ? <Button title="Check" icon={RefreshCw} size="sm" variant="secondary" loading={checking === i.tx.reference} onPress={() => check(i.tx.reference)} />
                  : <Badge label="By hand" tone="warning" /> },
              ]} />
            </Card>
          ) : (
            <Card><EmptyState icon={CircleCheck} title="Nothing to check" body="Every successful Paystack payment matches exactly one paid charge, and no attempt has been waiting for more than an hour." /></Card>
          )}
          <Row><T size={11.5} color={colors.subtext}>Only the server marks a charge as paid online, after Paystack confirms it. Repeated confirmations change nothing.</T></Row>
        </View>
      ) : null}

      <ReceiptDialog payment={receipt} onClose={() => setReceipt(null)} />
    </Page>
  );
}
