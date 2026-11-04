-- Return the scalar directly instead of SQL-function tuplestore materialization,
-- which spills a full inventory document to temporary disk at default work_mem.
create or replace function public.read_dev_inventory_snapshot_bytes()
returns public."application/vnd.seungjin.inventory+json"
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return pg_catalog.convert_to(public.read_dev_inventory_snapshot()::text, 'UTF8')
    ::public."application/vnd.seungjin.inventory+json";
end;
$$;

revoke execute on function public.read_dev_inventory_snapshot_bytes() from public, anon, authenticated;
grant execute on function public.read_dev_inventory_snapshot_bytes() to service_role;

notify pgrst, 'reload schema';
