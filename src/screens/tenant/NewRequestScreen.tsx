import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore } from '../../store/AppContext';
import { Card, Button, Field, Chip } from '../../components/ui';
import { Priority } from '../../types';

const CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Structural', 'Appliance', 'Other'] as const;
const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#3B82F6' },
  { value: 'medium', label: 'Medium', color: '#D97706' },
  { value: 'high', label: 'High', color: '#E8A33D' },
  { value: 'urgent', label: 'Urgent', color: '#E5484D' },
];

export default function NewRequestScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, currentUser, addMaintenanceRequest } = useStore();

  const tenant = state.tenants.find((tn) => tn.id === currentUser?.tenantId);
  const unit = tenant ? state.units.find((u) => u.id === tenant.unitId) : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Plumbing');
  const [priority, setPriority] = useState<Priority>('medium');

  const canSubmit = title.trim().length > 3 && description.trim().length > 5;

  const onSubmit = () => {
    if (!tenant || !unit) return;
    addMaintenanceRequest({
      unitId: unit.id,
      tenantId: tenant.id,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
    });
    Alert.alert('Request submitted', 'Your maintenance request has been logged. The property team will be notified.', [
      { text: 'OK', onPress: () => nav.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: t.colors.text, letterSpacing: -0.4 }}>New maintenance request</Text>
        <Text style={{ fontSize: 13, color: t.colors.subtext, marginTop: 2, marginBottom: spacing.lg }}>
          {unit ? `${unit.unitNumber} · ${state.properties.find((p) => p.id === unit.propertyId)?.name}` : 'Your unit'}
        </Text>

        <Card>
          <Field label="Issue title" value={title} onChangeText={setTitle} placeholder="e.g. Kitchen tap leaking" />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in detail..."
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />

          <Text style={styles.label(t)}>CATEGORY</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>

          <Text style={styles.label(t)}>PRIORITY</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                onPress={() => setPriority(p.value)}
                style={[
                  styles.priChip,
                  {
                    backgroundColor: priority === p.value ? p.color : t.colors.cardAlt,
                    borderColor: priority === p.value ? p.color : t.colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: priority === p.value ? '#fff' : t.colors.subtext }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.noteBox, { backgroundColor: t.colors.infoSoft }]}>
            <Ionicons name="information-circle" size={16} color={t.colors.info} />
            <Text style={{ fontSize: 12, color: t.colors.info, flex: 1, lineHeight: 17 }}>
              Urgent requests (security, flooding, no power) are escalated to on-call staff immediately.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: t.colors.card, borderTopColor: t.colors.border }]}>
        <Button title="Cancel" variant="outline" small onPress={() => nav.goBack()} style={{ marginRight: spacing.sm }} />
        <Button title="Submit request" icon="send" small disabled={!canSubmit} onPress={onSubmit} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = {
  label: (t: any) => ({ fontSize: 12, fontWeight: '700' as const, color: t.colors.subtext, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: 0.5 }),
  priChip: {
    flex: 1, alignItems: 'center' as const, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
  },
  noteBox: {
    flexDirection: 'row' as const, gap: spacing.sm, padding: spacing.md,
    borderRadius: 12, alignItems: 'flex-start' as const,
  },
  footer: {
    position: 'absolute' as const, bottom: 0, left: 0, right: 0,
    flexDirection: 'row' as const, padding: spacing.lg, paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
};
