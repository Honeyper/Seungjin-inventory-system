-- Private last-good staff snapshot. Source remains the user's 직원정보 sheet.
create table public.production_plan_staff_cache (
  id text primary key default 'staff' check (id = 'staff'),
  payload jsonb,
  fetched_at timestamptz,
  refresh_started_at timestamptz,
  constraint production_plan_staff_cache_payload check (
    payload is null or (jsonb_typeof(payload) = 'object' and payload ? 'staff' and jsonb_typeof(payload->'staff') = 'array')
  )
);
alter table public.production_plan_staff_cache enable row level security;
alter table public.production_plan_staff_cache force row level security;
revoke all on table public.production_plan_staff_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.production_plan_staff_cache to service_role;
comment on table public.production_plan_staff_cache is 'Private staff-sheet cache; authenticated gateway reads only. No employee IDs or hiring dates.';
insert into public.production_plan_staff_cache (id) values ('staff');
