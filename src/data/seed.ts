import {
  AppState, Lease, MaintenanceRequest, Payment, Tenant, Unit, Conversation,
  Activity, User, Property, Location, Priority, MaintenanceStatus,
} from '../types';
import { addDays, addMonths, toISODate, monthKey, currentPeriod } from '../utils';

// Deterministic RNG so the demo dataset is stable
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Chinedu', 'Amina', 'Funmi', 'Tunde', 'Ngozi', 'Emeka', 'Fatima', 'David', 'Grace', 'Ibrahim',
  'Olumide', 'Zainab', 'Chidi', 'Blessing', 'Yusuf', 'Adaeze', 'Mohammed', 'Nkechi', 'Segun', 'Halima',
  'Tobi', 'Kemi', 'Uche', 'Rukayat', 'Femi', 'Ifeoma', 'Sani', 'Oluwaseun', 'Hauwa', 'Chika',
  'Dayo', 'Esther', 'Musa', 'Adaora', 'Biodun', 'Zara', 'Nneka', 'Abba', 'Olabisi', 'Farida',
  'Ekene', 'Maryam', 'Wale', 'Ogechukwu', 'Folashade', 'Usman', 'Chioma', 'Abubakar', 'Teniola', 'Nafisat',
  'Kayode', 'Rhoda', 'Mukhtar', 'Adebayo', 'Lami', 'Oluwatoyin', 'Bello', 'Ifeanyi', 'Aisha', 'Olajumoke',
  'Hassan', 'Ndidiamaka', 'Rotimi', 'Khadijat', 'Emmanuel', 'Olaide', 'Bashir', 'Chisom', 'Ugochi', 'Nasir',
  'Adetola', 'Ruqayyah', 'Olufemi', 'Chidinma', 'Yakubu', 'Ebuka', 'Jummai', 'Okey', 'Taofeek', 'Adenike',
  'Ireti', 'Omotayo', 'Salami', 'Adunni', 'Ezeudu', 'Nnenna', 'Gabriel', 'Precious', 'Clement', 'Joyce',
];

const LAST_NAMES = [
  'Okafor', 'Bello', 'Adeyemi', 'Balogun', 'Eze', 'Nwankwo', 'Yusuf', 'Osei', 'Mbah', 'Sani',
  'Okonkwo', 'Adebayo', 'Ibrahim', 'Ogunleye', 'Abiola', 'Danladi', 'Nwosu', 'Adeleke', 'Yahaya', 'Olatunji',
  'Abubakar', 'Ekwueme', 'Musa', 'Adegoke', 'Bakare', 'Umar', 'Obi', 'Anyanwu', 'Lawal', 'Adeyanju',
  'Okoye', 'Nwachukwu', 'Salami', 'Akinyemi', 'Usman', 'Adebisi', 'Ojo', 'Fatoki', 'Akinola', 'Chukwu',
  'Nweke', 'Adenuga', 'Ogunbiyi', 'Kolawole', 'Babalola', 'Ogunlade', 'Salaudeen', 'Nwabueze', 'Oguamanam', 'Okorie',
  'Agbo', 'Ibe', 'Kalu', 'Okpara', 'Nnaji', 'Arinze', 'Mba', 'Ani', 'Ugwu', 'Onyema',
  'Akinfenwa', 'Oluwadare', 'Adelakun', 'Ogunremi', 'Ajayi', 'Fagbemi', 'Adegbite', 'Akinwande', 'Salako', 'Aina',
];

const OCCUPATIONS = [
  'Software Engineer', 'Accountant', 'Teacher', 'Medical Doctor', 'Fashion Designer', 'Trader',
  'Civil Servant', 'Lawyer', 'Student', 'Graphic Designer', 'Chef', 'Pharmacist',
  'Architect', 'Banker', 'Entrepreneur', 'HR Manager', 'Electrician', 'Nurse', 'Journalist', 'Marketing Executive',
];

const AVATAR_COLORS = ['#0B2545', '#1E9E6A', '#E8A33D', '#7C5CFC', '#E5484D', '#0E7C86', '#C9526E', '#3B82F6', '#8B5CF6', '#D97706'];

