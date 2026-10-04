-- 019_default_address.sql — run once in the Supabase SQL editor (after 018).
-- Lets the customer pick their delivery address with a radio button on the
-- account page; checkout uses the chosen one. One default per customer.
alter table addresses add column if not exists is_default boolean not null default false;
drop index if exists addresses_one_default;
create unique index addresses_one_default on addresses (customer_id) where is_default;
