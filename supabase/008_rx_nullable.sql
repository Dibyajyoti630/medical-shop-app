-- 008_rx_nullable.sql — run once in the Supabase SQL editor.
-- Approval requests (customer has no prescription; chemist approves over a
-- call) are stored as prescriptions with no image, so image_url must allow NULL.
alter table prescriptions alter column image_url drop not null;
