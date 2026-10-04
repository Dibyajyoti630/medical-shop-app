-- 018_notifications.sql — run once in the Supabase SQL editor (after 017).
-- Real notification center for customers: order updates, area-request
-- decisions and prescription decisions land here via triggers, and the
-- customer app's bell shows them live with an unread badge.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text, -- customer page hint: 'orders' | 'account' | 'rxupload'
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
drop policy if exists "notif_owner" on notifications;
create policy "notif_owner" on notifications for all
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- Area requests: new ones ping every admin; decisions ping the customer.
create or replace function trg_notify_area_request() returns trigger as $$
declare admin_id uuid;
begin
  if TG_OP = 'INSERT' then
    for admin_id in select id from profiles where role = 'admin' loop
      insert into notifications (user_id, title, body, link)
      values (admin_id, 'New area request', NEW.village_name || ' — ' || NEW.pincode, null);
    end loop;
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if NEW.status = 'approved' then
      insert into notifications (user_id, title, body, link)
      values (NEW.customer_id, 'We now deliver to ' || NEW.village_name,
              'Your address was added — you can place your order.', 'account');
    elsif NEW.status = 'rejected' then
      insert into notifications (user_id, title, body, link)
      values (NEW.customer_id, 'Cannot deliver to ' || NEW.village_name || ' yet',
              coalesce(nullif(NEW.note, ''), 'The shop will review this area again later.'), 'account');
    end if;
  end if;
  return NEW;
end; $$ language plpgsql security definer;

drop trigger if exists notify_area_request on area_requests;
create trigger notify_area_request after insert or update on area_requests
  for each row execute function trg_notify_area_request();

-- Orders: status changes ping the customer (only the meaningful ones).
create or replace function trg_notify_order() returns trigger as $$
declare msg text;
begin
  if NEW.status is distinct from OLD.status then
    msg := case NEW.status
      when 'confirmed' then 'Your order is confirmed'
      when 'preparing' then 'Your order is being packed'
      when 'awaiting_rx' then 'Please upload your prescription'
      when 'out_for_delivery' then 'Your medicines are on the way'
      when 'delivered' then 'Order delivered — thank you!'
      when 'cancelled' then 'Your order was cancelled'
      else null end;
    if msg is not null then
      insert into notifications (user_id, title, body, link)
      values (NEW.customer_id, msg, 'Order ' || left(NEW.id::text, 8), 'orders');
    end if;
  end if;
  return NEW;
end; $$ language plpgsql security definer;

drop trigger if exists notify_order on orders;
create trigger notify_order after update on orders
  for each row execute function trg_notify_order();

-- Prescriptions: decisions ping the customer.
create or replace function trg_notify_prescription() returns trigger as $$
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status = 'approved' then
      insert into notifications (user_id, title, body, link)
      values (NEW.customer_id, 'Prescription approved', 'You can now order these medicines.', 'rxupload');
    elsif NEW.status = 'rejected' then
      insert into notifications (user_id, title, body, link)
      values (NEW.customer_id, 'Prescription was not approved',
              'Please upload a clearer photo of the prescription.', 'rxupload');
    end if;
  end if;
  return NEW;
end; $$ language plpgsql security definer;

drop trigger if exists notify_prescription on prescriptions;
create trigger notify_prescription after update on prescriptions
  for each row execute function trg_notify_prescription();

-- Live badge + instant dropdown updates.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
