import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Badge, Button, Field, EmptyState } from '../../components/ui';
import { formatDateTime, timeAgo, formatNGN } from '../../utils';
import { MaintenanceStatus } from '../../types';

export default function MaintenanceDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { state, currentUser, updateMaintenanceStatus, addMaintenanceNote } = useStore();
  const { requestId } = route.params;
  const req = state.maintenance.find((r) => r.id === requestId);
  const [note, setNote] = useState('');
  const [costInput, setCostInput] = useState('');

  if (!req) return null;

  const unit = state.units.find((u) => u.id === req.unitId);
  const prop = state.properties.find((p) => p.id === req.propertyId);
  const tenant = state.tenants.find((tn) => tn.id === req.tenantId);
  const isAdmin = currentUser?.role !== 'tenant';

  const pColor = req.priority === 'urgent' ? t.colors.danger : req.priority === 'high' ? '#E8A33D' : req.priority === 'medium' ? t.colors.info : t.colors.subtext;
  const sColor = req.status === 'resolved' ? t.colors.success : req.status === 'in_progress' ? t.colors.info : t.colors.warning;
  const sBg = req.status === 'resolved' ? t.colors.successSoft : req.status === 'in_progress' ? t.colors.infoSoft : t.colors.warningSoft;

  const onAddNote = () => {
    if (!note.trim()) return;
    addMaintenanceNote(req.id, note.trim());
    setNote('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Header */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={[styles.catIcon, { backgroundColor: pColor + '1A' }]}>
              <Ionicons name="construct" size={16} color={pColor} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: pColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {req.category} · {req.priority} priority
            </Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: t.colors.text, letterSpacing: -0.3 }}>{req.title}</Text>
          <Text style={{ fontSize: 13, color: t.colors.subtext, lineHeight: 19, marginTop: spacing.sm }}>{req.description}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <Badge
              label={req.status === 'in_progress' ? 'In progress' : req.status}
              color={sColor} bg={sBg}
              icon={req.status === 'resolved' ? 'checkmark-circle' : req.status === 'in_progress' ? 'hammer' : 'alert-circle'}
            />
            {req.scheduledDate && <Badge label={`Scheduled: ${req.scheduledDate}`} color={t.colors.info} bg={t.colors.infoSoft} icon="calendar" />}
            {req.cost != null && <Badge label={`Cost: ${formatNGN(req.cost)}`} color={t.colors.primary} bg={t.colors.primarySoft} icon="cash" />}
          </View>
        </Card>

        {/* Details */}
        <Card style={{ marginTop: spacing.md }}>
          <DetailRow icon="home" label="Unit" value={`${unit?.unitNumber ?? 'N/A'} · ${unit?.type ?? ''}`} />
          <DetailRow icon="business" label="Property" value={prop?.name ?? 'N/A'} />
          <DetailRow icon="person" label="Tenant" value={tenant?.name ?? 'N/A'} />
          <DetailRow icon="call" label="Tenant phone" value={tenant?.phone ?? 'N/A'} />
          <DetailRow icon="time" label="Reported" value={formatDateTime(req.createdAt)} />
          <DetailRow icon="refresh" label="Last update" value={timeAgo(req.updatedAt)} last />
        </Card>

        {/* Notes timeline */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.md }}>Activity & notes</Text>
          {req.notes.length === 0 && <Text style={{ fontSize: 13, color: t.colors.subtext }}>No notes yet.</Text>}
          {req.notes.map((n, i) => (
            <View key={n.id} style={{ flexDirection: 'row', marginBottom: spacing.md }}>
              <View style={{ alignItems: 'center', width: 20 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.primary, marginTop: 4 }} />
                {i < req.notes.length - 1 && <View style={{ flex: 1, width: 1.5, backgroundColor: t.colors.border, marginTop: 3 }} />}
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.colors.text }}>{n.author}</Text>
                <Text style={{ fontSize: 13, color: t.colors.text, marginTop: 2, lineHeight: 18 }}>{n.text}</Text>
                <Text style={{ fontSize: 11, color: t.colors.subtext, marginTop: 3 }}>{formatDateTime(n.createdAt)}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Add note */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginBottom: spacing.sm }}>Add a note</Text>
          <View style={[styles.noteInput, { backgroundColor: t.colors.inputBg, borderColor: t.colors.border }]}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Spare parts ordered, ETA 2 days..."
              placeholderTextColor={t.colors.subtext}
              multiline
              style={{ flex: 1, fontSize: 14, color: t.colors.text, maxHeight: 90 }}
            />
          </View>
          <Button title="Post note" icon="send" small variant="outline" style={{ marginTop: spacing.sm, alignSelf: 'flex-end' }} onPress={onAddNote} />
        </Card>

        {/* Admin actions */}
        {isAdmin && req.status !== 'resolved' && (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginBottom: spacing.sm }}>Update status</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {req.status === 'open' && (
                <Button title="Start work" icon="hammer" small variant="primary" style={{ flex: 1 }}
                  onPress={() => updateMaintenanceStatus(req.id, 'in_progress', 'Work started. Technician on site.')} />
              )}
              <Button title="Mark resolved" icon="checkmark-circle" small variant="success" style={{ flex: 1 }}
                onPress={() => updateMaintenanceStatus(req.id, 'resolved', 'Issue resolved and verified.')} />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: spacing.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.colors.border }}>
      <Ionicons name={icon} size={15} color={t.colors.subtext} />
      <Text style={{ fontSize: 13, color: t.colors.subtext, width: 96 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.text, flex: 1 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  catIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  noteInput: {
    borderRadius: radius.md, borderWidth: 1, padding: spacing.md, minHeight: 60,
  },
});
