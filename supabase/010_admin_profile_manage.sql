-- 010_admin_profile_manage.sql — run once in the Supabase SQL editor.
-- Lets admins change any profile's role (rider provisioning / revoke from the
-- admin panel), and closes the self role-escalation hole at the same time:
-- without the trigger, any signed-in user could update their OWN role to
-- 'admin' through the app.
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

create or replace function block_role_escalation() returns trigger as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists no_role_escalation on profiles;
create trigger no_role_escalation before update on profiles
  for each row execute function block_role_escalation();
