-- Build the read-only snapshot as JSON once. Avoid constructing and materializing
-- the large intermediate JSONB tree for every inventory refresh.
create or replace function public.read_dev_inventory_snapshot()
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return json_build_object(
    'recordRows', coalesce((
      select json_agg(r) from (
        select data, record_key, storage from public.dev_inventory_records
      ) r
    ), '[]'::json),
    'boxRows', coalesce((
      select json_agg(b) from (
        select data, box_id, management_id, product_id, storage, box_number
        from public.dev_inventory_boxes
      ) b
    ), '[]'::json)
  );
end;
$$;
revoke execute on function public.read_dev_inventory_snapshot() from public, anon, authenticated;
grant execute on function public.read_dev_inventory_snapshot() to service_role;
