create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.dev_sheet_outbox
  add column processing_started_at timestamptz,
  add column sync_result jsonb;

create table public.dev_sheet_sync_tokens (
  token_hash text primary key,
  purpose text not null check (purpose in ('cron', 'apps_script')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index dev_sheet_sync_tokens_expiry_idx
  on public.dev_sheet_sync_tokens (expires_at);

alter table public.dev_sheet_sync_tokens enable row level security;
alter table public.dev_sheet_sync_tokens force row level security;

create policy dev_sheet_sync_tokens_deny_client_access
  on public.dev_sheet_sync_tokens
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.dev_sheet_sync_tokens from anon, authenticated;
grant select, insert, update, delete on table public.dev_sheet_sync_tokens to service_role;

create or replace function public.consume_dev_sheet_sync_token(
  p_token_hash text,
  p_purpose text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  consumed boolean;
begin
  update public.dev_sheet_sync_tokens
  set consumed_at = now()
  where token_hash = p_token_hash
    and purpose = p_purpose
    and consumed_at is null
    and expires_at > now()
  returning true into consumed;

  return coalesce(consumed, false);
end;
$$;

create or replace function public.create_dev_sheet_sync_token(
  p_token_hash text,
  p_purpose text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.dev_sheet_sync_tokens
  where expires_at < now() - interval '1 day';

  insert into public.dev_sheet_sync_tokens (token_hash, purpose, expires_at)
  values (p_token_hash, p_purpose, p_expires_at);
end;
$$;

create or replace function public.claim_dev_sheet_outbox(p_limit integer default 50)
returns table (
  id bigint,
  action text,
  payload jsonb,
  canonical_result jsonb,
  business_date date,
  attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.dev_sheet_outbox
  set status = 'failed',
      processing_started_at = null,
      last_error = '이전 동기화 작업이 제한 시간을 초과했습니다.'
  where status = 'processing'
    and processing_started_at < now() - interval '15 minutes';

  return query
  with selected as (
    select outbox.id
    from public.dev_sheet_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.business_date <= (now() at time zone 'Asia/Seoul')::date
      and outbox.attempts < 10
    order by outbox.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  update public.dev_sheet_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      processing_started_at = now(),
      last_error = null
  from selected
  where outbox.id = selected.id
  returning outbox.id, outbox.action, outbox.payload, outbox.result,
    outbox.business_date, outbox.attempts;
end;
$$;

create or replace function public.finish_dev_sheet_outbox(p_results jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  synced_count integer := 0;
  failed_count integer := 0;
begin
  for item in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    update public.dev_sheet_outbox
    set status = case when coalesce((item ->> 'ok')::boolean, false) then 'synced' else 'failed' end,
        synced_at = case when coalesce((item ->> 'ok')::boolean, false) then now() else null end,
        processing_started_at = null,
        last_error = case when coalesce((item ->> 'ok')::boolean, false) then null else left(coalesce(item ->> 'message', '동기화 실패'), 2000) end,
        sync_result = coalesce(item -> 'data', '{}'::jsonb)
    where id = (item ->> 'id')::bigint
      and status = 'processing';

    if found and coalesce((item ->> 'ok')::boolean, false) then
      synced_count := synced_count + 1;
    elsif found then
      failed_count := failed_count + 1;
    end if;
  end loop;

  return jsonb_build_object('synced', synced_count, 'failed', failed_count);
end;
$$;

create or replace function public.apply_dev_sheet_attachment_result(
  p_action text,
  p_payload jsonb,
  p_result jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_management_id text := coalesce(nullif(p_result ->> 'managementId', ''), p_payload ->> 'managementId');
  target_product_id text := coalesce(nullif(p_payload ->> 'productId', ''), p_payload ->> 'productCode');
  invoice_url text := nullif(p_result ->> 'invoiceFileUrl', '');
  defect_urls text := nullif(p_result ->> 'defectPhotoUrls', '');
begin
  if p_action not in ('createInbound', 'updateInbound')
    or target_management_id is null
    or (invoice_url is null and defect_urls is null) then
    return;
  end if;

  update public.dev_inbounds
  set data = data
      || case when invoice_url is null then '{}'::jsonb else jsonb_build_object('invoiceFileUrl', invoice_url) end
      || case when defect_urls is null then '{}'::jsonb else jsonb_build_object('defectPhotoUrls', defect_urls) end,
      updated_at = now()
  where management_id = target_management_id
    and (target_product_id is null or product_id = target_product_id);

  update public.dev_inventory_records
  set data = data
      || case when invoice_url is null then '{}'::jsonb else jsonb_build_object('invoiceFileUrl', invoice_url) end
      || case when defect_urls is null then '{}'::jsonb else jsonb_build_object('defectPhotoUrls', defect_urls) end,
      updated_at = now()
  where management_id = target_management_id
    and (target_product_id is null or product_id = target_product_id);
end;
$$;

create or replace function public.request_dev_nightly_sheet_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash text;
  request_id bigint;
begin
  token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  delete from public.dev_sheet_sync_tokens
  where expires_at < now() - interval '1 day';

  insert into public.dev_sheet_sync_tokens (token_hash, purpose, expires_at)
  values (token_hash, 'cron', now() + interval '10 minutes');

  select net.http_post(
    url := 'https://lponwunagtixddwqkzxx.supabase.co/functions/v1/seungjin-dev-gateway',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_kjj59xENATbzJwnUlKsmGg_uA5lwI0R'
    ),
    body := jsonb_build_object(
      'action', 'runNightlySheetSync',
      'payload', jsonb_build_object('token', raw_token)
    ),
    timeout_milliseconds := 120000
  ) into request_id;

  return request_id;
end;
$$;

revoke execute on function public.consume_dev_sheet_sync_token(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_dev_sheet_sync_token(text, text)
  to service_role;
revoke execute on function public.create_dev_sheet_sync_token(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_dev_sheet_sync_token(text, text, timestamptz)
  to service_role;
revoke execute on function public.claim_dev_sheet_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_dev_sheet_outbox(integer)
  to service_role;
revoke execute on function public.finish_dev_sheet_outbox(jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_dev_sheet_outbox(jsonb)
  to service_role;
revoke execute on function public.apply_dev_sheet_attachment_result(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_dev_sheet_attachment_result(text, jsonb, jsonb)
  to service_role;
revoke execute on function public.request_dev_nightly_sheet_sync()
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'seungjin-dev-nightly-sheet-sync';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'seungjin-dev-nightly-sheet-sync',
    '10 11,12 * * *',
    'select public.request_dev_nightly_sheet_sync();'
  );
end;
$$;
