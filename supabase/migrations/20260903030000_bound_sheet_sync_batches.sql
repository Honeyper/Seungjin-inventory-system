-- Keep each Edge Function invocation within the pg_net request timeout.
-- The scheduler drains the daily queue in ten-item batches from 20:10 KST.
do $$
declare
  base_job_name text;
  existing_job record;
begin
  if exists (
    select 1
    from cron.job
    where jobname like 'seungjin-prd-nightly-sheet-sync%'
  ) then
    base_job_name := 'seungjin-prd-nightly-sheet-sync';
  else
    base_job_name := 'seungjin-dev-nightly-sheet-sync';
  end if;

  for existing_job in
    select jobid
    from cron.job
    where jobname in (base_job_name, base_job_name || '-late')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    base_job_name,
    '10-59/5 11 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );

  perform cron.schedule(
    base_job_name || '-late',
    '*/5 12 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );
end;
$$;
