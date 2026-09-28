-- Daily housekeeping supplements (and does not disable) PostgreSQL autovacuum.
-- Stock, shipping history, attachments and the sheet backup outbox are retained.
create or replace function public.run_daily_database_cleanup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '1s'
as $$
declare
  sessions_removed integer := 0;
  tokens_removed integer := 0;
  logs_removed integer := 0;
begin
  if not pg_try_advisory_xact_lock(73629, 1) then
    return jsonb_build_object('skipped', true, 'reason', 'already_running');
  end if;

  -- Leave a full day of grace after expiry. Never remove active sessions/tokens.
  with expired as (
    select token_hash from public.app_sessions
    where expires_at < now() - interval '1 day'
    order by expires_at
    limit 1000
    for update skip locked
  )
  delete from public.app_sessions target
  using expired where target.token_hash = expired.token_hash;
  get diagnostics sessions_removed = row_count;

  with expired as (
    select token_hash from public.dev_sheet_sync_tokens
    where expires_at < now() - interval '1 day'
    order by expires_at
    limit 1000
    for update skip locked
  )
  delete from public.dev_sheet_sync_tokens target
  using expired where target.token_hash = expired.token_hash;
  get diagnostics tokens_removed = row_count;

  -- Only this feature's successful run logs expire. Backup/failure logs remain.
  with expired as (
    select run.runid from cron.job_run_details run
    join cron.job job on job.jobid = run.jobid
    where job.jobname in ('seungjin-daily-maintenance-cleanup', 'seungjin-daily-maintenance-vacuum')
      and run.status = 'succeeded'
      and run.end_time < now() - interval '30 days'
    order by run.end_time
    limit 1000
    for update of run skip locked
  )
  delete from cron.job_run_details target
  using expired where target.runid = expired.runid;
  get diagnostics logs_removed = row_count;

  return jsonb_build_object('sessionsRemoved', sessions_removed,
    'tokensRemoved', tokens_removed, 'maintenanceLogsRemoved', logs_removed);
end;
$$;

-- Maintenance is run by the database scheduler, never by the public Data API.
revoke all on function public.run_daily_database_cleanup()
  from public, anon, authenticated, service_role;

-- pg_cron uses GMT in this deployment. The existing backup's final run is 06:00 KST.
-- Scheduling the same names updates these jobs instead of creating duplicates.
select cron.schedule(
  'seungjin-daily-maintenance-cleanup',
  '30 21 * * *',
  $job$set statement_timeout = '60s'; select public.run_daily_database_cleanup();$job$
);

-- VACUUM must be its own top-level command, not inside a function/transaction.
-- Avoid table rewrites, truncation locks, extra workers and a large buffer ring.
select cron.schedule(
  'seungjin-daily-maintenance-vacuum',
  '35 21 * * *',
  $job$VACUUM (ANALYZE, SKIP_LOCKED, TRUNCATE FALSE, PARALLEL 0, BUFFER_USAGE_LIMIT '1MB')
    public.dev_inventory_boxes, public.dev_inventory_records,
    public.dev_inbounds, public.dev_products, public.dev_purchase_orders,
    public.dev_sheet_outbox, public.dev_state,
    public.app_sessions, public.dev_sheet_sync_tokens;$job$
);
