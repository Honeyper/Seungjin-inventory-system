-- Integration check after migration. All fixtures and deletions are rolled back.
begin isolation level repeatable read;
set local statement_timeout = '30s';
do $$
declare
  prefix text := 'maintenance-test-' || gen_random_uuid()::text;
  result jsonb;
  before_counts jsonb;
  after_counts jsonb;
  live_session text;
  grace_session text;
  live_token text;
  grace_token text;
begin
  select jsonb_build_array(
    (select count(*) from public.dev_inventory_boxes),
    (select count(*) from public.dev_inventory_records),
    (select count(*) from public.dev_sheet_outbox),
    (select version from public.dev_state where singleton)
  ) into before_counts;

  live_session := md5(prefix || 'session-live');
  grace_session := md5(prefix || 'session-grace');
  live_token := md5(prefix || 'token-live');
  grace_token := md5(prefix || 'token-grace');
  insert into public.app_sessions (token_hash, user_payload, expires_at)
    values (live_session, '{}'::jsonb, now() + interval '1 day'),
           (grace_session, '{}'::jsonb, now() - interval '1 hour');
  insert into public.dev_sheet_sync_tokens (token_hash, purpose, expires_at)
    values (live_token, 'cron', now() + interval '1 hour'),
           (grace_token, 'cron', now() - interval '1 hour');
  insert into public.app_sessions (token_hash, user_payload, expires_at)
    select md5(prefix || 'expired-session-' || n), '{}'::jsonb, now() - interval '100 days'
    from generate_series(1, 1002) n;
  insert into public.dev_sheet_sync_tokens (token_hash, purpose, expires_at)
    select md5(prefix || 'expired-token-' || n), 'cron', now() - interval '100 days'
    from generate_series(1, 1002) n;

  result := public.run_daily_database_cleanup();
  if (result->>'sessionsRemoved')::integer <> 1000
    or (result->>'tokensRemoved')::integer <> 1000 then
    raise exception 'Cleanup must be bounded to 1000 rows per table: %', result;
  end if;
  if (select count(*) from public.app_sessions where token_hash in (live_session, grace_session)) <> 2
    or (select count(*) from public.dev_sheet_sync_tokens where token_hash in (live_token, grace_token)) <> 2 then
    raise exception 'Active or grace-period credentials were removed';
  end if;

  select jsonb_build_array(
    (select count(*) from public.dev_inventory_boxes),
    (select count(*) from public.dev_inventory_records),
    (select count(*) from public.dev_sheet_outbox),
    (select version from public.dev_state where singleton)
  ) into after_counts;
  if before_counts is distinct from after_counts then
    raise exception 'Operational stock or backup data changed';
  end if;
  if has_function_privilege('anon', 'public.run_daily_database_cleanup()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.run_daily_database_cleanup()', 'EXECUTE')
    or has_function_privilege('service_role', 'public.run_daily_database_cleanup()', 'EXECUTE') then
    raise exception 'Cleanup is callable through the Data API';
  end if;
end;
$$;
rollback;
