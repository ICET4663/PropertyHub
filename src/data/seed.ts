import type {
  ActivityLog, Announcement, AppNotification, AppState, Block, Category, DocFile, Lease, Location,
  MaintenanceRequest, Payment, Priority, Property, RequestEvent, RequestStatus, Tenant, Unit, UnitType, User, Vendor,
} from '../types';
import { addDays, addMonths, toISODate } from '../utils';

export const STATE_VERSION = 3;

// Deterministic RNG so the demo dataset is stable between reloads
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Adaeze', 'Tobi', 'Kemi', 'Uche', 'Ifeoma', 'Sani', 'Oluwaseun', 'Hauwa', 'Chika', 'Dayo', 'Esther', 'Musa', 'Adaora', 'Biodun', 'Nneka', 'Wale', 'Folashade', 'Usman', 'Chioma', 'Teniola', 'Kayode', 'Rhoda', 'Adebayo', 'Lami', 'Ifeanyi', 'Olajumoke', 'Hassan', 'Rotimi', 'Khadijat', 'Emmanuel', 'Bashir', 'Chisom', 'Ugochi', 'Adetola', 'Ebuka', 'Jummai', 'Okey', 'Adenike', 'Ireti', 'Omotayo', 'Nnenna', 'Gabriel', 'Precious', 'Clement', 'Joyce', 'Damilola', 'Obinna', 'Fatima', 'Seun', 'Amaka', 'Ahmed', 'Bukola', 'Chuka', 'Deborah', 'Efosa', 'Gbenga', 'Ijeoma', 'Kunle', 'Maryam', 'Nkem', 'Oyinda', 'Tosin', 'Victor', 'Yemi'];
const LAST = ['Okonkwo', 'Adebayo', 'Ibrahim', 'Ogunleye', 'Abiola', 'Danladi', 'Nwosu', 'Adeleke', 'Yahaya', 'Olatunji', 'Ekwueme', 'Adegoke', 'Umar', 'Anyanwu', 'Lawal', 'Okoye', 'Nwachukwu', 'Akinyemi', 'Adebisi', 'Ojo', 'Fatoki', 'Akinola', 'Chukwu', 'Nweke', 'Adenuga', 'Kolawole', 'Babalola', 'Nwabueze', 'Okorie', 'Agbo', 'Kalu', 'Okpara', 'Nnaji', 'Arinze', 'Ugwu', 'Onyema', 'Ajayi', 'Fagbemi', 'Salako', 'Aina', 'Etim', 'Oyelaran', 'Bassey', 'Ogundipe', 'Mustapha', 'Ikenna'];
const EMPLOYERS = ['Interswitch Group', 'Access Bank Plc', 'MTN Nigeria', 'Dangote Group', 'Flutterwave', 'Deloitte Nigeria', 'Lagos State Govt', 'Nestlé Nigeria', 'Paystack', 'Zenith Bank', 'Andela', 'Shell Nigeria', 'First Bank', 'Self'];
const JOBS = ['Product Designer', 'Relationship Manager', 'Software Engineer', 'Accountant', 'Medical Doctor', 'Lawyer', 'Pharmacist', 'Architect', 'Marketing Lead', 'Data Analyst', 'HR Manager', 'Civil Engineer', 'Consultant', 'Entrepreneur'];

const ALL_CATS: Category[] = ['Plumbing', 'Electrical', 'Air conditioning', 'Generator', 'Water supply', 'Building repairs', 'Security', 'Cleaning', 'Pests'];

