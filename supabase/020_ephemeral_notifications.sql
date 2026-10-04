-- 020_ephemeral_notifications.sql — run once in the Supabase SQL editor.
-- Customer notifications are now live-only (no stored inbox): drop the
-- notifications table + triggers from 018 (safe to run even if 018 never ran).
-- Realtime UPDATE events need the full old row so the app can detect
-- status changes, hence replica identity full on the three tables.
drop trigger if exists notify_area_request on area_requests;
drop trigger if exists notify_order on orders;
drop trigger if exists notify_prescription on prescriptions;
drop function if exists trg_notify_area_request();
drop function if exists trg_notify_order();
drop function if exists trg_notify_prescription();
drop table if exists notifications;

alter table orders replica identity full;
alter table area_requests replica identity full;
alter table prescriptions replica identity full;
