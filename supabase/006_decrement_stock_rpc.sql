-- 006: atomically decrement stock when a customer order is placed.
-- Called by the customer right after inserting the order + lines.
-- Guards: caller must own the order (or be admin); each line needs stock >= qty.
create or replace function decrement_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not exists (
    select 1 from orders o
    where o.id = p_order_id and (o.customer_id = auth.uid() or is_admin())
  ) then
    raise exception 'not allowed';
  end if;
  for r in select medicine_id, qty from order_items where order_id = p_order_id loop
    update medicines
    set stock = stock - r.qty
    where id = r.medicine_id and stock >= r.qty;
    if not found then
      raise exception 'Insufficient stock — please adjust quantities and retry';
    end if;
  end loop;
end;
$$;
grant execute on function decrement_stock_for_order(uuid) to authenticated;
