-- ============================================================
-- ECORoute — schéma Supabase (PostgreSQL)
-- À coller dans : Supabase Dashboard > SQL Editor > New query > Run
-- Ce fichier consolide toutes les tables, colonnes et règles de
-- sécurité du projet — un seul script pour repartir de zéro.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILS ----------
-- Un profil par compte (auth.users). Le rôle (client/chauffeur) est
-- choisi une fois à l'inscription et ne change plus dans l'app.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null,
  nom text not null,
  tel text not null,
  verified boolean not null default false,
  driver_verified boolean not null default false,
  role text not null default 'client' check (role in ('client','chauffeur')),
  created_at timestamptz not null default now()
);

-- ---------- DÉTAILS CHAUFFEUR ----------
-- Restés privés (permis, plaque) — seul le propriétaire les lit.
create table driver_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  license_number text not null,
  plate text not null,
  vehicle_type text not null default 'bache',
  created_at timestamptz not null default now()
);

-- ---------- TRAJETS (publiés par un chauffeur) ----------
create table trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles(id) on delete cascade,
  origin text not null,
  destination text not null,
  date date not null,
  vehicle_type text not null default 'bache',
  capacity numeric not null,
  remaining numeric not null,
  price numeric,
  origin_lat double precision,
  origin_lon double precision,
  dest_lat double precision,
  dest_lon double precision,
  distance_km numeric,
  duration_min numeric,
  created_at timestamptz not null default now()
);

-- ---------- RÉSERVATIONS (un client réserve sur un trajet publié) ----------
create table reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  m3 numeric not null,
  status text not null default 'en_attente'
    check (status in ('en_attente','validee','en_route','terminee','refusee','annulee')),
  rating smallint check (rating between 1 and 5),
  started_at timestamptz,
  eta_minutes numeric,
  created_at timestamptz not null default now()
);

-- ---------- DEMANDES (postées par un client, marché inversé) ----------
create table requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  origin text not null,
  destination text not null,
  date date not null,
  m3_needed numeric not null,
  note text,
  origin_lat double precision,
  origin_lon double precision,
  dest_lat double precision,
  dest_lon double precision,
  distance_km numeric,
  duration_min numeric,
  status text not null default 'ouverte'
    check (status in ('ouverte','prise_en_charge','annulee')),
  created_at timestamptz not null default now()
);

-- ---------- PROPOSITIONS (un chauffeur répond à une demande) ----------
create table request_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  driver_id uuid not null references profiles(id) on delete cascade,
  vehicle_type text not null default 'bache',
  status text not null default 'proposee'
    check (status in ('proposee','acceptee','refusee')),
  created_at timestamptz not null default now()
);

-- ---------- MESSAGES (chat, rattaché à une réservation OU une proposition) ----------
create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_type text not null check (thread_type in ('reservation','offer')),
  thread_id uuid not null,
  sender_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on messages(thread_type, thread_id, created_at);

-- ============================================================
-- SÉCURITÉ (Row Level Security)
-- ============================================================
alter table profiles enable row level security;
alter table driver_profiles enable row level security;
alter table trips enable row level security;
alter table reservations enable row level security;
alter table requests enable row level security;
alter table request_offers enable row level security;
alter table messages enable row level security;

create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

create policy "driver_profiles_select_own" on driver_profiles for select using (auth.uid() = id);
create policy "driver_profiles_insert_own" on driver_profiles for insert with check (auth.uid() = id);
create policy "driver_profiles_update_own" on driver_profiles for update using (auth.uid() = id);

create policy "trips_select_all" on trips for select using (true);
create policy "trips_insert_own" on trips for insert with check (auth.uid() = driver_id);
create policy "trips_update_own" on trips for update using (auth.uid() = driver_id);

create policy "reservations_select_participants" on reservations for select using (
  auth.uid() = client_id
  or auth.uid() = (select driver_id from trips where trips.id = reservations.trip_id)
);
create policy "reservations_insert_client" on reservations for insert with check (auth.uid() = client_id);
create policy "reservations_update_participants" on reservations for update using (
  auth.uid() = client_id
  or auth.uid() = (select driver_id from trips where trips.id = reservations.trip_id)
);

create policy "requests_select_all" on requests for select using (true);
create policy "requests_insert_own" on requests for insert with check (auth.uid() = client_id);
create policy "requests_update_own" on requests for update using (auth.uid() = client_id);

create policy "offers_select_participants" on request_offers for select using (
  auth.uid() = driver_id
  or auth.uid() = (select client_id from requests where requests.id = request_offers.request_id)
);
create policy "offers_insert_driver" on request_offers for insert with check (auth.uid() = driver_id);
create policy "offers_update_participants" on request_offers for update using (
  auth.uid() = driver_id
  or auth.uid() = (select client_id from requests where requests.id = request_offers.request_id)
);

create policy "messages_select_participants" on messages for select using (
  (thread_type = 'reservation' and (
    auth.uid() = (select client_id from reservations where reservations.id = thread_id)
    or auth.uid() = (select driver_id from trips where trips.id = (select trip_id from reservations where reservations.id = thread_id))
  ))
  or
  (thread_type = 'offer' and (
    auth.uid() = (select driver_id from request_offers where request_offers.id = thread_id)
    or auth.uid() = (select client_id from requests where requests.id = (select request_id from request_offers where request_offers.id = thread_id))
  ))
);
create policy "messages_insert_sender" on messages for insert with check (auth.uid() = sender_id);

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table trips, reservations, requests, request_offers, messages, profiles;
