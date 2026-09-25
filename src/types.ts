export type Role = 'super_admin' | 'manager' | 'tenant';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  phone: string;
  title: string;
  avatarColor: string;
  propertyIds?: string[]; // for managers
  tenantId?: string; // for tenant users
}

export interface Location {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
}

export interface Property {
  id: string;
  name: string;
  code: string;
  locationId: string;
  managerId: string;
  yearBuilt: number;
  description: string;
  amenities: string[];
  color: string;
}

export type UnitStatus = 'occupied' | 'vacant' | 'maintenance';
export type UnitType = 'Studio' | '1BR' | '2BR' | '3BR';

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  type: UnitType;
  bedrooms: number;
  bathrooms: number;
  rent: number; // monthly NGN
  status: UnitStatus;
  floor: number;
}

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  unitId: string;
  propertyId: string;
  occupation: string;
  avatarColor: string;
  joinedAt: string;
  emergencyContact: { name: string; phone: string; relationship: string };
  status: 'active' | 'former';
}

export type LeaseStatus = 'active' | 'expiring' | 'expired' | 'terminated';

export interface Lease {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  rent: number;
  deposit: number;
  termMonths: number;
  terminated?: boolean;
}

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceNote {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface MaintenanceRequest {
  id: string;
  unitId: string;
  propertyId: string;
  tenantId: string;
  title: string;
  description: string;
  category: 'Plumbing' | 'Electrical' | 'HVAC' | 'Structural' | 'Appliance' | 'Other';
  priority: Priority;
  status: MaintenanceStatus;
  createdAt: string;
  updatedAt: string;
  scheduledDate?: string;
  cost?: number;
  notes: MaintenanceNote[];
}

export interface Payment {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  amount: number;
  period: string; // 'YYYY-MM'
  dueDate: string;
  paidDate?: string;
  status: 'paid' | 'pending' | 'overdue';
  method?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface Conversation {
  id: string;
  tenantId: string;
  messages: Message[];
}

export type ActivityType = 'tenant' | 'lease' | 'maintenance' | 'payment' | 'property' | 'system';

export interface Activity {
  id: string;
  type: ActivityType;
  text: string;
  createdAt: string;
  actor: string;
}

export interface AppState {
  hydrated: boolean;
  sessionUserId: string | null;
  users: User[];
  locations: Location[];
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  maintenance: MaintenanceRequest[];
  payments: Payment[];
  conversations: Conversation[];
  activities: Activity[];
}

export interface OnboardTenantInput {
  name: string;
  phone: string;
  email: string;
  occupation: string;
  unitId: string;
  startDate: string;
  termMonths: number;
  rent: number;
  deposit: number;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
}

export interface NewRequestInput {
  unitId: string;
  tenantId: string;
  title: string;
  description: string;
  category: MaintenanceRequest['category'];
  priority: Priority;
}
