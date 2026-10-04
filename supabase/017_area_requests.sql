-- 017_area_requests.sql — run once in the Supabase SQL editor (after 016).
-- Lets customers request delivery to a village not yet in the list.
-- The admin sets the fee (or rejects); the customer sees the decision live
-- on their account page. On approval the village is added to delivery_areas
-- and the customer's address is created automatically.
create table if not exists area_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  village_name text not null,
  pincode text not null,
  label text not null default 'Home',
  landmark text,
  address_text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  created_at timestamptz not null default now()
);

alter table area_requests enable row level security;
drop policy if exists "area_req_owner" on area_requests;
create policy "area_req_owner" on area_requests for all
  using (customer_id = auth.uid() or is_admin())
  with check (customer_id = auth.uid() or is_admin());

-- Customer sees approve/reject instantly on their account page.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'area_requests') then
    alter publication supabase_realtime add table public.area_requests;
  end if;
end
$$;
