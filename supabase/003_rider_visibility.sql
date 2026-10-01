-- Riders need the delivery address and customer contact of orders assigned to them.
drop policy if exists "addresses_owner" on addresses;
create policy "addresses_owner" on addresses for all using (
  customer_id = auth.uid() or is_admin() or
  exists (select 1 from orders o
    where o.address_id = addresses.id and o.rider_id = auth.uid()));

drop policy if exists "profiles_self_read" on profiles;
create policy "profiles_read" on profiles for select using (
  id = auth.uid() or is_admin() or
  exists (select 1 from orders o
    where o.customer_id = profiles.id and o.rider_id = auth.uid()));
