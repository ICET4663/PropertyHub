-- PropertyHub initial schema.
-- Mirrors src/types.ts. IDs stay human-readable text (LS-0318, MR-2087, prop-palm) so the
-- existing screens keep working; only user profiles use uuids, because they are tied to auth.users.
-- Nested objects the app always reads as a whole (next of kin, prefs, art palette…) are jsonb.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('super_admin', 'manager', 'accountant', 'caretaker', 'tenant');
create type public.user_status as enum ('active', 'invited', 'suspended');
create type public.unit_status as enum ('occupied', 'vacant', 'maintenance');
create type public.tenant_status as enum ('active', 'pending', 'deactivated', 'former');
create type public.request_status as enum ('new', 'assigned', 'in_progress', 'resolved', 'closed');
create type public.priority as enum ('low', 'medium', 'high', 'urgent');

-- Human-readable codes for records created from now on (the seed uses lower numbers).
create sequence public.tenant_code_seq start 1000;
create sequence public.lease_code_seq start 1000;
create sequence public.request_code_seq start 3000;

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  legacy_id text unique,                 -- seed user id (u-femi…) so seeded rows can be linked
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  role public.app_role not null default 'tenant',
  access text not null default '',       -- human label, e.g. "All locations"
  tenant_id text,                        -- FK added after tenants exists
  two_step boolean not null default false,
  last_active timestamptz not null default now(),
  status public.user_status not null default 'active',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- portfolio
create table public.locations (
  id text primary key default 'loc-' || substr(gen_random_uuid()::text, 1, 8),
  name text not null,
  area text not null default '',
  city text not null default '',
  state text not null default '',
  description text not null default '',
  manager_id uuid references public.profiles (id) on delete set null
);

create table public.properties (
  id text primary key default 'prop-' || substr(gen_random_uuid()::text, 1, 8),
  name text not null,
  short text not null,
  type text not null check (type in ('Apartment complex', 'Luxury apartments', 'Block of flats', 'Estate', 'Serviced apartments')),
  location_id text not null references public.locations (id),
  address text not null default '',
  manager_id uuid references public.profiles (id) on delete set null,
  added_at date not null default current_date,
  description text not null default '',
  amenities text[] not null default '{}',
  art jsonb not null default '{"bg":"#DCE7E1","a":"#2F5D4B","b":"#8A6A34"}',
  status text not null default 'active' check (status in ('active', 'archived'))
);

-- Which properties a manager / caretaker may work on (User.propertyIds in the app).
create table public.profile_properties (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  property_id text not null references public.properties (id) on delete cascade,
  primary key (profile_id, property_id)
);

create table public.blocks (
  id text primary key default 'blk-' || substr(gen_random_uuid()::text, 1, 8),
  property_id text not null references public.properties (id) on delete cascade,
  name text not null,
  floors int not null default 1
);

create table public.units (
  id text primary key default 'unit-' || substr(gen_random_uuid()::text, 1, 8),
  property_id text not null references public.properties (id) on delete cascade,
  block_id text not null references public.blocks (id) on delete cascade,
  code text not null,
  floor int not null default 0,
  type text not null check (type in ('Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', 'Duplex')),
  bathrooms int not null default 1,
  size_sqm int not null default 0,
  rent bigint not null default 0,            -- annual, NGN
  service_charge bigint not null default 0,  -- annual, NGN
  deposit bigint not null default 0,
  status public.unit_status not null default 'vacant',
  features text[] not null default '{}',
  vacant_since date,
  vacant_note text check (vacant_note in ('Listed', 'Viewing booked', 'Repairs')),
  unique (property_id, code)
);

