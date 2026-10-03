-- 012_delivery_zone.sql — run once in the Supabase SQL editor.
-- Stores a geocoded point on each address so delivery fees can be computed
-- from the shop's distance, and out-of-zone addresses can be blocked.
alter table addresses add column if not exists lat double precision;
alter table addresses add column if not exists lon double precision;
