-- 007_realtime.sql — run once in the Supabase SQL editor.
-- Lets the admin panel receive instant notifications (new orders, new
-- prescriptions, stock changes) without manual refresh. Idempotent: safe to
-- run even if some tables were already added.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescriptions') then
    alter publication supabase_realtime add table public.prescriptions;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medicines') then
    alter publication supabase_realtime add table public.medicines;
  end if;
end
$$;
