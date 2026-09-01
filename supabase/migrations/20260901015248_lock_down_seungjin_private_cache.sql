create policy api_snapshots_deny_client_access
on public.api_snapshots
for all
to anon, authenticated
using (false)
with check (false);

create policy app_sessions_deny_client_access
on public.app_sessions
for all
to anon, authenticated
using (false)
with check (false);

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
