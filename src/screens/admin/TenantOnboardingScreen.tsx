import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, radius, spacing } from '../../theme';
import { useStore, useScopedPropertyIds } from '../../store/AppContext';
import { Card, Button, Field, Badge, ProgressBar } from '../../components/ui';
import { formatNGN, todayISO } from '../../utils';
import { UnitType } from '../../types';

const STEPS = ['Tenant info', 'Select unit', 'Lease terms', 'Review'];

export default function TenantOnboardingScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { state, onboardTenant } = useStore();
  const scopedIds = useScopedPropertyIds();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [occupation, setOccupation] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState(12);
  const [rentOverride, setRentOverride] = useState('');
  const [depositOverride, setDepositOverride] = useState('');

  const properties = useMemo(
    () => (scopedIds ? state.properties.filter((p) => scopedIds.includes(p.id)) : state.properties),
    [state.properties, scopedIds]
  );

  const vacantUnits = useMemo(() => {
    if (!propertyId) return [];
    return state.units.filter((u) => u.propertyId === propertyId && u.status === 'vacant');
  }, [state.units, propertyId]);

  const selectedUnit = state.units.find((u) => u.id === unitId);
  const rent = selectedUnit ? (rentOverride ? Number(rentOverride) || selectedUnit.rent : selectedUnit.rent) : 0;
  const deposit = selectedUnit
    ? (depositOverride ? Number(depositOverride) || selectedUnit.rent * 2 : selectedUnit.rent * 2)
    : 0;

  const canNext =
    (step === 0 && name.trim().length > 1 && phone.trim().length > 6) ||
    (step === 1 && !!unitId) ||
    (step === 2 && rent > 0) ||
    step === 3;

  const onConfirm = () => {
    if (!selectedUnit) return;
    onboardTenant({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || '—',
      occupation: occupation.trim() || '—',
      unitId: selectedUnit.id,
      startDate: todayISO(),
      termMonths,
      rent,
      deposit,
      emergencyName: emergencyName.trim() || '—',
      emergencyPhone: emergencyPhone.trim() || '—',
      emergencyRelationship: emergencyRelationship.trim() || '—',
    });
    Alert.alert('Tenant onboarded', `${name.trim()} has been moved into ${selectedUnit.unitNumber}. Lease created and rent invoice issued.`, [
      { text: 'Done', onPress: () => nav.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.iconBtn, { backgroundColor: t.colors.card }]}>
          <Ionicons name="close" size={20} color={t.colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: t.colors.text, marginLeft: spacing.md }}>Onboard tenant</Text>
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <ProgressBar progress={(step + 1) / STEPS.length} color={t.colors.primary} height={6} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          {STEPS.map((s, i) => (
            <Text key={s} style={{ fontSize: 10, fontWeight: i === step ? '800' : '600', color: i === step ? t.colors.primary : t.colors.subtext }}>
              {i + 1}. {s}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 120 }}>
        {step === 0 && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.md }}>Personal information</Text>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Chinedu Okafor" autoCapitalize="words" />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 ..." keyboardType="phone-pad" />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Occupation" value={occupation} onChangeText={setOccupation} placeholder="e.g. Software Engineer" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginTop: spacing.sm, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}>Emergency contact</Text>
            <Field label="Name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Full name" />
            <Field label="Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+234 ..." keyboardType="phone-pad" />
            <Field label="Relationship" value={emergencyRelationship} onChangeText={setEmergencyRelationship} placeholder="e.g. Spouse" />
          </Card>
        )}

        {step === 1 && (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.md }}>Select property & unit</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              {properties.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setPropertyId(p.id); setUnitId(null); }}
                  style={[
                    styles.propChip,
                    { backgroundColor: propertyId === p.id ? p.color : t.colors.card, borderColor: propertyId === p.id ? p.color : t.colors.border },
                  ]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: propertyId === p.id ? '#fff' : t.colors.text }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {propertyId ? (
              vacantUnits.length === 0 ? (
                <Card><Text style={{ color: t.colors.subtext, fontSize: 13 }}>No vacant units in this property.</Text></Card>
              ) : (
                vacantUnits.map((u) => (
                  <TouchableOpacity key={u.id} activeOpacity={0.75} onPress={() => setUnitId(u.id)}>
                    <View style={[styles.unitRow, { backgroundColor: t.colors.card, borderColor: unitId === u.id ? t.colors.primary : t.colors.border, borderWidth: unitId === u.id ? 1.5 : 1 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: t.colors.text }}>{u.unitNumber}</Text>
                        <Text style={{ fontSize: 12, color: t.colors.subtext, marginTop: 2 }}>{u.type} · Floor {u.floor} · {u.bedrooms === 0 ? 'Studio' : `${u.bedrooms} bed`}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: t.colors.primary }}>{u.rent.toLocaleString()}/mo</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )
            ) : (
              <Card><Text style={{ color: t.colors.subtext, fontSize: 13 }}>Choose a property above to see vacant units.</Text></Card>
            )}
          </View>
        )}

        {step === 2 && selectedUnit && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.sm }}>Lease terms — {selectedUnit.unitNumber}</Text>
            <Text style={{ fontSize: 12, color: t.colors.subtext, marginBottom: spacing.md }}>
              Start date: today · Default rent auto-filled from unit listing
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.subtext, marginBottom: spacing.xs }}>LEASE TERM</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {[12, 24].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setTermMonths(m)}
                  style={[styles.termChip, { backgroundColor: termMonths === m ? t.colors.primary : t.colors.cardAlt }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: termMonths === m ? '#fff' : t.colors.subtext }}>{m} months</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field label={`Monthly rent (₦) — default ${selectedUnit.rent.toLocaleString()}`} value={rentOverride} onChangeText={setRentOverride} keyboardType="numeric" placeholder={String(selectedUnit.rent)} />
            <Field label={`Deposit (₦) — default ${(selectedUnit.rent * 2).toLocaleString()}`} value={depositOverride} onChangeText={setDepositOverride} keyboardType="numeric" placeholder={String(selectedUnit.rent * 2)} />
            <View style={[styles.summaryBox, { backgroundColor: t.colors.cardAlt }]}>
              <Text style={{ fontSize: 12, color: t.colors.subtext }}>Total due on signing (deposit + first month)</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: t.colors.text, marginTop: 4 }}>
                ₦{(rent + deposit).toLocaleString()}
              </Text>
            </View>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.colors.text, marginBottom: spacing.md }}>Review & confirm</Text>
            <ReviewRow label="Name" value={name} />
            <ReviewRow label="Phone" value={phone} />
            <ReviewRow label="Email" value={email || '—'} />
            <ReviewRow label="Occupation" value={occupation || '—'} />
            <ReviewRow label="Unit" value={selectedUnit ? `${selectedUnit.unitNumber} (${selectedUnit.type})` : '—'} />
            <ReviewRow label="Property" value={state.properties.find((p) => p.id === selectedUnit?.propertyId)?.name ?? '—'} />
            <ReviewRow label="Lease term" value={`${termMonths} months`} />
            <ReviewRow label="Monthly rent" value={`₦${rent.toLocaleString()}`} />
            <ReviewRow label="Deposit" value={`₦${deposit.toLocaleString()}`} />
            <ReviewRow label="Emergency contact" value={emergencyName || '—'} />
            <ReviewRow label="Total due on signing" value={`₦${(rent + deposit).toLocaleString()}`} highlight />
          </Card>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: t.colors.card, borderTopColor: t.colors.border }]}>
        {step > 0 && <Button title="Back" variant="outline" small onPress={() => setStep(step - 1)} style={{ marginRight: spacing.sm }} />}
        {step < 3 ? (
          <Button title="Continue" icon="arrow-forward" small disabled={!canNext} onPress={() => setStep(step + 1)} style={{ flex: 1 }} />
        ) : (
          <Button title="Confirm onboarding" icon="checkmark-circle" small disabled={!canNext} onPress={onConfirm} style={{ flex: 1 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
      <Text style={{ fontSize: 13, color: t.colors.subtext }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: highlight ? '800' : '700', color: highlight ? t.colors.primary : t.colors.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  propChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  unitRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  termChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md },
  summaryBox: { borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', padding: spacing.lg,
    borderTopWidth: 1, paddingBottom: spacing.xl,
  },
});
