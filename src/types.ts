export type Role = 'super_admin' | 'manager' | 'accountant' | 'caretaker' | 'tenant';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  access: string; // human label e.g. "All locations"
  propertyIds?: string[]; // scope for managers / caretakers
  tenantId?: string;
  twoStep: boolean;
  lastActive: string; // ISO
  status: 'active' | 'invited' | 'suspended';
}

export interface Location {
  id: string;
  name: string;
  area: string; // street/corridor
  city: string;
  state: string;
  description: string;
  managerId: string;
}

export type PropertyType = 'Apartment complex' | 'Luxury apartments' | 'Block of flats' | 'Estate' | 'Serviced apartments';

export interface Property {
  id: string;
  name: string;
  short: string;
  type: PropertyType;
  locationId: string;
  address: string;
  managerId: string;
  addedAt: string;
  description: string;
  amenities: string[];
  art: { bg: string; a: string; b: string }; // illustration palette
  status: 'active' | 'archived';
}

export interface Block {
  id: string;
  propertyId: string;
  name: string; // "Block A"
  floors: number;
}

export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';
export type UnitType = 'Studio' | '1 Bedroom' | '2 Bedroom' | '3 Bedroom' | 'Duplex';

export interface Unit {
  id: string;
  propertyId: string;
  blockId: string;
  code: string; // "A4"
  floor: number; // 0 = ground
  type: UnitType;
  bathrooms: number;
  sizeSqm: number;
  rent: number; // annual NGN
  serviceCharge: number; // annual NGN
  deposit: number;
  status: UnitStatus;
  features: string[];
  vacantSince?: string;
  vacantNote?: 'Listed' | 'Viewing booked' | 'Repairs';
}

export type TenantStatus = 'active' | 'pending' | 'deactivated' | 'former';

export interface Tenant {
  id: string;
  code: string; // TN-00412
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  dob: string;
  gender: 'Male' | 'Female';
  address: string; // previous / residential
  unitId?: string;
  propertyId?: string;
  status: TenantStatus;
  onboarding: 'approved' | 'pending' | 'draft';
  selfSignup?: boolean;
  joinedAt: string;
  language: string;
  nextOfKin: { name: string; relationship: string; phone: string; email?: string; address: string };
  employment: { status: 'Employed' | 'Self-employed' | 'Student' | 'Retired' | 'Unemployed'; employer: string; occupation: string; workAddress: string };
  identification: { type: string; number: string; verified: boolean };
  prefs: { smsUpdates: boolean; emailAnnouncements: boolean; whatsapp: boolean };
}

export interface Reminder {
  label: string; // "90-day renewal reminder"
  channels: string; // "Email · SMS"
  date: string;
  status: 'Read' | 'Delivered' | 'Scheduled';
}

export interface Lease {
  id: string; // LS-0318
  tenantId: string;
  unitId: string;
  propertyId: string;
  start: string;
  end: string;
  rent: number; // annual
  serviceCharge: number;
  deposit: number;
  termMonths: number;
  noticeMonths: number;
  paymentCycle: string;
  createdBy: string;
  terminated?: boolean;
  renewedTo?: string; // id of the lease that replaced this one
  renewedFrom?: string;
  draft?: boolean;
  agreement: string; // file name
  signed: boolean;
  tenantIntent?: 'renew' | 'move_out';
  reminders: Reminder[];
}

export type LeaseStatus = 'active' | 'expiring' | 'expired' | 'terminated' | 'renewed' | 'draft';

export type RequestStatus = 'new' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'disputed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Category =
  | 'Plumbing' | 'Electrical' | 'Air conditioning' | 'Generator' | 'Water supply'
  | 'Building repairs' | 'Security' | 'Cleaning' | 'Pests' | 'Other';

export interface RequestEvent {
  id: string;
  kind: 'created' | 'priority' | 'vendor' | 'status' | 'comment' | 'waiting';
  text: string;
  by: string;
  at: string;
  internal?: boolean;
  shared?: boolean;
  actorId?: string; // profile that made the change, set by the server
}

