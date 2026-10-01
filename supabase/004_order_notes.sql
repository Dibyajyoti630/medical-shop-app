-- 004: free-text note on orders (used by "order by prescription").
alter table orders add column if not exists notes text;
