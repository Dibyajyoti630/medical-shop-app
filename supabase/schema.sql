-- Medical Shop Delivery — Supabase schema (pilot)
-- Run once in the Supabase SQL editor. Idempotent where cheap.
-- Stack: static HTML/JS + Supabase (auth, postgres, storage). No backend server.

create extension if not exists "pgcrypto";

-- ── Catalog ────────────────────────────────────────────────────────────────
-- Seeded from catalog/medicines-seed.csv (price/stock filled by shop via admin CSV import).
create table if not exists medicines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  composition text not null default '',
  strength text not null default '',
  form text not null,
  pack_size text not null default '',
  category text not null,
  rx_required boolean not null default false,
  price numeric(10,2),              -- null = not sellable yet (hidden from store)
  stock integer not null default 0,
  image_url text,                  -- null = generic form placeholder
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, strength)
);
create index if not exists medicines_name_idx on medicines (name);
create index if not exists medicines_category_idx on medicines (category);

-- ── Users: one profile row per auth user; role drives RLS ─────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','admin','rider')),
  name text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  label text not null default 'Home',
  address_text text not null,
  landmark text,
  created_at timestamptz not null default now()
);

-- ── Prescriptions ──────────────────────────────────────────────────────────
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  image_url text not null,         -- storage path prescriptions/<uid>/<file>
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Orders ─────────────────────────────────────────────────────────────────
-- Status flow: placed → [awaiting_rx] → confirmed → preparing → assigned →
-- picked_up → out_for_delivery → delivered. Cancelled any time before delivered.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  address_id uuid references addresses(id),
  prescription_id uuid references prescriptions(id),
  status text not null default 'placed' check (status in (
    'placed','awaiting_rx','confirmed','preparing','assigned',
    'picked_up','out_for_delivery','delivered','cancelled')),
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null default 'cod' check (payment_method in ('cod','upi')),
  delivery_slot text,
  rider_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_idx on orders (customer_id, created_at desc);
create index if not exists orders_status_idx on orders (status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  medicine_id uuid not null references medicines(id),
  qty integer not null check (qty > 0),
  unit_price numeric(10,2) not null
);
create index if not exists order_items_order_idx on order_items (order_id);

-- ── updated_at ─────────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists medicines_touch on medicines;
create trigger medicines_touch before update on medicines
  for each row execute function touch_updated_at();
drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table medicines enable row level security;
alter table profiles enable row level security;
alter table addresses enable row level security;
alter table prescriptions enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer stable;
create or replace function is_staff() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','rider'));
$$ language sql security definer stable;

-- medicines: public sees active + priced; admins manage everything
drop policy if exists "medicines_read" on medicines;
create policy "medicines_read" on medicines for select
  using ((is_active and price is not null) or is_admin());
drop policy if exists "medicines_admin" on medicines;
create policy "medicines_admin" on medicines for all using (is_admin());

-- profiles: own row; admins see all
drop policy if exists "profiles_self_read" on profiles;
create policy "profiles_self_read" on profiles for select
  using (id = auth.uid() or is_admin());
drop policy if exists "profiles_self_insert" on profiles;
create policy "profiles_self_insert" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

-- addresses: owner only
drop policy if exists "addresses_owner" on addresses;
create policy "addresses_owner" on addresses for all
  using (customer_id = auth.uid() or is_admin());

-- prescriptions: owner uploads/reads; admin reviews
drop policy if exists "rx_owner_read" on prescriptions;
create policy "rx_owner_read" on prescriptions for select
  using (customer_id = auth.uid() or is_admin());
drop policy if exists "rx_owner_insert" on prescriptions;
create policy "rx_owner_insert" on prescriptions for insert
  with check (customer_id = auth.uid());
drop policy if exists "rx_admin_update" on prescriptions;
create policy "rx_admin_update" on prescriptions for update using (is_admin());

-- orders: customer reads own; rider reads assigned; customer may only cancel early
drop policy if exists "orders_read" on orders;
create policy "orders_read" on orders for select
  using (customer_id = auth.uid() or rider_id = auth.uid() or is_admin());
drop policy if exists "orders_place" on orders;
create policy "orders_place" on orders for insert
  with check (customer_id = auth.uid());
drop policy if exists "orders_customer_cancel" on orders;
create policy "orders_customer_cancel" on orders for update
  using (customer_id = auth.uid() and status in ('placed','awaiting_rx','confirmed'))
  with check (customer_id = auth.uid() and status = 'cancelled');
drop policy if exists "orders_staff_update" on orders;
create policy "orders_staff_update" on orders for update
  using (is_admin() or rider_id = auth.uid());

-- order_items: follow the order's visibility; owner adds at placement
drop policy if exists "items_read" on order_items;
create policy "items_read" on order_items for select using (
  exists (select 1 from orders o where o.id = order_id
    and (o.customer_id = auth.uid() or o.rider_id = auth.uid())) or is_admin());
drop policy if exists "items_insert" on order_items;
create policy "items_insert" on order_items for insert with check (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid())
  or is_admin());

-- ── Storage: prescription images, private bucket ───────────────────────────
insert into storage.buckets (id, name, public)
values ('prescriptions','prescriptions', false)
on conflict (id) do nothing;

drop policy if exists "rx_upload" on storage.objects;
create policy "rx_upload" on storage.objects for insert
  with check (bucket_id = 'prescriptions'
    and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "rx_read" on storage.objects;
create policy "rx_read" on storage.objects for select
  using (bucket_id = 'prescriptions'
    and (auth.uid()::text = (storage.foldername(name))[1] or is_admin()));