const REQUEST_TITLES: Array<{ title: string; category: MaintenanceRequest['category']; priority: Priority }> = [
  { title: 'Kitchen sink leaking', category: 'Plumbing', priority: 'high' },
  { title: 'Air conditioner not cooling', category: 'HVAC', priority: 'medium' },
  { title: 'Power outage in entire block', category: 'Electrical', priority: 'urgent' },
  { title: 'Main gate intercom faulty', category: 'Electrical', priority: 'medium' },
  { title: 'Water heater not working', category: 'Plumbing', priority: 'medium' },
  { title: 'Cracked window pane in bedroom', category: 'Structural', priority: 'low' },
  { title: 'Toilet constantly blocking', category: 'Plumbing', priority: 'high' },
  { title: 'Lift not working', category: 'Structural', priority: 'urgent' },
  { title: 'Roof leaking during rain', category: 'Structural', priority: 'high' },
  { title: 'Pest infestation in kitchen', category: 'Other', priority: 'medium' },
  { title: 'Streetlight not working', category: 'Electrical', priority: 'low' },
  { title: 'Swimming pool pump faulty', category: 'Appliance', priority: 'medium' },
  { title: 'Gas cooker burner faulty', category: 'Appliance', priority: 'low' },
  { title: 'Damp patches on bedroom wall', category: 'Structural', priority: 'medium' },
  { title: 'Lobby Wi-Fi router down', category: 'Electrical', priority: 'low' },
  { title: 'Bathroom tap dripping constantly', category: 'Plumbing', priority: 'low' },
];

const REQUEST_DESCS: Record<string, string> = {
  Plumbing: 'Water is leaking continuously and the floor is getting flooded. Please send a plumber as soon as possible.',
  Electrical: 'There is no power supply to the affected area. Circuit breaker looks fine on my end.',
  HVAC: 'The unit is running but blowing warm air. It has been like this for about three days now.',
  Structural: 'The damage is visible and getting worse. Needs urgent attention from the maintenance team.',
  Appliance: 'The appliance stopped working suddenly and is making an unusual humming noise.',
  Other: 'Please inspect and resolve at the earliest convenience.',
};

const CONVERSATION_SNIPPETS: Array<[string, string]> = [
  ['Hello, my kitchen sink has been leaking since yesterday. Can someone come over today?', 'Thank you for reporting. I have assigned a plumber — he should arrive by 2 PM today.'],
  ['Good morning sir, when will the lift be fixed? It has been down for two days.', 'The lift engineer is on site. Parts arrived this morning, expect it fixed by tomorrow.'],
  ['Please confirm receipt of my rent payment for this month.', 'Payment confirmed and receipt issued. Thank you for paying on time.'],
  ['The security light at the parking has been flickering all week.', 'Noted. An electrician has been scheduled to replace the fittings this Friday.'],
];

