-- 014_payout_otp.sql — run once in the Supabase SQL editor (after 013).
-- Authentic payout settlement: admin generates a 4-digit code for a rider's
-- pending fees; the rider enters it in their app to confirm receipt. Only then
-- are the orders flipped to paid. Everything stays reversible: a pending payout
-- can be cancelled, and paid orders can be marked unpaid again per order.
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles(id) on delete cascade,
  amount numeric(10,2) not null,
  otp text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);
create unique index if not exists payouts_one_pending on payouts (rider_id) where status = 'pending';

alter table payouts enable row level security;
drop policy if exists "payouts_admin" on payouts;
create policy "payouts_admin" on payouts for all using (is_admin());
-- No rider policy: riders reach payouts only through the RPCs below, so the
-- code itself is never visible to them before the admin shares it.

create or replace function my_pending_payout()
returns table (id uuid, amount numeric(10,2), created_at timestamptz) as $$
  select p.id, p.amount, p.created_at from payouts p
  where p.rider_id = auth.uid() and p.status = 'pending'
  order by p.created_at desc limit 1;
$$ language sql security definer;

create or replace function confirm_payout(p_id uuid, p_otp text) returns boolean as $$
begin
  if not exists (select 1 from payouts
                 where id = p_id and rider_id = auth.uid()
                 and status = 'pending' and otp = p_otp) then
    return false;
  end if;
  -- Trusted path: let the payout trigger-guard below know this is legit.
  perform set_config('app.payout_bypass', '1', true);
  update payouts set status = 'confirmed' where id = p_id;
  update orders set fee_paid_to_rider = true
   where rider_id = auth.uid() and status = 'delivered' and fee_paid_to_rider = false;
  return true;
end; $$ language plpgsql security definer;

-- Same guard as 013, plus the trusted confirm_payout() path.
create or replace function block_fee_tampering() returns trigger as $$
begin
  if (new.fee_paid_to_rider is distinct from old.fee_paid_to_rider
      or new.delivery_fee is distinct from old.delivery_fee)
     and not is_admin()
     and current_setting('app.payout_bypass', true) is distinct from '1' then
    raise exception 'Only admins can change delivery fee payouts';
  end if;
  return new;
end; $$ language plpgsql security definer;
