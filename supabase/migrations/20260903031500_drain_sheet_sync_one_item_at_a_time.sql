-- A single spreadsheet mutation can be expensive on Apps Script.
-- Drain one item per request to stay below the free Edge Function wall-clock limit.
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
    where jobname in (base_job_name, base_job_name || '-late', base_job_name || '-final')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    base_job_name,
    '10-58/2 11 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );

  perform cron.schedule(
    base_job_name || '-late',
    '*/2 12-20 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );

  perform cron.schedule(
    base_job_name || '-final',
    '0 21 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );
end;
$$;