export function buildSeed(): AppState {
  const rng = mulberry32(20260924);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const dateOnly = (d: Date) => toISODateLocal(d);
  function toISODateLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ---------- Locations ----------
  const locations: Location[] = [
    { id: 'loc-1', name: 'Lekki Phase 1', city: 'Lagos', state: 'Lagos State', address: 'Admiralty Way, Lekki Phase 1' },
    { id: 'loc-2', name: 'Victoria Island', city: 'Lagos', state: 'Lagos State', address: 'Ozumba Mbadiwe Avenue, Victoria Island' },
    { id: 'loc-3', name: 'Ikeja GRA', city: 'Lagos', state: 'Lagos State', address: 'Opebi Road, Ikeja GRA' },
    { id: 'loc-4', name: 'Yaba', city: 'Lagos', state: 'Lagos State', address: 'Herbert Macaulay Way, Yaba' },
    { id: 'loc-5', name: 'Maitama', city: 'Abuja', state: 'FCT', address: 'Maitama District, Abuja' },
  ];

  // ---------- Properties (7 blocks) ----------
  const properties: Property[] = [
    { id: 'prop-1', name: 'Lekki Heights Towers', code: 'LHT', locationId: 'loc-1', managerId: 'mgr-1', yearBuilt: 2019, description: 'Luxury serviced apartments with lagoon views, smart access and resort-style amenities.', amenities: ['Swimming Pool', 'Gym', 'Backup Power', 'CCTV', 'Parking'], color: '#0B2545' },
    { id: 'prop-2', name: 'Palm Grove Court', code: 'PGC', locationId: 'loc-1', managerId: 'mgr-1', yearBuilt: 2021, description: 'Serene garden apartments within the Lekki corridor, close to schools and malls.', amenities: ['Garden', 'Backup Power', '24/7 Security'], color: '#1E9E6A' },
    { id: 'prop-3', name: 'Coral View Residences', code: 'CVR', locationId: 'loc-2', managerId: 'mgr-2', yearBuilt: 2018, description: 'Waterfront high-rise residences on Victoria Island with concierge and sea views.', amenities: ['Sea View', 'Pool', 'Gym', 'Concierge'], color: '#E8A33D' },
    { id: 'prop-4', name: 'Ikeja Grand Suites', code: 'IGS', locationId: 'loc-3', managerId: 'mgr-2', yearBuilt: 2020, description: 'Modern business apartments in the heart of Ikeja GRA, minutes from the airport road.', amenities: ['Lift', 'Backup Power', 'Parking', 'CCTV'], color: '#7C5CFC' },
    { id: 'prop-5', name: 'TechLofts Yaba', code: 'TLY', locationId: 'loc-4', managerId: 'mgr-2', yearBuilt: 2022, description: 'Tech-centric lofts with fiber internet and coworking lounge, built for young professionals.', amenities: ['Coworking Lounge', 'Fiber Internet', 'Gym'], color: '#E5484D' },
    { id: 'prop-6', name: 'Maitama Skyline', code: 'MSA', locationId: 'loc-5', managerId: 'mgr-2', yearBuilt: 2017, description: 'Premium Abuja apartments in the diplomatic district with serviced common areas.', amenities: ['Pool', 'Gym', 'Serviced Areas'], color: '#0E7C86' },
    { id: 'prop-7', name: 'Eko Pearl Gardens', code: 'EPG', locationId: 'loc-2', managerId: 'mgr-1', yearBuilt: 2023, description: 'Brand-new garden apartments on Victoria Island with smart home fittings.', amenities: ['Garden', 'Pool', 'CCTV', 'Backup Power'], color: '#C9526E' },
  ];

  // ---------- Users ----------
  const users: User[] = [
    { id: 'u-admin', name: 'Adewale Adeyemi', role: 'super_admin', email: 'adewale@estatehub.ng', phone: '+234 801 000 0001', title: 'Super Admin / Landlord', avatarColor: '#0B2545' },
    { id: 'u-mgr-1', name: 'Chisom Nwosu', role: 'manager', email: 'chisom@estatehub.ng', phone: '+234 801 000 0002', title: 'Property Manager — Lekki & VI', avatarColor: '#1E9E6A', propertyIds: ['prop-1', 'prop-2', 'prop-7'] },
    { id: 'u-mgr-2', name: 'Ibrahim Okoye', role: 'manager', email: 'ibrahim@estatehub.ng', phone: '+234 801 000 0003', title: 'Property Manager — Mainland & Abuja', avatarColor: '#7C5CFC', propertyIds: ['prop-3', 'prop-4', 'prop-5', 'prop-6'] },
  ];

  // ---------- Units ----------
  const rentBase: Record<string, Record<string, number>> = {
    'loc-1': { Studio: 350000, '1BR': 450000, '2BR': 650000, '3BR': 950000 },
    'loc-2': { Studio: 500000, '1BR': 650000, '2BR': 900000, '3BR': 1300000 },
    'loc-3': { Studio: 250000, '1BR': 350000, '2BR': 500000, '3BR': 700000 },
    'loc-4': { Studio: 180000, '1BR': 250000, '2BR': 380000, '3BR': 550000 },
    'loc-5': { Studio: 400000, '1BR': 550000, '2BR': 800000, '3BR': 1100000 },
  };
  const typeCycle: Array<{ type: Unit['type']; beds: number; baths: number }> = [
    { type: 'Studio', beds: 0, baths: 1 },
    { type: '1BR', beds: 1, baths: 1 },
    { type: '1BR', beds: 1, baths: 1 },
    { type: '2BR', beds: 2, baths: 2 },
    { type: '2BR', beds: 2, baths: 2 },
    { type: '3BR', beds: 3, baths: 2 },
  ];

  const units: Unit[] = [];
  const unitOccupancyPlan: Record<string, string[]> = {}; // propertyId -> statuses
  properties.forEach((p) => {
    const total = p.id === 'prop-1' ? 16 : p.id === 'prop-2' ? 12 : p.id === 'prop-3' ? 14 : p.id === 'prop-4' ? 18 : p.id === 'prop-5' ? 20 : p.id === 'prop-6' ? 12 : 10;
    const perFloor = 4;
    const floors = Math.ceil(total / perFloor);
    const statuses: string[] = [];
    for (let i = 0; i < total; i++) {
      const r = rng();
      if (r < 0.7) statuses.push('occupied');
      else if (r < 0.84) statuses.push('vacant');
      else statuses.push('maintenance');
    }
    // guarantee at least 2 vacant and 1 maintenance per property
    if (!statuses.includes('vacant')) statuses[0] = 'vacant';
    if (!statuses.includes('vacant')) statuses[1] = 'vacant';
    if (!statuses.includes('maintenance')) statuses[2] = 'maintenance';
    unitOccupancyPlan[p.id] = statuses;

    for (let i = 0; i < total; i++) {
      const t = typeCycle[i % typeCycle.length];
      const floor = Math.floor(i / perFloor) + 1;
      units.push({
        id: `unit-${p.id}-${i + 1}`,
        propertyId: p.id,
        unitNumber: `${p.code}-${String(floor).padStart(1, '0')}${String((i % perFloor) + 1).padStart(1, '0')}`,
        type: t.type,
        bedrooms: t.beds,
        bathrooms: t.baths,
        rent: rentBase[p.locationId][t.type],
        status: statuses[i] as Unit['status'],
        floor,
      });
    }
  });

  // ---------- Tenants & Leases ----------
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const occupiedUnits = units.filter((u) => u.status === 'occupied');
  let nameIdx = Math.floor(rng() * 20);

  occupiedUnits.forEach((u, i) => {
    const firstName = FIRST_NAMES[nameIdx % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(nameIdx * 7 + 3) % LAST_NAMES.length];
    nameIdx += 3;
    const name = `${firstName} ${lastName}`;
    const tenantId = `tenant-${i + 1}`;
    const prop = properties.find((p) => p.id === u.propertyId)!;
    tenants.push({
      id: tenantId,
      name,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
      phone: `+234 8${String(randInt(10, 99))} ${String(randInt(100, 999))} ${String(randInt(1000, 9999))}`,
      unitId: u.id,
      propertyId: u.propertyId,
      occupation: pick(OCCUPATIONS),
      avatarColor: pick(AVATAR_COLORS),
      joinedAt: iso(addMonths(now, -randInt(2, 20))),
      emergencyContact: {
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        phone: `+234 8${String(randInt(10, 99))} ${String(randInt(100, 999))} ${String(randInt(1000, 9999))}`,
        relationship: pick(['Spouse', 'Sibling', 'Parent', 'Friend']),
      },
      status: 'active',
    });

    // Lease: mostly active, some expiring soon, some expired
    let endDate: Date;
    if (i % 13 === 0) endDate = addDays(now, randInt(5, 55)); // expiring soon
    else if (i % 17 === 0) endDate = addDays(now, -randInt(3, 40)); // expired (holdover)
    else endDate = addDays(now, randInt(90, 330));
    const startDate = addMonths(endDate, -12);
    leases.push({
      id: `lease-${i + 1}`,
      tenantId,
      unitId: u.id,
      propertyId: u.propertyId,
      startDate: dateOnly(startDate),
      endDate: dateOnly(endDate),
      rent: u.rent,
      deposit: u.rent * 2,
      termMonths: 12,
    });
  });

  // Demo tenant users (for tenant portal login)
  const demoTenantUsers: User[] = tenants.slice(0, 8).map((t, i) => ({
    id: `u-tenant-${i + 1}`,
    name: t.name,
    role: 'tenant',
    email: t.email,
    phone: t.phone,
    title: 'Tenant',
    avatarColor: t.avatarColor,
    tenantId: t.id,
  }));
  users.push(...demoTenantUsers);

  // ---------- Payments ----------
  const payments: Payment[] = [];
  const period = currentPeriod();
  const periodDate = new Date();
  const dueDate = dateOnly(new Date(periodDate.getFullYear(), periodDate.getMonth(), 25));

  occupiedUnits.forEach((u, i) => {
    const tenant = tenants.find((t) => t.unitId === u.id);
    if (!tenant) return;
    const lease = leases.find((l) => l.tenantId === tenant.id);
    if (!lease) return;
    const status = leaseStatusOf(lease.endDate);
    if (status === 'expired') return;

    // current period payment
    const r = rng();
    const payStatus: Payment['status'] = r < 0.72 ? 'paid' : r < 0.9 ? 'pending' : 'overdue';
    payments.push({
      id: `pay-cur-${i + 1}`,
      tenantId: tenant.id,
      unitId: u.id,
      propertyId: u.propertyId,
      amount: u.rent,
      period,
      dueDate,
      status: payStatus,
      paidDate: payStatus === 'paid' ? iso(addDays(now, -randInt(1, 18))) : undefined,
      method: payStatus === 'paid' ? pick(['Bank Transfer', 'POS', 'Cheque']) : undefined,
    });

    // historical payments for trend (last 5 months)
    for (let m = 1; m <= 5; m++) {
      const d = addMonths(now, -m);
      const histStatus = rng() < 0.92 ? 'paid' : 'pending';
      payments.push({
        id: `pay-hist-${i + 1}-${m}`,
        tenantId: tenant.id,
        unitId: u.id,
        propertyId: u.propertyId,
        amount: u.rent,
        period: monthKeyOf(d),
        dueDate: dateOnly(new Date(d.getFullYear(), d.getMonth(), 25)),
        status: histStatus,
        paidDate: histStatus === 'paid' ? iso(addDays(d, randInt(1, 20))) : undefined,
        method: histStatus === 'paid' ? 'Bank Transfer' : undefined,
      });
    }
  });

  // ---------- Maintenance requests ----------
  const maintenance: MaintenanceRequest[] = [];
  const statusCycle: MaintenanceStatus[] = ['open', 'open', 'in_progress', 'open', 'in_progress', 'resolved', 'open', 'in_progress', 'resolved', 'resolved', 'open', 'in_progress', 'resolved', 'resolved', 'open', 'resolved'];
  REQUEST_TITLES.forEach((rt, i) => {
    const unit = occupiedUnits[i % occupiedUnits.length];
    const tenant = tenants.find((t) => t.unitId === unit.id);
    if (!tenant) return;
    const created = addDays(now, -randInt(1, 24));
    const status = statusCycle[i % statusCycle.length];
    maintenance.push({
      id: `req-${i + 1}`,
      unitId: unit.id,
      propertyId: unit.propertyId,
      tenantId: tenant.id,
      title: rt.title,
      description: REQUEST_DESCS[rt.category],
      category: rt.category,
      priority: rt.priority,
      status,
      createdAt: iso(created),
      updatedAt: iso(addDays(created, randInt(0, 3))),
      scheduledDate: status === 'open' ? dateOnly(addDays(now, randInt(1, 4))) : undefined,
      cost: status === 'resolved' ? randInt(15000, 180000) : undefined,
      notes: status !== 'open' ? [
        { id: `note-${i + 1}-a`, author: 'System', text: 'Request received and logged. Ticket assigned to maintenance queue.', createdAt: iso(created) },
        ...(status === 'in_progress' || status === 'resolved'
          ? [{ id: `note-${i + 1}-b`, author: 'Chisom Nwosu', text: 'Technician dispatched to site. Spare parts confirmed available.', createdAt: iso(addDays(created, 1)) }]
          : []),
        ...(status === 'resolved'
          ? [{ id: `note-${i + 1}-c`, author: 'Ibrahim Okoye', text: 'Repair completed and verified with tenant. Ticket closed.', createdAt: iso(addDays(created, 3)) }]
          : []),
      ] : [],
    });
  });

  // ---------- Conversations ----------
  const conversations: Conversation[] = [];
  demoTenantUsers.slice(0, 4).forEach((u, i) => {
    const tenant = tenants.find((t) => t.id === u.tenantId);
    if (!tenant) return;
    const [msg1, msg2] = CONVERSATION_SNIPPETS[i % CONVERSATION_SNIPPETS.length];
    const base = addDays(now, -randInt(1, 6));
    conversations.push({
      id: `conv-${i + 1}`,
      tenantId: tenant.id,
      messages: [
        { id: `msg-${i + 1}-a`, senderId: tenant.id, text: msg1, createdAt: iso(base), read: true },
        { id: `msg-${i + 1}-b`, senderId: 'u-admin', text: msg2, createdAt: iso(addDays(base, 0.02)), read: i % 2 === 0 },
      ],
    });
  });

  // ---------- Activities ----------
  const activities: Activity[] = [
    { id: 'act-1', type: 'maintenance', text: 'New urgent request: "Lift not working" at Ikeja Grand Suites (IGS-0203)', createdAt: iso(addDays(now, -0.1)), actor: 'System' },
    { id: 'act-2', type: 'payment', text: 'Rent payment of ₦650,000 received from Chinedu Okafor (LHT-0301)', createdAt: iso(addDays(now, -0.3)), actor: 'System' },
    { id: 'act-3', type: 'maintenance', text: 'Request "Kitchen sink leaking" marked resolved at Lekki Heights Towers', createdAt: iso(addDays(now, -0.6)), actor: 'Chisom Nwosu' },
    { id: 'act-4', type: 'lease', text: 'Lease for Amina Bello (CVR-0102) expires in 24 days — renewal pending', createdAt: iso(addDays(now, -1)), actor: 'System' },
    { id: 'act-5', type: 'tenant', text: 'New tenant onboarding completed: David Osei moved into TLY-0204', createdAt: iso(addDays(now, -1.4)), actor: 'Ibrahim Okoye' },
    { id: 'act-6', type: 'payment', text: 'Rent payment of ₦900,000 received from Grace Mbah (CVR-0201)', createdAt: iso(addDays(now, -1.8)), actor: 'System' },
    { id: 'act-7', type: 'maintenance', text: 'Technician dispatched for "Power outage in entire block" at TechLofts Yaba', createdAt: iso(addDays(now, -2)), actor: 'Ibrahim Okoye' },
    { id: 'act-8', type: 'lease', text: 'Lease renewed for 12 months: Fatima Yusuf (PGC-0103)', createdAt: iso(addDays(now, -2.5)), actor: 'Chisom Nwosu' },
    { id: 'act-9', type: 'property', text: 'Quarterly inspection scheduled for Maitama Skyline Apartments', createdAt: iso(addDays(now, -3)), actor: 'Ibrahim Okoye' },
    { id: 'act-10', type: 'payment', text: '2 rent payments overdue — reminders sent to tenants at Yaba and Ikeja', createdAt: iso(addDays(now, -3.4)), actor: 'System' },
  ];

  return {
    hydrated: true,
    sessionUserId: null,
    users,
    locations,
    properties,
    units,
    tenants,
    leases,
    maintenance,
    payments,
    conversations,
    activities,
  };
}

// local helpers (kept module-private)
function leaseStatusOf(endDate: string): 'active' | 'expiring' | 'expired' {
  const end = new Date(endDate + 'T00:00:00');
  const diff = end.getTime() - Date.now();
  if (diff < 0) return 'expired';
  if (diff <= 60 * 86400000) return 'expiring';
  return 'active';
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateOnlyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toISODateLocal(d: Date): string {
  return dateOnlyLocal(d);
}
