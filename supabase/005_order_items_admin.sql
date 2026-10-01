-- 005: let admins manage order lines (for "order by prescription" pricing).
drop policy if exists "items_admin_write" on order_items;
create policy "items_admin_write" on order_items for all
  using (is_admin()) with check (is_admin());