-- ---------------------------------------------------------------- tenants & leases
create table public.tenants (
  id text primary key default 'ten-' || substr(gen_random_uuid()::text, 1, 8),
  code text not null unique default 'TN-' || lpad(nextval('public.tenant_code_seq')::text, 5, '0'),
  name text not null,
  email text not null default '',
  phone text not null default '',
  whatsapp text,
  dob date,
  gender text check (gender in ('Male', 'Female')),
  address text not null default '',
  unit_id text references public.units (id) on delete set null,
  property_id text references public.properties (id) on delete set null,
  status public.tenant_status not null default 'pending',
  onboarding text not null default 'pending' check (onboarding in ('approved', 'pending', 'draft')),
  self_signup boolean not null default false,
  joined_at date not null default current_date,
  language text not null default 'English',
  next_of_kin jsonb not null default '{}',
  employment jsonb not null default '{}',
  identification jsonb not null default '{}',
  prefs jsonb not null default '{"smsUpdates":true,"emailAnnouncements":true,"whatsapp":false}'
);

alter table public.profiles
  add constraint profiles_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete set null;

create table public.leases (
  id text primary key default 'LS-' || lpad(nextval('public.lease_code_seq')::text, 4, '0'),
  tenant_id text not null references public.tenants (id) on delete cascade,
  unit_id text not null references public.units (id),
  property_id text not null references public.properties (id),
  start_date date not null,
  end_date date not null,
  rent bigint not null,
  service_charge bigint not null default 0,
  deposit bigint not null default 0,
  term_months int not null default 12,
  notice_months int not null default 3,
  payment_cycle text not null default 'Annually, in advance',
  created_by text not null default '',      -- display name, as in the app
  terminated boolean not null default false,
  renewed_to text references public.leases (id) on delete set null,
  renewed_from text references public.leases (id) on delete set null,
  draft boolean not null default false,
  agreement text not null default '',       -- file name / storage path
  signed boolean not null default false,
  tenant_intent text check (tenant_intent in ('renew', 'move_out')),
  reminders jsonb not null default '[]',    -- Reminder[]
  check (end_date >= start_date)
);

create table public.payments (
  id text primary key default 'pay-' || substr(gen_random_uuid()::text, 1, 8),
  tenant_id text not null references public.tenants (id) on delete cascade,
  lease_id text references public.leases (id) on delete set null,
  label text not null,
  amount bigint not null,
  date date not null,
  method text not null default '',
  status text not null check (status in ('paid', 'overdue', 'pending'))
);

