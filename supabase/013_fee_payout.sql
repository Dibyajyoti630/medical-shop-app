-- 013_fee_payout.sql — run once in the Supabase SQL editor.
-- Tracks whether an order's delivery fee has been paid out to the rider.
alter table orders add column if not exists fee_paid_to_rider boolean not null default false;

-- Riders legitimately update their orders' status; stop anyone but an admin
-- from touching the payout columns (same pattern as 010's role guard).
create or replace function block_fee_tampering() returns trigger as $$
begin
  if (new.fee_paid_to_rider is distinct from old.fee_paid_to_rider
      or new.delivery_fee is distinct from old.delivery_fee)
     and not is_admin() then
    raise exception 'Only admins can change delivery fee payouts';
  end if;
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists no_fee_tampering on orders;
create trigger no_fee_tampering before update on orders
  for each row execute function block_fee_tampering();