export function buildSeed(): AppState {
  const rng = mulberry32(20260924);
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)];
  const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const now = new Date();
  const at = (days: number, h = 9, m = 0) => {
    const d = addDays(now, days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => toISODate(addDays(now, days));
  const phone = () => `+234 8${randInt(0, 1)}${randInt(0, 9)} ${randInt(100, 999)} ${randInt(1000, 9999)}`;

  // ---------------- Users ----------------
  const users: User[] = [
    { id: 'u-femi', name: 'Femi Adewale', email: 'femi@adewaleproperties.ng', phone: '+234 803 100 2201', role: 'super_admin', access: 'All locations', twoStep: true, lastActive: at(0, 8, 40), status: 'active' },
    { id: 'u-grace', name: 'Grace Uche', email: 'grace@adewaleproperties.ng', phone: '+234 809 330 1120', role: 'manager', access: 'Lekki Phase 1, Ikoyi', propertyIds: ['prop-palm', 'prop-bourdillon'], twoStep: true, lastActive: at(0, 8, 28), status: 'active' },
    { id: 'u-tobi', name: 'Tobi Lawal', email: 'tobi@adewaleproperties.ng', phone: '+234 802 114 7780', role: 'manager', access: 'Yaba, Gbagada', propertyIds: ['prop-hm', 'prop-gbagada'], twoStep: true, lastActive: at(0, 7, 40), status: 'active' },
    { id: 'u-musa', name: 'Musa Danjuma', email: 'musa@adewaleproperties.ng', phone: '+234 806 551 0932', role: 'manager', access: 'Wuse 2', propertyIds: ['prop-aminu'], twoStep: false, lastActive: at(-1, 17, 2), status: 'active' },
    { id: 'u-rukayat', name: 'Rukayat Adebayo', email: 'accounts@adewaleproperties.ng', phone: '+234 805 771 2240', role: 'accountant', access: 'All locations, read only', twoStep: false, lastActive: at(-1, 14, 22), status: 'active' },
    { id: 'u-john', name: 'John Eze', email: 'john.eze@adewaleproperties.ng', phone: '+234 806 441 2031', role: 'caretaker', access: 'Herbert Macaulay Flats', propertyIds: ['prop-hm'], twoStep: true, lastActive: at(-3, 10, 5), status: 'active' },
    { id: 'u-bola', name: 'Bola Kuti', email: 'bola@adewaleproperties.ng', phone: '+234 807 223 4410', role: 'manager', access: 'Wuse 2', propertyIds: ['prop-aminu'], twoStep: false, lastActive: at(-2, 11, 10), status: 'invited' },
  ];

  // ---------------- Locations ----------------
  const locations: Location[] = [
    { id: 'loc-lekki', name: 'Lekki Phase 1', area: 'Admiralty Way corridor', city: 'Lagos', state: 'Lagos State', description: 'Residential corridor with estate security and access to the Lekki-Epe Expressway.', managerId: 'u-grace' },
    { id: 'loc-ikoyi', name: 'Ikoyi', area: 'Bourdillon Road', city: 'Lagos', state: 'Lagos State', description: 'Prime Ikoyi address close to the Falomo roundabout and the Lekki link bridge.', managerId: 'u-grace' },
    { id: 'loc-yaba', name: 'Yaba', area: 'Herbert Macaulay Way', city: 'Lagos', state: 'Lagos State', description: 'Busy mainland district near the tech hub, universities and the rail line.', managerId: 'u-tobi' },
    { id: 'loc-gbagada', name: 'Gbagada', area: 'Gbagada Phase 2', city: 'Lagos', state: 'Lagos State', description: 'Quiet family estate district off the Third Mainland Bridge.', managerId: 'u-tobi' },
    { id: 'loc-wuse', name: 'Wuse 2', area: 'Aminu Kano Crescent', city: 'Abuja', state: 'FCT', description: 'Central Abuja business and lifestyle district.', managerId: 'u-musa' },
  ];

  // ---------------- Properties & blocks ----------------
  const properties: Property[] = [
    { id: 'prop-palm', name: 'Palm Court Residences', short: 'Palm Court', type: 'Apartment complex', locationId: 'loc-lekki', address: '22 Admiralty Way, Lekki Phase 1, Lagos', managerId: 'u-grace', addedAt: '2021-03-12', description: 'Two blocks of 1 to 3-bedroom flats with 24-hour power backup, borehole water and gated parking.', amenities: ['24h power backup', 'Borehole water', 'Security post', 'Parking', 'CCTV'], art: { bg: '#DCE7E1', a: '#2F5D4B', b: '#8A6A34' }, status: 'active' },
    { id: 'prop-bourdillon', name: 'Bourdillon Heights', short: 'Bourdillon', type: 'Luxury apartments', locationId: 'loc-ikoyi', address: '7 Bourdillon Road, Ikoyi, Lagos', managerId: 'u-grace', addedAt: '2022-01-20', description: 'Luxury apartments with lift access, pool and concierge.', amenities: ['24h power backup', 'Elevator', 'Swimming pool', 'Security post', 'Parking', 'Gym'], art: { bg: '#DCE3ED', a: '#3E4F6E', b: '#2F5D4B' }, status: 'active' },
    { id: 'prop-hm', name: 'Herbert Macaulay Flats', short: 'Herbert Macaulay', type: 'Block of flats', locationId: 'loc-yaba', address: '112 Herbert Macaulay Way, Yaba, Lagos', managerId: 'u-tobi', addedAt: '2020-06-02', description: 'Two blocks of affordable flats close to the Yaba tech corridor.', amenities: ['Borehole water', 'Security post', 'Parking'], art: { bg: '#ECE3D2', a: '#8A6A34', b: '#3E4F6E' }, status: 'active' },
    { id: 'prop-gbagada', name: 'Gbagada Garden Estate', short: 'Gbagada Garden', type: 'Estate', locationId: 'loc-gbagada', address: '4 Garden Avenue, Gbagada Phase 2, Lagos', managerId: 'u-tobi', addedAt: '2022-09-15', description: 'Gated garden estate with family-sized flats.', amenities: ['24h power backup', 'Borehole water', 'Security post', 'Parking', 'Garden'], art: { bg: '#E3E9DD', a: '#2F5D4B', b: '#3E4F6E' }, status: 'active' },
    { id: 'prop-aminu', name: 'Aminu Kano Apartments', short: 'Aminu Kano', type: 'Serviced apartments', locationId: 'loc-wuse', address: '18 Aminu Kano Crescent, Wuse 2, Abuja', managerId: 'u-musa', addedAt: '2023-02-01', description: 'Serviced apartments in central Abuja with housekeeping.', amenities: ['24h power backup', 'Housekeeping', 'Elevator', 'Security post', 'Parking'], art: { bg: '#ECE3DC', a: '#2F5D4B', b: '#3E4F6E' }, status: 'active' },
  ];

  const blockPlan: { propertyId: string; name: string; count: number }[] = [
    { propertyId: 'prop-palm', name: 'A', count: 12 },
    { propertyId: 'prop-palm', name: 'B', count: 12 },
    { propertyId: 'prop-bourdillon', name: 'A', count: 10 },
    { propertyId: 'prop-hm', name: 'A', count: 16 },
    { propertyId: 'prop-hm', name: 'B', count: 16 },
    { propertyId: 'prop-gbagada', name: 'A', count: 12 },
    { propertyId: 'prop-aminu', name: 'A', count: 14 },
  ];

  const rentTable: Record<string, Partial<Record<UnitType, number>>> = {
    'prop-palm': { Studio: 2_000_000, '1 Bedroom': 2_900_000, '2 Bedroom': 3_800_000, '3 Bedroom': 4_800_000, Duplex: 6_500_000 },
    'prop-bourdillon': { '2 Bedroom': 5_500_000, '3 Bedroom': 7_200_000, Duplex: 9_500_000 },
    'prop-hm': { '1 Bedroom': 1_800_000, '2 Bedroom': 2_400_000, '3 Bedroom': 3_100_000 },
    'prop-gbagada': { '1 Bedroom': 1_500_000, '2 Bedroom': 3_200_000, '3 Bedroom': 3_900_000 },
    'prop-aminu': { Studio: 1_900_000, '1 Bedroom': 2_600_000, '2 Bedroom': 3_400_000 },
  };
  const serviceTable: Record<string, number> = { 'prop-palm': 450_000, 'prop-bourdillon': 900_000, 'prop-hm': 250_000, 'prop-gbagada': 400_000, 'prop-aminu': 500_000 };
  const typeCycle: Record<string, UnitType[]> = {
    'prop-palm': ['Duplex', 'Studio', '3 Bedroom', '1 Bedroom', '2 Bedroom', '3 Bedroom', '2 Bedroom', '1 Bedroom', '2 Bedroom', '1 Bedroom', '2 Bedroom', '2 Bedroom'],
    'prop-bourdillon': ['3 Bedroom', '2 Bedroom', '3 Bedroom', 'Duplex', '2 Bedroom'],
    'prop-hm': ['2 Bedroom', '1 Bedroom', '2 Bedroom', '1 Bedroom', '3 Bedroom', '2 Bedroom', '1 Bedroom', '2 Bedroom'],
    'prop-gbagada': ['2 Bedroom', '1 Bedroom', '1 Bedroom', '3 Bedroom', '2 Bedroom', '2 Bedroom'],
    'prop-aminu': ['1 Bedroom', 'Studio', '1 Bedroom', '2 Bedroom', '1 Bedroom', 'Studio', '2 Bedroom'],
  };
  const sizeOf: Record<UnitType, number> = { Studio: 38, '1 Bedroom': 68, '2 Bedroom': 96, '3 Bedroom': 128, Duplex: 180 };

  // non-occupied units: key = propertyId:code
  const special: Record<string, { status: 'vacant' | 'maintenance'; since: number; note?: Unit['vacantNote'] }> = {
    'prop-palm:A12': { status: 'vacant', since: -14, note: 'Listed' },
    'prop-palm:B5': { status: 'vacant', since: -3, note: 'Viewing booked' },
    'prop-palm:B9': { status: 'maintenance', since: -8 },
    'prop-hm:B11': { status: 'vacant', since: -112, note: 'Listed' },
    'prop-hm:B4': { status: 'vacant', since: -9, note: 'Listed' },
    'prop-hm:A3': { status: 'vacant', since: -41, note: 'Viewing booked' },
    'prop-hm:A9': { status: 'vacant', since: -27, note: 'Repairs' },
    'prop-hm:A14': { status: 'vacant', since: -60, note: 'Listed' },
    'prop-hm:A7': { status: 'maintenance', since: -12 },
    'prop-hm:B15': { status: 'maintenance', since: -6 },
    'prop-gbagada:A3': { status: 'vacant', since: -25, note: 'Repairs' },
    'prop-gbagada:A8': { status: 'maintenance', since: -15 },
    'prop-aminu:A12': { status: 'vacant', since: -19, note: 'Listed' },
    'prop-aminu:A5': { status: 'maintenance', since: -10 },
  };

  const blocks: Block[] = [];
  const units: Unit[] = [];
  blockPlan.forEach((bp) => {
    const perFloor = bp.count % 4 === 0 ? 4 : bp.count % 3 === 0 ? 3 : 2;
    const floors = Math.ceil(bp.count / perFloor);
    const blockId = `blk-${bp.propertyId.slice(5)}-${bp.name.toLowerCase()}`;
    blocks.push({ id: blockId, propertyId: bp.propertyId, name: `Block ${bp.name}`, floors });
    for (let i = 0; i < bp.count; i++) {
      const code = `${bp.name}${i + 1}`;
      const cycle = typeCycle[bp.propertyId];
      const type = cycle[(i + (bp.name === 'B' ? 3 : 0)) % cycle.length];
      const rent = rentTable[bp.propertyId][type] ?? 2_500_000;
      const sp = special[`${bp.propertyId}:${code}`];
      units.push({
        id: `unit-${bp.propertyId.slice(5)}-${code.toLowerCase()}`,
        propertyId: bp.propertyId,
        blockId,
        code,
        floor: Math.floor(i / perFloor),
        type,
        bathrooms: type === 'Studio' || type === '1 Bedroom' ? 1 : type === 'Duplex' ? 4 : type === '3 Bedroom' ? 3 : 2,
        sizeSqm: sizeOf[type],
        rent,
        serviceCharge: serviceTable[bp.propertyId],
        deposit: Math.round(rent / 10),
        status: sp ? sp.status : 'occupied',
        features: ['Fitted kitchen', i % 2 ? 'Balcony' : 'Guest WC', 'Prepaid meter', '1 parking slot', type === 'Studio' ? 'Open plan' : 'AC in bedroom'],
        vacantSince: sp ? day(sp.since) : undefined,
        vacantNote: sp?.note,
      });
    }
  });
  const unitBy = (pid: string, code: string) => units.find((u) => u.propertyId === pid && u.code === code)!;

  // ---------------- Tenants & leases ----------------
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const payments: Payment[] = [];

  type Named = { name: string; pid: string; code: string; end: number; lease: string; tn?: string; email?: string; phone?: string; gender?: 'Male' | 'Female'; since?: number };
  const named: Named[] = [
    { name: 'Chidinma Okafor', pid: 'prop-palm', code: 'A4', end: 129, lease: 'LS-0318', tn: 'TN-00412', email: 'chidinma.okafor@mail.com', phone: '+234 803 412 7765', gender: 'Female', since: -640 },
    { name: 'Emeka Nwosu', pid: 'prop-hm', code: 'B3', end: -12, lease: 'LS-0211', tn: 'TN-00235', email: 'emeka.nwosu@mail.com', phone: '+234 806 220 1943', gender: 'Male', since: -380 },
    { name: 'Zainab Bello', pid: 'prop-palm', code: 'A7', end: -3, lease: 'LS-0224', tn: 'TN-00361', email: 'zainab.bello@mail.com', phone: '+234 809 551 0082', gender: 'Female', since: -370 },
    { name: 'Adamu Garba', pid: 'prop-aminu', code: 'A2', end: -5, lease: 'LS-0198', tn: 'TN-00188', gender: 'Male', since: -372 },
    { name: 'Kelechi Obi', pid: 'prop-gbagada', code: 'A5', end: 9, lease: 'LS-0233', tn: 'TN-00290', email: 'kelechi.obi@mail.com', phone: '+234 813 004 6621', gender: 'Male', since: -1090 },
    { name: 'Funmilayo Adeyemi', pid: 'prop-bourdillon', code: 'A6', end: 18, lease: 'LS-0252', tn: 'TN-00311', email: 'funmi.adeyemi@mail.com', phone: '+234 802 771 3390', gender: 'Female', since: -350 },
    { name: 'Yetunde Alabi', pid: 'prop-aminu', code: 'A10', end: 27, lease: 'LS-0240', tn: 'TN-00302', gender: 'Female', since: -340 },
    { name: 'Babajide Coker', pid: 'prop-palm', code: 'B8', end: 29, lease: 'LS-0244', tn: 'TN-00305', gender: 'Male', since: -338 },
    { name: 'Tunde Bakare', pid: 'prop-palm', code: 'A9', end: 155, lease: 'LS-0279', tn: 'TN-00378', email: 'tunde.bakare@mail.com', phone: '+234 805 663 4418', gender: 'Male', since: -210 },
    { name: 'Aisha Mohammed', pid: 'prop-hm', code: 'B7', end: 98, lease: 'LS-0262', tn: 'TN-00344', email: 'aisha.m@example.com', phone: '+234 803 555 0142', gender: 'Female', since: -265 },
    { name: 'Olumide Johnson', pid: 'prop-bourdillon', code: 'A2', end: 362, lease: 'LS-0341', tn: 'TN-00144', email: 'olumide.johnson@mail.com', phone: '+234 802 445 7781', gender: 'Male', since: -732 },
    { name: 'Ngozi Eze', pid: 'prop-aminu', code: 'A3', end: 210, lease: 'LS-0288', tn: 'TN-00383', gender: 'Female', since: -155 },
    { name: 'Ibrahim Sule', pid: 'prop-gbagada', code: 'A11', end: 240, lease: 'LS-0294', tn: 'TN-00390', gender: 'Male', since: -125 },
    { name: 'Halima Yusuf', pid: 'prop-aminu', code: 'A8', end: 355, lease: 'LS-0339', tn: 'TN-00445', email: 'halima.yusuf@mail.com', phone: '+234 703 118 2245', gender: 'Female', since: -10 },
  ];
  const bucketEnds = [35, 41, 48, 52, 58, 64, 70, 77, 83, 88];

  const occupied = units.filter((u) => u.status === 'occupied');
  const namedUnitIds = new Set(named.map((n) => unitBy(n.pid, n.code).id));
  let nameI = 0;
  let leaseNo = 100;
  let tnNo = 150;
  const usedLease = new Set(named.map((n) => n.lease));
  const usedTn = new Set(named.map((n) => n.tn));
  const nextTenantCode = () => {
    let code = '';
    do { code = `TN-${String(tnNo++).padStart(5, '0')}`; } while (usedTn.has(code));
    usedTn.add(code);
    return code;
  };
  const nextLeaseId = () => {
    let id = '';
    do { id = `LS-${String(leaseNo++).padStart(4, '0')}`; } while (usedLease.has(id));
    usedLease.add(id);
    return id;
  };

  const makeTenant = (unit: Unit, n: Partial<Named> & { name: string }, idx: number): Tenant => {
    const [fn, ln] = n.name.split(' ');
    const female = n.gender ? n.gender === 'Female' : idx % 2 === 0;
    return {
      id: `ten-${idx + 1}`,
      code: n.tn ?? nextTenantCode(),
      name: n.name,
      email: n.email ?? `${fn.toLowerCase()}.${ln.toLowerCase()}@mail.com`,
      phone: n.phone ?? phone(),
      dob: toISODate(new Date(1980 + randInt(0, 18), randInt(0, 11), randInt(1, 28))),
      gender: female ? 'Female' : 'Male',
      address: `${randInt(2, 40)} ${pick(['Opebi Road, Ikeja', 'Allen Avenue, Ikeja', 'Adeniran Ogunsanya, Surulere', 'Awolowo Road, Ikoyi', 'Ogudu Road, Ojota', 'Adetokunbo Ademola, Wuse 2'])}`,
      unitId: unit.id,
      propertyId: unit.propertyId,
      status: 'active',
      onboarding: 'approved',
      joinedAt: day(n.since ?? -randInt(40, 900)),
      language: 'English',
      nextOfKin: { name: `${pick(FIRST)} ${ln}`, relationship: pick(['Brother', 'Sister', 'Spouse', 'Mother', 'Father']), phone: phone(), address: pick(['Enugu, Enugu State', 'Ibadan, Oyo State', 'Surulere, Lagos', 'Kaduna, Kaduna State', 'Owerri, Imo State']) },
      employment: { status: 'Employed', employer: pick(EMPLOYERS), occupation: pick(JOBS), workAddress: pick(['Victoria Island, Lagos', 'Ikoyi, Lagos', 'Ikeja, Lagos', 'Yaba, Lagos', 'Central Area, Abuja']) },
      identification: { type: pick(['National ID (NIN slip)', 'International passport', "Driver's licence"]), number: `${randInt(100, 999)}•••${randInt(100, 999)}`, verified: true },
      prefs: { smsUpdates: true, emailAnnouncements: true, whatsapp: false },
    };
  };

  const makeLease = (t: Tenant, unit: Unit, id: string, endOffset: number, createdBy: string): Lease => {
    const end = addDays(now, endOffset);
    const start = addDays(addMonths(end, -12), 1);
    const days = endOffset;
    const reminders: Lease['reminders'] = [];
    if (days <= 90) reminders.push({ label: '90-day renewal reminder', channels: 'Email', date: toISODate(addDays(end, -90)), status: 'Read' });
    if (days <= 60) reminders.push({ label: '60-day renewal reminder', channels: 'Email', date: toISODate(addDays(end, -60)), status: 'Read' });
    if (days <= 30) reminders.push({ label: '30-day renewal reminder', channels: 'Email · SMS', date: toISODate(addDays(end, -30)), status: 'Delivered' });
    return {
      id, tenantId: t.id, unitId: unit.id, propertyId: unit.propertyId,
      start: toISODate(start), end: toISODate(end),
      rent: unit.rent, serviceCharge: unit.serviceCharge, deposit: unit.deposit,
      termMonths: 12, noticeMonths: 3, paymentCycle: 'Annually, in advance', createdBy,
      agreement: `${id}-tenancy-agreement.pdf`, signed: true, reminders: reminders.reverse(),
    };
  };

  const managerName = (pid: string) => users.find((u) => u.id === properties.find((p) => p.id === pid)!.managerId)!.name;

  // Named tenants first
  named.forEach((n, i) => {
    const unit = unitBy(n.pid, n.code);
    const t = makeTenant(unit, n, i);
    tenants.push(t);
    leases.push(makeLease(t, unit, n.lease, n.end, managerName(n.pid)));
  });

  // Everyone else on occupied units
  let bucketI = 0;
  occupied.filter((u) => !namedUnitIds.has(u.id)).forEach((unit, j) => {
    const name = `${FIRST[(nameI * 7 + 3) % FIRST.length]} ${LAST[(nameI * 5 + 1) % LAST.length]}`;
    nameI++;
    const t = makeTenant(unit, { name }, tenants.length);
    tenants.push(t);
    const end = bucketI < bucketEnds.length ? bucketEnds[bucketI++] : randInt(95, 360);
    leases.push(makeLease(t, unit, nextLeaseId(), end, managerName(unit.propertyId)));
    void j;
  });

  // Prior (renewed) leases for longer-standing tenants
  tenants.forEach((t) => {
    const cur = leases.find((l) => l.tenantId === t.id)!;
    let startOfCur = cur.start;
    let nextId = cur.id;
    const years = Math.min(3, Math.floor((new Date(startOfCur).getTime() - new Date(t.joinedAt).getTime()) / (365 * 86400000)));
    for (let y = 0; y < years; y++) {
      const end = addDays(new Date(startOfCur + 'T00:00:00'), -1);
      const start = addDays(addMonths(end, -12), 1);
      const prevRent = Math.round((cur.rent / Math.pow(1.07, y + 1)) / 10000) * 10000;
      const id = nextLeaseId();
      leases.push({ ...cur, id, start: toISODate(start), end: toISODate(end), rent: prevRent, renewedTo: nextId, agreement: `${id}-tenancy-agreement.pdf`, reminders: [], createdBy: 'Femi Adewale' });
      const curIdx = leases.findIndex((l) => l.id === nextId);
      leases[curIdx] = { ...leases[curIdx], renewedFrom: id };
      startOfCur = toISODate(start);
      nextId = id;
    }
  });

  // Tenant intent on a couple of expiring leases
  leases.forEach((l) => {
    if (l.id === 'LS-0233') l.tenantIntent = 'renew';
    if (l.id === 'LS-0252') l.tenantIntent = 'renew';
  });

  // Pending tenants (awaiting approval)
  const segunUnit = unitBy('prop-palm', 'A12');
  tenants.push({
    ...makeTenant(segunUnit, { name: 'Segun Afolabi', email: 'segun.afolabi@mail.com', phone: '+234 816 332 9087', gender: 'Male' }, tenants.length),
    status: 'pending', onboarding: 'pending', joinedAt: day(-1), address: '7 Ogunlana Drive, Surulere, Lagos', dob: '1991-06-14',
    nextOfKin: { name: 'Bolanle Afolabi', relationship: 'Sister', phone: '+234 802 190 4476', address: '21 Bode Thomas Street, Surulere, Lagos' },
    employment: { status: 'Employed', employer: 'Interswitch Group', occupation: 'Product Designer', workAddress: '1648C Oko-Awo Street, Victoria Island, Lagos' },
    identification: { type: 'National ID (NIN slip)', number: 'NIN 4821•••903', verified: false },
  });
  const musaUnit = unitBy('prop-gbagada', 'A3');
  tenants.push({
    ...makeTenant(musaUnit, { name: 'Maryam Lawal', email: 'maryam.lawal@mail.com', gender: 'Female' }, tenants.length),
    status: 'pending', onboarding: 'pending', selfSignup: true, joinedAt: day(-2),
    identification: { type: 'International passport', number: 'A••••431', verified: false },
  });
  // Deactivated former tenants
  ['Bello Musa', 'Ronke Ajayi', 'Paul Etim', 'Grace Nnaji', 'Kola Aina', 'Ada Kalu'].forEach((name, i) => {
    const t = makeTenant(units[i * 13], { name }, tenants.length);
    tenants.push({ ...t, unitId: undefined, status: i < 3 ? 'former' : 'deactivated', joinedAt: day(-900 + i * 20) });
  });

  // Payments
  leases.filter((l) => !l.draft).forEach((l) => {
    const t = tenants.find((x) => x.id === l.tenantId)!;
    payments.push({ id: `pay-${l.id}`, tenantId: t.id, leaseId: l.id, label: 'Rent + service charge', amount: l.rent + l.serviceCharge, date: l.start, method: 'Bank transfer', status: 'paid' });
    if (!l.renewedFrom) payments.push({ id: `dep-${l.id}`, tenantId: t.id, leaseId: l.id, label: 'Caution deposit', amount: l.deposit, date: l.start, method: 'Bank transfer', status: 'paid' });
  });
  ['LS-0211', 'LS-0224', 'LS-0198'].forEach((id, i) => {
    const l = leases.find((x) => x.id === id)!;
    payments.push({ id: `due-${id}`, tenantId: l.tenantId, leaseId: id, label: 'Rent arrears', amount: [1_200_000, 950_000, 1_450_000][i], date: day(-[12, 3, 5][i]), method: '—', status: 'overdue' });
  });

  // ---------------- Vendors ----------------
  const vendors: Vendor[] = [
    { id: 'ven-aquafix', name: 'AquaFix Plumbing', contact: 'Bayo Adeyemi', phone: '+234 802 110 4471', email: 'jobs@aquafix.ng', trade: 'Plumbing', coverage: 'Yaba, Surulere, Ebute Metta', completed: 42, avgDays: 1.6, rating: 4.8, ratingCount: 42, status: 'active', spendThisMonth: 486_000 },
    { id: 'ven-voltline', name: 'Voltline Electricals', contact: 'Ifeanyi Okeke', phone: '+234 809 223 5118', email: 'ops@voltline.ng', trade: 'Electrical', coverage: 'All Lagos', completed: 37, avgDays: 2.2, rating: 4.6, ratingCount: 37, status: 'active', spendThisMonth: 312_000 },
    { id: 'ven-coolair', name: 'CoolAir Services', contact: 'Musa Danladi', phone: '+234 803 440 9931', email: 'service@coolair.ng', trade: 'Air conditioning', coverage: 'Lekki, Ikoyi, VI', completed: 25, avgDays: 1.9, rating: 4.7, ratingCount: 25, status: 'active', spendThisMonth: 268_000 },
    { id: 'ven-powergen', name: 'PowerGen Nigeria', contact: 'Samuel Ojo', phone: '+234 805 671 2290', email: 'support@powergen.ng', trade: 'Generator', coverage: 'All Lagos, Abuja', completed: 31, avgDays: 1.1, rating: 4.4, ratingCount: 31, status: 'active', spendThisMonth: 402_000 },
    { id: 'ven-piperight', name: 'PipeRight Services', contact: 'Chuka Nnaji', phone: '+234 816 302 7745', email: 'hello@piperight.ng', trade: 'Plumbing', coverage: 'Yaba, Gbagada', completed: 19, avgDays: 2.1, rating: 4.5, ratingCount: 19, status: 'active', spendThisMonth: 96_000 },
    { id: 'ven-safeguard', name: 'SafeGuard Security', contact: 'Aliyu Bello', phone: '+234 803 998 1203', email: 'ops@safeguard.ng', trade: 'Security', coverage: 'All locations', completed: 12, avgDays: 0.8, rating: 4.3, ratingCount: 12, status: 'active', spendThisMonth: 120_000 },
    { id: 'ven-sparkle', name: 'Sparkle Cleaning Co.', contact: 'Blessing Etim', phone: '+234 807 554 3310', email: 'book@sparkle.ng', trade: 'Cleaning', coverage: 'Lekki, Yaba', completed: 56, avgDays: 0.5, rating: 4.6, ratingCount: 56, status: 'active', spendThisMonth: 84_000 },
    { id: 'ven-buildright', name: 'BuildRight Works', contact: 'Kunle Adeniran', phone: '+234 802 667 1120', email: 'jobs@buildright.ng', trade: 'Building repairs', coverage: 'All Lagos', completed: 21, avgDays: 2.8, rating: 4.5, ratingCount: 21, status: 'active', spendThisMonth: 58_000 },
    { id: 'ven-lagoshome', name: 'Lagos Home Repairs', contact: 'Tosin Ade', phone: '+234 818 204 6812', email: 'tosin@lagoshome.ng', trade: 'Building repairs', coverage: 'Lekki, Yaba, Gbagada', completed: 8, avgDays: 3.4, rating: 4.2, ratingCount: 8, status: 'paused', spendThisMonth: 0 },
    { id: 'ven-pestaway', name: 'PestAway Nigeria', contact: 'Ruth Okon', phone: '+234 809 118 2210', email: 'ruth@pestaway.ng', trade: 'Pests', coverage: 'All Lagos', completed: 14, avgDays: 1.2, rating: 4.4, ratingCount: 14, status: 'active', spendThisMonth: 0 },
    { id: 'ven-abujafix', name: 'Capital FixIt Abuja', contact: 'Yakubu Sani', phone: '+234 806 330 1908', email: 'fixit@capital.ng', trade: 'Plumbing', coverage: 'Wuse, Maitama, Garki', completed: 17, avgDays: 1.8, rating: 4.5, ratingCount: 17, status: 'active', spendThisMonth: 16_000 },
  ];

  // ---------------- Maintenance ----------------
  const tByName = (name: string) => tenants.find((t) => t.name === name)!;
  const requests: MaintenanceRequest[] = [];
  const unitOf = (t: Tenant) => units.find((u) => u.id === t.unitId)!;
  const vendorFor = (cat: Category, pid: string): string => {
    const map: Partial<Record<Category, string>> = { Plumbing: pid === 'prop-aminu' ? 'ven-abujafix' : 'ven-aquafix', 'Water supply': 'ven-aquafix', Electrical: 'ven-voltline', 'Air conditioning': 'ven-coolair', Generator: 'ven-powergen', 'Building repairs': 'ven-buildright', Security: 'ven-safeguard', Cleaning: 'ven-sparkle', Pests: 'ven-pestaway' };
    return map[cat] ?? 'ven-buildright';
  };

  type R = { id: number; t: string; cat: Category; title: string; desc?: string; pr: Priority; st: RequestStatus; d: number; h?: number; m?: number; where?: string };
  const openList: R[] = [
    { id: 2087, t: 'Aisha Mohammed', cat: 'Plumbing', title: 'Kitchen sink pipe burst', desc: 'The pipe under the kitchen sink burst this morning. I have shut the valve under the sink but water is still dripping and the cabinet floor is soaked. Please send someone today if possible.', pr: 'high', st: 'new', d: 0, h: 8, m: 14, where: 'Kitchen' },
    { id: 2086, t: 'Tunde Bakare', cat: 'Electrical', title: 'Sockets sparking in kitchen', desc: 'Two sockets beside the fridge sparked and tripped the breaker. I have switched off the kitchen circuit.', pr: 'urgent', st: 'assigned', d: 0, h: 7, m: 52, where: 'Kitchen' },
    { id: 2085, t: 'Ngozi Eze', cat: 'Air conditioning', title: 'AC not cooling', pr: 'medium', st: 'in_progress', d: -1, h: 16, where: 'Bedroom' },
    { id: 2084, t: 'Ibrahim Sule', cat: 'Generator', title: 'Estate generator not starting', pr: 'high', st: 'in_progress', d: -1, h: 11, where: 'Common area' },
    { id: 2082, t: 'Halima Yusuf', cat: 'Plumbing', title: 'Low pressure on hot water', pr: 'low', st: 'in_progress', d: -6, where: 'Bathroom' },
    { id: 2080, t: 'Emeka Nwosu', cat: 'Plumbing', title: 'Bathroom ceiling leak from flat above', pr: 'high', st: 'in_progress', d: -4, where: 'Bathroom' },
    { id: 2079, t: 'Kelechi Obi', cat: 'Electrical', title: 'Corridor lights out on floor 1', pr: 'medium', st: 'assigned', d: -5, where: 'Corridor' },
    { id: 2078, t: 'Zainab Bello', cat: 'Electrical', title: 'Prepaid meter shows fault', pr: 'medium', st: 'in_progress', d: -3, where: 'Living room' },
    { id: 2077, t: 'Babajide Coker', cat: 'Air conditioning', title: 'AC leaking water indoors', pr: 'medium', st: 'assigned', d: -4, where: 'Living room' },
    { id: 2076, t: 'Olumide Johnson', cat: 'Water supply', title: 'No water in the morning', pr: 'high', st: 'new', d: -1, h: 6, where: 'Whole flat' },
    { id: 2075, t: 'Funmilayo Adeyemi', cat: 'Air conditioning', title: 'AC remote and unit unresponsive', pr: 'low', st: 'assigned', d: -6, where: 'Bedroom' },
    { id: 2074, t: 'Yetunde Alabi', cat: 'Plumbing', title: 'WC cistern keeps running', pr: 'low', st: 'in_progress', d: -7, where: 'Bathroom' },
    { id: 2073, t: 'Adamu Garba', cat: 'Generator', title: 'Power not switching to generator', pr: 'high', st: 'assigned', d: -2, where: 'Whole flat' },
  ];
  // Fill remaining open requests to hit design totals by property/category/status
  const openFill: { pid: string; cat: Category; st: RequestStatus; pr: Priority; title: string }[] = [
    { pid: 'prop-hm', cat: 'Plumbing', st: 'new', pr: 'medium', title: 'Shower mixer broken' },
    { pid: 'prop-hm', cat: 'Electrical', st: 'new', pr: 'high', title: 'Frequent power trips in flat' },
    { pid: 'prop-hm', cat: 'Plumbing', st: 'in_progress', pr: 'medium', title: 'Kitchen drain blocked' },
    { pid: 'prop-hm', cat: 'Water supply', st: 'in_progress', pr: 'medium', title: 'Overhead tank overflowing' },
    { pid: 'prop-hm', cat: 'Building repairs', st: 'assigned', pr: 'low', title: 'Window latch broken' },
    { pid: 'prop-hm', cat: 'Security', st: 'new', pr: 'medium', title: 'Gate intercom not working' },
    { pid: 'prop-gbagada', cat: 'Generator', st: 'in_progress', pr: 'medium', title: 'Generator very noisy at night' },
    { pid: 'prop-aminu', cat: 'Air conditioning', st: 'in_progress', pr: 'low', title: 'AC making rattling noise' },
    { pid: 'prop-palm', cat: 'Building repairs', st: 'in_progress', pr: 'low', title: 'Wardrobe door off hinge' },
    { pid: 'prop-palm', cat: 'Electrical', st: 'in_progress', pr: 'low', title: 'Bathroom extractor fan dead' },
  ];

  const pickTenantAt = (pid: string, exclude: Set<string>) => {
    const pool = tenants.filter((t) => t.status === 'active' && t.propertyId === pid && !exclude.has(t.id));
    return pool[Math.floor(rng() * pool.length)] ?? tenants.find((t) => t.propertyId === pid)!;
  };

  const buildEvents = (r: { id: string; st: RequestStatus; pr: Priority; created: string; tenant: Tenant; vendorId?: string; photos: number; managerName: string }): RequestEvent[] => {
    const ev: RequestEvent[] = [{ id: `${r.id}-e1`, kind: 'created', text: `Request submitted by ${r.tenant.name}`, by: `Tenant portal · ${r.photos} photos attached`, at: r.created }];
    const c = new Date(r.created).getTime();
    if (r.pr === 'high' || r.pr === 'urgent') ev.push({ id: `${r.id}-e2`, kind: 'priority', text: `Priority set to ${r.pr === 'urgent' ? 'Urgent' : 'High'}`, by: r.managerName, at: new Date(c + 7 * 60000).toISOString() });
    const vName = vendors.find((v) => v.id === r.vendorId)?.name;
    if (r.st !== 'new' && vName) ev.push({ id: `${r.id}-e3`, kind: 'vendor', text: `${vName} assigned`, by: r.managerName, at: new Date(c + 2.2 * 3600000).toISOString() });
    if (r.st === 'in_progress' || r.st === 'resolved' || r.st === 'closed') ev.push({ id: `${r.id}-e4`, kind: 'status', text: 'Vendor on site — work in progress', by: vName ?? 'Vendor', at: new Date(c + 20 * 3600000).toISOString() });
    if (r.st === 'resolved' || r.st === 'closed') ev.push({ id: `${r.id}-e5`, kind: 'status', text: `${vName ?? 'Vendor'} marked the job as fixed`, by: vName ?? 'Vendor', at: new Date(c + 36 * 3600000).toISOString(), shared: true });
    if (r.st === 'closed') ev.push({ id: `${r.id}-e6`, kind: 'status', text: 'Tenant confirmed the fix — request closed', by: r.tenant.name, at: new Date(c + 50 * 3600000).toISOString(), shared: true });
    if (r.st === 'new') ev.push({ id: `${r.id}-e7`, kind: 'waiting', text: 'Waiting for vendor assignment', by: 'SLA for first response', at: new Date(c + 4 * 3600000).toISOString() });
    return ev;
  };

  const pushReq = (o: { num: number; tenant: Tenant; cat: Category; title: string; desc?: string; pr: Priority; st: RequestStatus; created: string; where?: string }) => {
    const unit = unitOf(o.tenant);
    const vendorId = o.st === 'new' ? undefined : vendorFor(o.cat, unit.propertyId);
    const id = `MR-${o.num}`;
    const photos = randInt(0, 3);
    const mgr = managerName(unit.propertyId);
    const cDate = new Date(o.created).getTime();
    requests.push({
      id, tenantId: o.tenant.id, unitId: unit.id, propertyId: unit.propertyId,
      category: o.cat, title: o.title,
      description: o.desc ?? `${o.title}. It started a few days ago and is affecting daily use of the flat. Please send someone to check.`,
      where: o.where ?? pick(['Kitchen', 'Bathroom', 'Bedroom', 'Living room']),
      priority: o.pr, status: o.st, vendorId,
      visit: o.st === 'assigned' || o.st === 'in_progress' ? { date: toISODate(addDays(new Date(cDate), 1)), window: pick(['9am – 12pm', '12pm – 3pm', '2pm – 5pm']) } : undefined,
      createdAt: o.created, updatedAt: new Date(cDate + 3600000 * randInt(1, 30)).toISOString(),
      resolvedAt: o.st === 'resolved' || o.st === 'closed' ? new Date(cDate + 36 * 3600000).toISOString() : undefined,
      photos, access: 'Tenant home after 5pm', caretakerAccess: rng() > 0.5,
      estimate: o.st === 'new' ? undefined : randInt(3, 30) * 5000,
      cost: o.st === 'resolved' || o.st === 'closed' ? randInt(3, 30) * 5000 : undefined,
      rating: o.st === 'closed' ? randInt(4, 5) : undefined,
      events: buildEvents({ id, st: o.st, pr: o.pr, created: o.created, tenant: o.tenant, vendorId, photos, managerName: mgr }),
    });
  };

  openList.forEach((r) => pushReq({ num: r.id, tenant: tByName(r.t), cat: r.cat, title: r.title, desc: r.desc, pr: r.pr, st: r.st, created: at(r.d, r.h ?? 10, r.m ?? 0), where: r.where }));
  let num = 2072;
  const used = new Set<string>();
  openFill.forEach((f) => {
    const t = pickTenantAt(f.pid, used);
    used.add(t.id);
    pushReq({ num: num--, tenant: t, cat: f.cat, title: f.title, pr: f.pr, st: f.st, created: at(-randInt(1, 9), randInt(7, 18)) });
  });
  // Chidinma's resolved request (awaiting her confirmation)
  pushReq({ num: 2083, tenant: tByName('Chidinma Okafor'), cat: 'Water supply', title: 'Low water pressure', desc: 'Water comes out very slowly from all taps since Sunday.', pr: 'medium', st: 'resolved', created: at(-2, 8, 2), where: 'Kitchen and bathroom taps' });
  pushReq({ num: 2081, tenant: tByName('Olumide Johnson'), cat: 'Building repairs', title: 'Cracked bathroom tiles', pr: 'low', st: 'closed', created: at(-3, 13), where: 'Bathroom' });
  // Resolved / closed history for the last 30 days
  const closedTitles: [Category, string][] = [
    ['Plumbing', 'Leaking tap in kitchen'], ['Electrical', 'Replace faulty inverter socket'], ['Building repairs', 'Door hinge squeaking'], ['Water supply', 'Borehole pump reset'],
    ['Cleaning', 'Stairwell deep clean'], ['Air conditioning', 'AC gas refill'], ['Generator', 'Generator oil change'], ['Security', 'Replace gate padlock'],
    ['Plumbing', 'Blocked bathroom drain'], ['Electrical', 'Replace blown bulbs in lobby'], ['Pests', 'Cockroach fumigation'], ['Building repairs', 'Repaint damp patch'],
  ];
  const activeT = tenants.filter((t) => t.status === 'active');
  for (let i = 0; i < 36; i++) {
    const [cat, title] = closedTitles[i % closedTitles.length];
    const t = activeT[(i * 7 + 5) % activeT.length];
    pushReq({ num: num--, tenant: t, cat, title, pr: pick(['low', 'medium', 'medium', 'high'] as Priority[]), st: i < 17 ? 'resolved' : 'closed', created: at(-randInt(3, 29), randInt(7, 18)) });
  }
  // Older history for Chidinma
  pushReq({ num: 1904, tenant: tByName('Chidinma Okafor'), cat: 'Air conditioning', title: 'AC not cooling', pr: 'medium', st: 'closed', created: at(-143, 10), where: 'Bedroom' });
  pushReq({ num: 1622, tenant: tByName('Chidinma Okafor'), cat: 'Building repairs', title: 'Bedroom door lock stiff', pr: 'low', st: 'closed', created: at(-225, 12), where: 'Bedroom' });
  pushReq({ num: 1587, tenant: tByName('Chidinma Okafor'), cat: 'Electrical', title: 'Kitchen bulb holder loose', pr: 'low', st: 'closed', created: at(-237, 15), where: 'Kitchen' });
  requests.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // ---------------- Announcements ----------------
  const announcements: Announcement[] = [
    { id: 'ann-1', subject: 'Estate sanitation, Saturday', message: 'Gates close to vehicles 7am–10am. Please keep walkways clear.', audience: 'All tenants', channels: ['In-app', 'Email', 'SMS'], sentAt: at(-4, 9), recipients: 108, readPct: 96, status: 'sent', by: 'Femi Adewale' },
    { id: 'ann-2', subject: 'Rent reminder, October', message: 'A friendly reminder that rent for October falls due on the 1st.', audience: 'Overdue tenants', channels: ['Email', 'SMS'], sentAt: at(-6, 10), recipients: 8, readPct: 88, status: 'sent', by: 'Rukayat Adebayo' },
    { id: 'ann-3', subject: 'Generator servicing, Palm Court', message: 'Power from the estate generator will be off Tuesday 10am–1pm.', audience: 'Palm Court Residences', propertyId: 'prop-palm', channels: ['In-app', 'SMS'], sentAt: at(-12, 8), recipients: 22, readPct: 100, status: 'sent', by: 'Grace Uche' },
    { id: 'ann-4', subject: 'Water interruption notice', message: 'Water supply to Herbert Macaulay Flats will be off while the main tank is cleaned.', audience: 'Herbert Macaulay Flats', propertyId: 'prop-hm', channels: ['In-app', 'SMS'], sentAt: at(-2, 12), recipients: 29, readPct: 81, status: 'sent', by: 'Tobi Lawal' },
    { id: 'ann-5', subject: 'Fire drill, Bourdillon Heights', message: 'A short fire drill will hold on Saturday at 11am.', audience: 'Bourdillon Heights', propertyId: 'prop-bourdillon', channels: ['In-app', 'Email'], sentAt: at(3, 9), scheduledFor: at(3, 9), recipients: 10, readPct: 0, status: 'scheduled', by: 'Grace Uche' },
    { id: 'ann-6', subject: 'Service charge statement', message: 'Your annual service charge statement is ready in the portal.', audience: 'All tenants', channels: ['In-app', 'Email'], sentAt: at(6, 9), scheduledFor: at(6, 9), recipients: 80, readPct: 0, status: 'scheduled', by: 'Rukayat Adebayo' },
    { id: 'tpl-1', subject: 'Scheduled water supply interruption', message: 'Dear {first_name},\n\nWater supply to {property} will be off while the main tank is cleaned and the pump is serviced.\n\nPlease store enough water for the day. We are sorry for the inconvenience.\n\nManagement, PropertyHub', audience: 'Template', channels: ['In-app', 'SMS'], sentAt: at(-30), recipients: 0, readPct: 0, status: 'template', by: 'Femi Adewale' },
    { id: 'tpl-2', subject: 'Rent due reminder', message: 'Dear {first_name},\n\nThis is a reminder that rent for {flat} at {property} is due soon.\n\nManagement, PropertyHub', audience: 'Template', channels: ['Email', 'SMS'], sentAt: at(-30), recipients: 0, readPct: 0, status: 'template', by: 'Femi Adewale' },
  ];

  // ---------------- Documents ----------------
  const documents: DocFile[] = [];
  const pname = (pid?: string) => properties.find((p) => p.id === pid)?.short ?? '';
  tenants.filter((t) => t.status === 'active').forEach((t, i) => {
    const u = units.find((x) => x.id === t.unitId)!;
    const l = leases.find((x) => x.tenantId === t.id && !x.renewedTo)!;
    documents.push({ id: `doc-lease-${t.id}`, name: `Tenancy agreement ${l.start.slice(0, 4)} – ${t.name.split(' ')[0]} ${t.name.split(' ')[1][0]}.pdf`, kind: 'pdf', folder: 'Lease agreements', linkedTo: `${pname(t.propertyId)} · ${u.code}`, tenantId: t.id, propertyId: t.propertyId, uploadedBy: managerName(t.propertyId!), date: l.start, sizeKb: 1200 + (i % 7) * 90 });
    if (i % 2 === 0) documents.push({ id: `doc-id-${t.id}`, name: `${t.identification.type.includes('passport') ? 'passport' : 'NIN slip'} – ${t.name}.jpg`, kind: 'jpg', folder: 'Tenant ID and KYC', linkedTo: `${pname(t.propertyId)} · ${u.code}`, tenantId: t.id, propertyId: t.propertyId, uploadedBy: 'Tenant', date: t.joinedAt, sizeKb: 420, expires: i % 18 === 0 ? day(9 + i) : undefined });
    if (i % 3 === 0) documents.push({ id: `doc-rcpt-${t.id}`, name: `Rent receipt – ${t.name} – ${l.start.slice(0, 4)}.pdf`, kind: 'pdf', folder: 'Receipts', linkedTo: `${pname(t.propertyId)} · ${u.code}`, tenantId: t.id, propertyId: t.propertyId, uploadedBy: 'Femi Adewale', date: l.start, sizeKb: 180 });
  });
  properties.forEach((p) => {
    documents.push({ id: `doc-cofo-${p.id}`, name: `Certificate of Occupancy – ${p.short}.pdf`, kind: 'pdf', folder: 'Property papers', linkedTo: p.short, propertyId: p.id, uploadedBy: 'Femi Adewale', date: p.addedAt, sizeKb: 2400 });
    documents.push({ id: `doc-plan-${p.id}`, name: `Building approval plan – ${p.short}.pdf`, kind: 'pdf', folder: 'Property papers', linkedTo: p.short, propertyId: p.id, uploadedBy: 'Femi Adewale', date: p.addedAt, sizeKb: 8100 });
  });
  vendors.forEach((v) => documents.push({ id: `doc-ven-${v.id}`, name: `Service agreement – ${v.name}.pdf`, kind: 'pdf', folder: 'Vendor contracts', linkedTo: v.name, uploadedBy: 'Femi Adewale', date: day(-randInt(60, 300)), sizeKb: 640 }));
  requests.filter((r) => r.photos > 0).slice(0, 30).forEach((r) => documents.push({ id: `doc-mr-${r.id}`, name: `${r.id} ${r.category.toLowerCase()} photo 1.jpg`, kind: 'jpg', folder: 'Maintenance', linkedTo: r.id, tenantId: r.tenantId, propertyId: r.propertyId, uploadedBy: 'Tenant', date: r.createdAt.slice(0, 10), sizeKb: 890 }));
  const chi = tByName('Chidinma Okafor');
  documents.push(
    { id: 'doc-chi-rules', name: 'Estate rules – Palm Court Residences.doc', kind: 'doc', folder: 'Property papers', linkedTo: 'Palm Court', propertyId: 'prop-palm', tenantId: chi.id, uploadedBy: 'Grace Uche', date: '2021-03-12', sizeKb: 96 },
    { id: 'doc-chi-move', name: 'Move-in inspection photos.jpg', kind: 'jpg', folder: 'Tenant ID and KYC', linkedTo: 'Palm Court · A4', tenantId: chi.id, propertyId: 'prop-palm', uploadedBy: 'Grace Uche', date: day(-600), sizeKb: 14_000 },
    { id: 'doc-chi-inv', name: 'Inventory checklist.docx', kind: 'doc', folder: 'Lease agreements', linkedTo: 'Palm Court · A4', tenantId: chi.id, propertyId: 'prop-palm', uploadedBy: 'Grace Uche', date: day(-600), sizeKb: 120 },
  );
  documents.sort((a, b) => (a.date < b.date ? 1 : -1));

  // ---------------- Notifications ----------------
  const notifications: AppNotification[] = [
    { id: 'n-1', audience: 'staff', category: 'Maintenance', title: 'New high-priority request', body: 'MR-2087: kitchen sink pipe burst at Herbert Macaulay B7.', meta: 'Maintenance · SLA ends 12:14', at: at(0, 8, 14), read: false, tone: 'danger', link: { name: 'request', params: { id: 'MR-2087' } } },
    { id: 'n-2', audience: 'staff', category: 'Maintenance', title: 'Urgent request', body: 'MR-2086: sockets sparking in kitchen at Palm Court A9.', meta: 'Maintenance · Assigned to Voltline', at: at(0, 7, 52), read: false, tone: 'danger', link: { name: 'request', params: { id: 'MR-2086' } } },
    { id: 'n-3', audience: 'staff', category: 'Tenants', title: 'Onboarding complete', body: 'Kelechi Obi signed the lease for Gbagada Garden A5.', meta: 'Tenants', at: at(0, 7, 30), read: false, tone: 'success' },
    { id: 'n-4', audience: 'staff', category: 'Rent', title: 'Rent overdue', body: 'Emeka Nwosu (Herbert Macaulay B3) is 12 days late, ₦1,200,000 outstanding.', meta: 'Rent', at: at(0, 6, 0), read: false, tone: 'warning' },
    { id: 'n-5', audience: 'staff', category: 'Tenants', title: 'Tenant awaiting approval', body: 'Segun Afolabi completed onboarding for Palm Court A12.', meta: 'Tenants · Approval', at: at(-1, 16, 10), read: false, tone: 'purple', link: { name: 'tenants' } },
    { id: 'n-6', audience: 'staff', category: 'Leases', title: 'Lease ending in 30 days', body: 'Babajide Coker, Palm Court B8. Renewal not started.', meta: 'Leases', at: at(-2, 9), read: false, tone: 'warning', link: { name: 'leases' } },
    { id: 'n-7', audience: 'staff', category: 'Maintenance', title: 'Request resolved', body: 'MR-2083 by AquaFix Plumbing, waiting for tenant to confirm.', meta: 'Maintenance', at: at(-2, 16, 40), read: false, tone: 'success' },
    { id: 'n-8', audience: 'staff', category: 'Tenants', title: 'Tenant ID expiring', body: 'International passport for Halima Yusuf expires on 3 Oct.', meta: 'Tenants · KYC', at: at(-3, 11), read: false, tone: 'info' },
    { id: 'n-9', audience: 'staff', category: 'System', title: 'New sign-in', body: 'Grace Uche signed in from a new device in Lagos.', meta: 'Security', at: at(-3, 19, 40), read: false, tone: 'neutral' },
    { id: 'n-10', audience: 'staff', category: 'Leases', title: 'Renewal accepted', body: 'Olumide Johnson accepted a 12-month renewal at ₦7,200,000.', meta: 'Leases', at: at(-5, 12), read: true, tone: 'success' },
    { id: 'n-11', audience: 'staff', category: 'System', title: 'Weekly report ready', body: 'Occupancy and arrears report for last week is ready to download.', meta: 'Reports', at: at(-6, 7), read: true, tone: 'neutral' },
    // tenant (Chidinma)
    { id: 'tn-1', audience: chi.id, category: 'My requests', title: 'Your request was marked as fixed.', body: 'Low water pressure (MR-2083). Please confirm it’s working.', meta: 'My requests', at: at(-1, 16, 40), read: false, tone: 'success', link: { name: 'myRequests' } },
    { id: 'tn-2', audience: chi.id, category: 'Announcement', title: 'Estate sanitation, Saturday.', body: 'Gates close to vehicles 7am–10am. Please keep walkways clear.', meta: 'Announcement · Palm Court Residences', at: at(-4, 9), read: false, tone: 'purple' },
    { id: 'tn-3', audience: chi.id, category: 'My requests', title: 'Plumber visiting Thursday, 2pm – 5pm.', body: 'AquaFix Plumbing will fix your water pressure.', meta: 'My requests · Grace Uche', at: at(-2, 11, 5), read: false, tone: 'warning' },
    { id: 'tn-4', audience: chi.id, category: 'Announcement', title: 'Generator servicing.', body: 'Power from the estate generator will be off Tuesday 10am–1pm.', meta: 'Announcement', at: at(-12, 8), read: true, tone: 'purple' },
    { id: 'tn-5', audience: chi.id, category: 'Leases', title: 'Receipt available.', body: 'Your rent and service charge receipt for 2026–27 is ready to download.', meta: 'Lease', at: at(-240, 10), read: true, tone: 'warning' },
  ];

  // ---------------- Activity logs ----------------
  const logs: ActivityLog[] = [
    { id: 'lg-1', at: at(0, 8, 31), user: 'Grace Uche', action: 'Set priority to High', record: 'MR-2087', area: 'Maintenance', device: '102.89.34.10 · Chrome, Windows' },
    { id: 'lg-2', at: at(0, 8, 14), user: 'Aisha Mohammed', action: 'Submitted maintenance request', record: 'MR-2087', area: 'Maintenance', device: 'Tenant app · Android' },
    { id: 'lg-3', at: at(0, 7, 52), user: 'Grace Uche', action: 'Assigned vendor Voltline Electricals', record: 'MR-2086', area: 'Maintenance', device: '102.89.34.10 · Chrome, Windows' },
    { id: 'lg-4', at: at(0, 7, 30), user: 'System', action: 'Lease signed electronically', record: 'LS-0412', area: 'Leases', device: '—' },
    { id: 'lg-5', at: at(0, 6, 0), user: 'System', action: 'Sent rent overdue reminders (8)', record: 'Batch 0924', area: 'Communications', device: '—' },
    { id: 'lg-6', at: at(-1, 17, 48), user: 'Femi Adewale', action: 'Changed rent for B11 to ₦2,400,000', record: 'Unit B11', area: 'Properties', device: '197.210.8.44 · Safari, macOS' },
    { id: 'lg-7', at: at(-1, 16, 5), user: 'Tobi Lawal', action: 'Approved tenant application', record: 'Kelechi Obi', area: 'Tenants', device: '105.112.20.7 · Chrome, Android' },
    { id: 'lg-8', at: at(-1, 14, 22), user: 'Rukayat Adebayo', action: 'Exported rent and arrears report', record: 'Jan–Sep 2026', area: 'Reports', device: '41.203.72.18 · Edge, Windows' },
    { id: 'lg-9', at: at(-1, 11, 10), user: 'Femi Adewale', action: 'Invited Bola Kuti as Property Manager', record: 'Wuse 2', area: 'Users', device: '197.210.8.44 · Safari, macOS' },
    { id: 'lg-10', at: at(-2, 19, 40), user: 'Grace Uche', action: 'Signed in from a new device', record: '—', area: 'Security', device: '102.89.40.2 · Safari, iOS' },
    { id: 'lg-11', at: at(-2, 15, 31), user: 'Tobi Lawal', action: 'Sent renewal offer', record: 'LS-0288', area: 'Leases', device: '105.112.20.7 · Chrome, Android' },
    { id: 'lg-12', at: at(-2, 9, 2), user: 'Femi Adewale', action: 'Added block C to Palm Court', record: 'Palm Court', area: 'Properties', device: '197.210.8.44 · Safari, macOS' },
  ];
  const logUsers = ['Grace Uche', 'Tobi Lawal', 'Femi Adewale', 'System', 'Rukayat Adebayo', 'Musa Danjuma'];
  const logActions: [string, ActivityLog['area']][] = [['Updated tenant contact details', 'Tenants'], ['Closed maintenance request', 'Maintenance'], ['Uploaded lease agreement', 'Leases'], ['Sent announcement', 'Communications'], ['Marked unit as vacant', 'Properties'], ['Signed in', 'Security']];
  for (let i = 0; i < 60; i++) {
    const [action, area] = logActions[i % logActions.length];
    logs.push({ id: `lg-x${i}`, at: at(-3 - Math.floor(i / 4), 8 + (i % 9), (i * 13) % 60), user: logUsers[i % logUsers.length], action, record: area === 'Maintenance' ? `MR-${2040 - i}` : area === 'Leases' ? `LS-0${150 + i}` : '—', area, device: '102.89.34.10 · Chrome, Windows' });
  }

  return {
    version: STATE_VERSION,
    sessionUserId: null,
    users, locations, properties, blocks, units, tenants, leases, requests, vendors,
    announcements, documents, notifications, payments, transactions: [], logs,
    settings: {
      orgName: 'Adewale Properties Ltd', rcNumber: 'RC 1482093', email: 'hello@propertyhub.ng', phone: '+234 1 700 2210',
      address: '14 Admiralty Way, Lekki Phase 1, Lagos', currency: 'Nigerian naira (₦)', timezone: 'West Africa Time (GMT+1)', dateFormat: '24 Sep 2026',
      response: { urgent: 1, high: 4, medium: 24, low: 72 }, selfReport: true, selfDocs: true, rateRepairs: false,
    },
    drafts: [],
    locationFilter: null,
  };
}

export const ALL_CATEGORIES = ALL_CATS;
