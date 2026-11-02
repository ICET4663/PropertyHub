import React from 'react';
import { View } from 'react-native';
import { colors, useBreakpoint } from '../../theme';
import { useStore } from '../../store/AppContext';
import { homeRouteFor, Page, PageHeader, roleLabel } from '../../components/shell';
import { Avatar, Badge, Card, CardHeader, Divider, KV, T } from '../../components/ui';
import { AccountSecurityCard } from '../../components/account';

/** The signed-in staff member's own account (tenants use Profile). Settings stays the organisation's, for super admins. */
export function MyAccountScreen() {
  const { state, me } = useStore();
  const { bp } = useBreakpoint();
  if (!me) return null;
  const home = homeRouteFor(me.role);
  const properties = state.properties.filter((p) => me.propertyIds?.includes(p.id)).map((p) => p.name);
  return (
    <Page>
      <PageHeader crumbs={[{ label: home === 'jobs' ? 'My jobs' : 'Dashboard', to: home }, { label: 'My account' }]} title="My account" />
      <View style={{ flexDirection: bp === 'desktop' ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ width: bp === 'desktop' ? 280 : '100%', alignItems: 'center' }}>
          <Avatar name={me.name} size={72} tone={[colors.accentSoft, colors.accentDeep]} />
          <T size={16} weight="semibold" style={{ marginTop: 12 }} center>{me.name}</T>
          <Badge label={roleLabel(me.role)} tone="primary" style={{ alignSelf: 'center', marginTop: 8 }} />
          <Divider style={{ alignSelf: 'stretch', marginVertical: 16 }} />
          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <KV label="Email" value={me.email} />
            <KV label="Phone" value={me.phone || '—'} />
            <KV label="Access" value={me.access || '—'} />
          </View>
          <T size={11.5} color={colors.subtext} style={{ marginTop: 16 }} center>To change your name, phone or access, ask an administrator.</T>
        </Card>
        <View style={{ flex: 1, gap: 16, width: '100%' }}>
          {properties.length ? (
            <Card>
              <CardHeader title="Properties you work on" />
              <View style={{ gap: 6 }}>{properties.map((name) => <T key={name} size={13}>{name}</T>)}</View>
            </Card>
          ) : null}
          <AccountSecurityCard />
        </View>
      </View>
    </Page>
  );
}
