import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Avatar, Button, SectionHeader, ProgressBar } from '../../components/ui';
import { formatDate, formatNGN, leaseStatus, leaseDaysLeft, timeAgo, currentPeriod } from '../../utils';

export default function TenantDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state, renewLease, terminateLease, recordPayment, getOrCreateConversation } = useStore();
  const { tenantId } = route.params;

  const tenant = state.tenants.find((tn) => tn.id === tenantId);
  if (!tenant) return null;

  const unit = state.units.find((u) => u.id === tenant.unitId);
  const prop = state.properties.find((p) => p.id === tenant.propertyId);
  const lease = state.leases.find((l) => l.tenantId === tenantId && !l.terminated);
  const period = currentPeriod();
  const payment = state.payments.find((p) => p.tenantId === tenantId && p.period === period);
  const payments = state.payments.filter((p) => p.tenantId === tenantId).slice(0, 6);
  const requests = state.maintenance.filter((r) => r.tenantId === tenantId).slice(0, 5);

  const leaseSt = lease ? leaseStatus(lease) : null;
  const daysLeft = lease ? leaseDaysLeft(lease) : 0;

  const onRenew = () => {
    if (!lease) return;
    Alert.alert('Renew lease', `Extend the lease by 12 months for ${tenant.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Renew', onPress: () => renewLease(lease.id, 12) },
    ]);
  };

  const onTerminate = () => {
    if (!lease) return;
    Alert.alert('Terminate lease', 'This will mark the unit as vacant and the tenant as former. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Terminate', style: 'destructive', onPress: () => terminateLease(lease.id) },
    ]);
  };

  const onMessage = () => {
    const convId = getOrCreateConversation(tenantId);
    nav.navigate('MessageThread', { conversationId: convId });
  };

  const leaseColor = leaseSt === 'active' ? t.colors.success : leaseSt === 'expiring' ? t.colors.warning : t.colors.danger;
  const leaseBg = leaseSt === 'active' ? t.colors.successSoft : leaseSt === 'expiring' ? t.colors.warningSoft : t.colors.dangerSoft;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {/* Profile header */}
        <Card style={{ alignItems: 'center' }}>
          <Avatar name={tenant.name} color={tenant.avatarColor} size={72} />
          <Text style={{ fontSize: 19, fontWeight: '800', color: t.colors.text, marginTop: spacing.md }}>{tenant.name}</Text>
          <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2 }}>{tenant.occupation}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Badge label={tenant.status === 'active' ? 'Active tenant' : 'Former tenant'} color={tenant.status === 'active' ? t.colors.success : t.colors.subtext} bg={tenant.status === 'active' ? t.colors.successSoft : t.colors.inputBg} />
            {leaseSt && <Badge label={`Lease: ${leaseSt}`} color={leaseColor} bg={leaseBg} />}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' }}>
            <Button title="Message" icon="chatbubble-ellipses" variant="outline" small style={{ flex: 1 }} onPress={onMessage} />
            {lease && leaseSt !== 'terminated' && (
              <Button title="Renew lease" icon="refresh" small style={{ flex: 1 }} onPress={onRenew} />
            )}
          </View>
        </Card>

        {/* Unit & contact */}
        <Card style={{ marginTop: spacing.md }}>
          <InfoRow icon="home" label="Unit" value={`${unit?.unitNumber ?? 'N/A'} · ${unit?.type ?? ''}`} />
          <InfoRow icon="business" label="Property" value={prop?.name ?? 'N/A'} />
          <InfoRow icon="cash" label="Monthly rent" value={formatNGN(unit?.rent ?? 0)} />
          <InfoRow icon="call" label="Phone" value={tenant.phone} />
          <InfoRow icon="mail" label="Email" value={tenant.email} />
          <InfoRow icon="calendar" label="Joined" value={formatDate(tenant.joinedAt)} last />
        </Card>

        {/* Emergency contact */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Emergency contact</Text>
          <InfoRow icon="person" label="Name" value={tenant.emergencyContact.name} />
          <InfoRow icon="call" label="Phone" value={tenant.emergencyContact.phone} />
          <InfoRow icon="heart" label="Relationship" value={tenant.emergencyContact.relationship} last />
        </Card>

        {/* Lease */}
        {lease && (
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text }}>Current lease</Text>
              {leaseSt && <Badge label={leaseSt} color={leaseColor} bg={leaseBg} />}
            </View>
            <InfoRow icon="calendar" label="Start" value={formatDate(lease.startDate)} />
            <InfoRow icon="flag" label="End" value={formatDate(lease.endDate)} />
            <InfoRow icon="cash" label="Rent" value={`${formatNGN(lease.rent)}/mo`} />
            <InfoRow icon="shield" label="Deposit" value={formatNGN(lease.deposit)} last />
            {leaseSt !== 'terminated' && (
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar progress={Math.max(0, Math.min(1, daysLeft / 365))} color={leaseColor} height={6} />
                <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 5 }}>
                  {daysLeft >= 0 ? `${daysLeft} days remaining` : `Expired ${Math.abs(daysLeft)} days ago`}
                </Text>
              </View>
            )}
            {leaseSt !== 'terminated' && leaseSt !== 'active' && (
              <Button title="Renew lease (12 months)" icon="refresh" small style={{ marginTop: spacing.md }} onPress={() => {
                renewLease(lease.id, 12);
              }} />
            )}
          </Card>
        )}

        {/* Rent payment */}
        {payment && (
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext }}>Current period rent</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: t.colors.text, marginTop: 2 }}>{formatNGN(payment.amount)}</Text>
              </View>
              <Badge
                label={payment.status}
                color={payment.status === 'paid' ? t.colors.success : payment.status === 'overdue' ? t.colors.danger : t.colors.warning}
                bg={payment.status === 'paid' ? t.colors.successSoft : payment.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft}
              />
            </View>
            {payment.status !== 'paid' && (
              <Button title="Record payment" icon="checkmark-circle" small variant="success" style={{ marginTop: spacing.md }}
                onPress={() => recordPayment(payment.id)} />
            )}
          </Card>
        )}

        {/* Payment history */}
        <SectionHeader title="Payment history" />
        <Card style={{ paddingVertical: spacing.sm }}>
          {payments.length === 0 && <Text style={{ color: t.colors.subtext, fontSize: 13 }}>No payments yet.</Text>}
          {payments.map((p, i) => (
            <View key={p.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text }}>{p.period}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext }}>{p.method ?? '—'}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text }}>{formatNGN(p.amount)}</Text>
              <Badge
                label={p.status}
                color={p.status === 'paid' ? t.colors.success : p.status === 'overdue' ? t.colors.danger : t.colors.warning}
                bg={p.status === 'paid' ? t.colors.successSoft : p.status === 'overdue' ? t.colors.dangerSoft : t.colors.warningSoft}
              />
            </View>
          ))}
        </Card>

        {/* Maintenance history */}
        <SectionHeader title="Maintenance requests" />
        <Card style={{ paddingVertical: spacing.sm }}>
          {requests.length === 0 && <Text style={{ color: t.colors.subtext, fontSize: 13 }}>No requests filed.</Text>}
          {requests.map((r, i) => (
            <View key={r.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text }}>{r.title}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext }}>{r.category} · {timeAgo(r.createdAt)}</Text>
              </View>
              <Badge
                label={r.status === 'in_progress' ? 'In progress' : r.status}
                color={r.status === 'resolved' ? t.colors.success : r.status === 'in_progress' ? t.colors.info : t.colors.warning}
                bg={r.status === 'resolved' ? t.colors.successSoft : r.status === 'in_progress' ? t.colors.infoSoft : t.colors.warningSoft}
              />
            </View>
          ))}
        </Card>

        {lease && leaseSt !== 'terminated' && (
          <Button title="Terminate lease" icon="close-circle" variant="danger" style={{ marginTop: spacing.lg }}
            onPress={() => terminateLease(lease.id)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, last }: { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}>
      <Ionicons name={icon} size={15} color={t.colors.subtext} style={{ marginTop: 1 }} />
      <Text style={{ fontSize: 13, color: t.colors.subtext, width: 92 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, flex: 1 }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, gap: spacing.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: spacing.sm },
});
