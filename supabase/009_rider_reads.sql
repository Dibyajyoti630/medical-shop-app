-- 009_rider_reads.sql — run once in the Supabase SQL editor.
-- Riders must see the customer name/phone and delivery address of the orders
-- assigned to them. Without these, the rider app's order cards come back blank.
drop policy if exists "profiles_rider_read" on profiles;
create policy "profiles_rider_read" on profiles for select
  using (exists (
    select 1 from orders o
    where o.customer_id = profiles.id and o.rider_id = auth.uid()
  ));

drop policy if exists "addresses_rider_read" on addresses;
create policy "addresses_rider_read" on addresses for select
  using (exists (
    select 1 from orders o
    where o.address_id = addresses.id and o.rider_id = auth.uid()
  ));