create table public.onboarding_drafts (
  id text primary key default 'draft-' || substr(gen_random_uuid()::text, 1, 8),
  step int not null default 0,
  started_by text not null default '',
  saved_at timestamptz not null default now(),
  personal jsonb not null default '{}',
  kin jsonb not null default '{}',
  employment jsonb not null default '{}',
  id_details jsonb not null default '{}',   -- OnboardingDraft.id_
  allocation jsonb not null default '{}',
  lease jsonb not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------- maintenance
create table public.vendors (
  id text primary key default 'ven-' || substr(gen_random_uuid()::text, 1, 8),
  name text not null,
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  trade text not null,
  coverage text not null default '',
  completed int not null default 0,
  avg_days numeric(5, 1) not null default 0,
  rating numeric(3, 1) not null default 0,
  rating_count int not null default 0,
  status text not null default 'active' check (status in ('active', 'paused')),
  spend_this_month bigint not null default 0
);

create table public.maintenance_requests (
  id text primary key default 'MR-' || nextval('public.request_code_seq')::text,
  tenant_id text not null references public.tenants (id) on delete cascade,
  unit_id text not null references public.units (id),
  property_id text not null references public.properties (id),
  category text not null,
  title text not null,
  description text not null default '',
  room text not null default '',            -- MaintenanceRequest.where
  priority public.priority not null default 'medium',
  status public.request_status not null default 'new',
  vendor_id text references public.vendors (id) on delete set null,
  visit jsonb,                              -- { date, window }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  photos int not null default 0,
  access text not null default '',
  caretaker_access boolean not null default false,
  estimate bigint,
  cost bigint,
  rating int check (rating between 1 and 5)
);

create table public.request_events (
  id text primary key default 'ev-' || substr(gen_random_uuid()::text, 1, 12),
  request_id text not null references public.maintenance_requests (id) on delete cascade,
  kind text not null check (kind in ('created', 'priority', 'vendor', 'status', 'comment', 'waiting')),
  text text not null,
  by_name text not null default '',         -- RequestEvent.by
  at timestamptz not null default now(),
  internal boolean not null default false,  -- staff-only notes, hidden from tenants
  shared boolean not null default false
);

-- ---------------------------------------------------------------- communications & records
create table public.announcements (
  id text primary key default 'ann-' || substr(gen_random_uuid()::text, 1, 8),
  subject text not null,
  message text not null,
  audience text not null,
  property_id text references public.properties (id) on delete set null,
  channels text[] not null default '{}',
  sent_at timestamptz not null default now(),
  recipients int not null default 0,
  read_pct int not null default 0,
  scheduled_for timestamptz,
  status text not null default 'sent' check (status in ('sent', 'scheduled', 'template')),
  by_name text not null default ''
);

create table public.documents (
  id text primary key default 'doc-' || substr(gen_random_uuid()::text, 1, 8),
  name text not null,
  kind text not null check (kind in ('pdf', 'jpg', 'doc')),
  folder text not null check (folder in ('Lease agreements', 'Tenant ID and KYC', 'Receipts', 'Property papers', 'Maintenance', 'Vendor contracts')),
  linked_to text not null default '',
  tenant_id text references public.tenants (id) on delete cascade,
  property_id text references public.properties (id) on delete cascade,
  uploaded_by text not null default '',
  date date not null default current_date,
  size_kb int not null default 0,
  expires date,
  storage_path text                         -- object path in the `documents` bucket, once uploaded
);

create table public.notifications (
  id text primary key default 'ntf-' || substr(gen_random_uuid()::text, 1, 12),
  audience text not null,                   -- 'staff' or a tenant id
  category text not null,
  title text not null,
  body text not null default '',
  meta text not null default '',
  at timestamptz not null default now(),
  read boolean not null default false,
  tone text not null default 'neutral' check (tone in ('danger', 'warning', 'success', 'info', 'purple', 'neutral')),
  link jsonb
);

create table public.activity_logs (
  id text primary key default 'lg-' || substr(gen_random_uuid()::text, 1, 12),
  at timestamptz not null default now(),
  user_name text not null default '',       -- ActivityLog.user
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  action text not null,
  record text not null default '',
  area text not null check (area in ('Maintenance', 'Leases', 'Communications', 'Properties', 'Tenants', 'Reports', 'Users', 'Security')),
  device text not null default ''
);

create table public.org_settings (
  id boolean primary key default true check (id),   -- single row
  org_name text not null default '',
  rc_number text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  currency text not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  date_format text not null default 'DD MMM YYYY',
  response jsonb not null default '{"urgent":1,"high":4,"medium":24,"low":72}',
  self_report boolean not null default true,
  self_docs boolean not null default true,
  rate_repairs boolean not null default false
);
insert into public.org_settings default values;

-- ---------------------------------------------------------------- indexes for common lookups
create index on public.properties (location_id);
create index on public.units (property_id);
create index on public.units (block_id);
create index on public.tenants (property_id);
create index on public.tenants (unit_id);
create index on public.leases (tenant_id);
create index on public.leases (property_id);
create index on public.leases (end_date);
create index on public.payments (tenant_id);
create index on public.maintenance_requests (property_id, status);
create index on public.maintenance_requests (tenant_id);
create index on public.request_events (request_id, at);
create index on public.documents (tenant_id);
create index on public.documents (property_id);
create index on public.notifications (audience, at desc);
create index on public.activity_logs (at desc);

-- keep maintenance_requests.updated_at fresh
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger maintenance_requests_touch before update on public.maintenance_requests
  for each row execute function public.touch_updated_at();
