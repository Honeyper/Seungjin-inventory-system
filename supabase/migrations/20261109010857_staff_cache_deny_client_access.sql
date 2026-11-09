-- Match other private caches: no browser or normal JWT client may read staff data directly.
create policy production_plan_staff_cache_deny_client_access
on public.production_plan_staff_cache for all to anon, authenticated
using (false) with check (false);
