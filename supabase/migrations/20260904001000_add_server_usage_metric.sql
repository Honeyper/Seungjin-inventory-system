create or replace function public.read_seungjin_database_usage()
returns table (
  database_bytes bigint,
  measured_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database())::bigint,
    pg_catalog.clock_timestamp();
$$;

revoke all on function public.read_seungjin_database_usage() from public, anon, authenticated;
grant execute on function public.read_seungjin_database_usage() to service_role;

comment on function public.read_seungjin_database_usage() is
  'Returns the current database size for the authenticated Seungjin gateway.';
