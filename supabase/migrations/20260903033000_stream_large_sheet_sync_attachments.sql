create or replace function public.prepare_dev_sheet_outbox_payload(
  p_id bigint,
  p_payload jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when length(coalesce(p_payload #>> '{invoiceFile,data}', '')) > 4000000 then
      jsonb_set(p_payload, '{invoiceFile,data}', to_jsonb(''::text), false)
      || jsonb_build_object(
        '_sheetSyncLargeInvoiceOutboxId', p_id,
        '_sheetSyncLargeInvoiceLength', length(p_payload #>> '{invoiceFile,data}')
      )
    else p_payload
  end;
$$;

create or replace function public.read_dev_sheet_outbox_invoice_chunk(
  p_id bigint,
  p_offset integer,
  p_length integer default 750000
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select substring(
    payload #>> '{invoiceFile,data}'
    from greatest(coalesce(p_offset, 0), 0) + 1
    for greatest(1, least(coalesce(p_length, 750000), 1000000))
  )
  from public.dev_sheet_outbox
  where id = p_id;
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
  returning outbox.id,
    outbox.action,
    public.prepare_dev_sheet_outbox_payload(outbox.id, outbox.payload),
    outbox.result,
    outbox.business_date,
    outbox.attempts;
end;
$$;

revoke execute on function public.prepare_dev_sheet_outbox_payload(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_dev_sheet_outbox_payload(bigint, jsonb)
  to service_role;

revoke execute on function public.read_dev_sheet_outbox_invoice_chunk(bigint, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_dev_sheet_outbox_invoice_chunk(bigint, integer, integer)
  to service_role;
