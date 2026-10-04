-- 016_delivery_areas.sql — run once in the Supabase SQL editor.
-- Village-wise delivery fees (no more geocoder guessing): the customer picks
-- their village, the fee comes straight from this table.
-- Seed data: Boss's verified 20km village fee list (Utarpara reference).
-- Fee slabs: 0–5 km = Rs 30 | >5–10 km = Rs 50 | >10–20 km = Rs 80.
create table if not exists delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pincode text not null,
  distance_km numeric(5,1) not null,
  fee numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table delivery_areas enable row level security;
drop policy if exists "areas_read" on delivery_areas;
create policy "areas_read" on delivery_areas for select using (true);
drop policy if exists "areas_admin" on delivery_areas;
create policy "areas_admin" on delivery_areas for all
  using (is_admin()) with check (is_admin());

alter table addresses add column if not exists area_id uuid references delivery_areas(id);

insert into delivery_areas (name, pincode, distance_km, fee) values
  ('Utarpara', '756026', 0, 30),
  ('Khalabaria', '756026', 0.9, 30),
  ('Chitmishra', '756032', 1.1, 30),
  ('Rela', '756026', 1.2, 30),
  ('Kasida', '756032', 1.3, 30),
  ('Balkiabar', '756032', 1.9, 30),
  ('Paikasida', '756086', 1.7, 30),
  ('Chakmadhab', '756032', 1.5, 30),
  ('Sankasida', '756032', 2, 30),
  ('Paschimbar', '756027', 2.5, 30),
  ('Namkana', '756032', 2.2, 30),
  ('Podpada', '756032', 2.6, 30),
  ('Sultanpur', '756032', 2.7, 30),
  ('Gouribelda', '756032', 3, 30),
  ('Sulsunda', '756032', 3.2, 30),
  ('Jamalpur', '756032', 3.5, 30),
  ('Jampur', '756032', 4, 30),
  ('Kespura', '756088', 4, 30),
  ('Kismatroutpara', '756032', 4.5, 30),
  ('Bararoutpara', '756086', 5, 30),
  ('Kasimpur', '756032', 5.5, 50),
  ('Basulia', '756086', 6, 50),
  ('Badasimulia', '756026', 6.5, 50),
  ('Panchurukhi', '756026', 7, 50),
  ('Ghantiary', '756026', 7.5, 50),
  ('Ghantua', '756023', 8, 50),
  ('Machharanka Simulia', '756023', 8.5, 50),
  ('Nikhira', '756023', 9, 50),
  ('Kumbhari', '756023', 9.5, 50),
  ('Khalamuhani', '756023', 10, 50),
  ('Srirampur Road', '756023', 10.5, 80),
  ('Baliapal', '756026', 12, 80),
  ('Jaleswarpur', '756036', 16.8, 80),
  ('Nampo', '756034', 8.4, 50),
  ('Khuluda', '756034', 3.9, 30)
on conflict (name) do update set
  pincode = excluded.pincode,
  distance_km = excluded.distance_km,
  fee = excluded.fee;
