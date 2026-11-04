-- A media type handler returns the already-built snapshot verbatim. The normal
-- JSON RPC response aggregates and parses the ~15MB document again in PostgREST.
-- Keep the previous RPC for compatibility; both read the same atomic snapshot.
create domain public."application/vnd.seungjin.inventory+json" as bytea;

create function public.read_dev_inventory_snapshot_bytes()
returns public."application/vnd.seungjin.inventory+json"
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.convert_to(public.read_dev_inventory_snapshot()::text, 'UTF8')
    ::public."application/vnd.seungjin.inventory+json";
$$;

revoke execute on function public.read_dev_inventory_snapshot_bytes() from public, anon, authenticated;
grant execute on function public.read_dev_inventory_snapshot_bytes() to service_role;

notify pgrst, 'reload schema';
