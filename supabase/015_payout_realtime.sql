-- 015_payout_realtime.sql — run once in the Supabase SQL editor (after 014).
-- Makes the rider's "Payout waiting" card appear instantly via realtime, and
-- hashes stored OTPs so riders can receive those realtime events without the
-- code itself ever being visible to them.
create extension if not exists pgcrypto;

-- One-time: hash OTPs stored in plaintext by 014.
update payouts set otp = crypt(otp, gen_salt('bf'))
 where status = 'pending' and otp not like '$2%';

create or replace function hash_payout_otp() returns trigger as $$
begin
  new.otp := crypt(new.otp, gen_salt('bf'));
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists payout_otp_hash on payouts;
create trigger payout_otp_hash before insert on payouts
  for each row execute function hash_payout_otp();

-- Riders may read their own payout rows (amount/status only in practice — the
-- code column holds a bcrypt hash, useless without the real code).
drop policy if exists "payouts_rider_read" on payouts;
create policy "payouts_rider_read" on payouts for select
  using (rider_id = auth.uid());

-- Same verify, now against the hash.
create or replace function confirm_payout(p_id uuid, p_otp text) returns boolean as $$
begin
  if not exists (select 1 from payouts p
                 where p.id = p_id and p.rider_id = auth.uid()
                 and p.status = 'pending' and p.otp = crypt(p_otp, p.otp)) then
    return false;
  end if;
  perform set_config('app.payout_bypass', '1', true);
  update payouts set status = 'confirmed' where id = p_id;
  update orders set fee_paid_to_rider = true
   where rider_id = auth.uid() and status = 'delivered' and fee_paid_to_rider = false;
  return true;
end; $$ language plpgsql security definer;

-- Instant rider updates without refresh.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payouts') then
    alter publication supabase_realtime add table public.payouts;
  end if;
end
$$;