export interface MaintenanceRequest {
  id: string; // MR-2087
  tenantId: string;
  unitId: string;
  propertyId: string;
  category: Category;
  title: string;
  description: string;
  where: string; // room
  priority: Priority;
  status: RequestStatus;
  vendorId?: string;
  caretakerId?: string; // profile id
  visit?: { date: string; window: string };
  disputeReason?: string;
  clientKey?: string; // idempotency key of the submission that created it
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  photos: number;
  access: string;
  caretakerAccess: boolean;
  estimate?: number;
  cost?: number;
  rating?: number;
  events: RequestEvent[];
}

export interface Vendor {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  trade: Category;
  coverage: string;
  completed: number;
  avgDays: number;
  rating: number;
  ratingCount: number;
  status: 'active' | 'paused';
  spendThisMonth: number;
}

export interface Announcement {
  id: string;
  subject: string;
  message: string;
  audience: string;
  propertyId?: string;
  channels: ('In-app' | 'Email' | 'SMS' | 'WhatsApp')[];
  sentAt: string;
  recipients: number;
  readPct: number;
  scheduledFor?: string;
  status: 'sent' | 'scheduled' | 'template';
  by: string;
}

export interface DocFile {
  id: string;
  name: string;
  kind: 'pdf' | 'jpg' | 'doc';
  folder: 'Lease agreements' | 'Tenant ID and KYC' | 'Receipts' | 'Property papers' | 'Maintenance' | 'Vendor contracts';
  linkedTo: string;
  tenantId?: string;
  propertyId?: string;
  uploadedBy: string;
  date: string;
  sizeKb: number;
  expires?: string;
  storagePath?: string; // object in the `documents` bucket; older seeded records have none
}

export type NotifCategory = 'Maintenance' | 'Leases' | 'Rent' | 'Tenants' | 'System' | 'Announcement' | 'My requests';

export interface AppNotification {
  id: string;
  audience: 'staff' | string; // 'staff' or a tenantId
  category: NotifCategory;
  title: string;
  body: string;
  meta: string;
  at: string;
  read: boolean;
  tone: 'danger' | 'warning' | 'success' | 'info' | 'purple' | 'neutral';
  link?: { name: string; params?: Record<string, string> };
}

export interface Payment {
  id: string;
  tenantId: string;
  leaseId: string;
  label: string;
  amount: number;
  date: string;
  method: string;
  status: 'paid' | 'overdue' | 'pending';
  /** Set by the server when Paystack confirms; charges paid by hand have neither. */
  paidAt?: string;
  reference?: string;
}

export type PaystackStatus = 'pending' | 'success' | 'failed' | 'abandoned' | 'refunded';

/** One attempt to pay a charge through Paystack. Written only by the server. */
export interface PaystackTransaction {
  reference: string;
  paymentId: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: PaystackStatus;
  channel?: string;
  fees?: number;
  gatewayResponse?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  at: string;
  user: string;
  action: string;
  record: string;
  area: 'Maintenance' | 'Leases' | 'Communications' | 'Properties' | 'Tenants' | 'Reports' | 'Users' | 'Security';
  device: string;
}

export interface Settings {
  orgName: string;
  rcNumber: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  response: Record<Priority, number>; // hours
  selfReport: boolean;
  selfDocs: boolean;
  rateRepairs: boolean;
}

export interface OnboardingDraft {
  id: string;
  step: number;
  startedBy: string;
  savedAt: string;
  personal: { name: string; phone: string; email: string; address: string; dob: string; gender: 'Male' | 'Female' };
  kin: { name: string; relationship: string; phone: string; email: string; address: string };
  employment: { status: Tenant['employment']['status']; employer: string; occupation: string; workAddress: string };
  id_: { type: string; number: string; docUploaded: boolean; photoUploaded: boolean };
  allocation: { locationId: string; propertyId: string; blockId: string; unitId: string };
  lease: { start: string; end: string; agreementUploaded: boolean };
}

export interface AppState {
  version: number;
  sessionUserId: string | null;
  users: User[];
  locations: Location[];
  properties: Property[];
  blocks: Block[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  requests: MaintenanceRequest[];
  vendors: Vendor[];
  announcements: Announcement[];
  documents: DocFile[];
  notifications: AppNotification[];
  payments: Payment[];
  transactions: PaystackTransaction[];
  logs: ActivityLog[];
  settings: Settings;
  drafts: OnboardingDraft[];
  locationFilter: string | null; // topbar "Viewing"
}
