-- 011_rider_password_and_delivery_otp.sql — run once in the Supabase SQL editor.
-- 1) Riders created by the admin must set their own password on first sign-in.
-- 2) Every order gets a 4-digit delivery code; the rider must enter the
--    customer's code to mark the order delivered.
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table orders add column if not exists delivery_otp text;
