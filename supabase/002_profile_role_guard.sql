-- Tighten profile creation: users can only ever insert themselves as 'customer'.
-- Admin/rider roles are granted afterwards via SQL by an existing admin, e.g.
--   update profiles set role='admin' where id='<auth-user-uuid>';
drop policy if exists "profiles_self_insert" on profiles;
create policy "profiles_self_insert" on profiles for insert
  with check (id = auth.uid() and role = 'customer');
