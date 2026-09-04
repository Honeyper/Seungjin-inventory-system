create or replace function public.finish_dev_sheet_outbox(p_results jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_succeeded boolean;
  synced_count integer := 0;
  failed_count integer := 0;
begin
  for item in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    item_succeeded := coalesce((item ->> 'ok')::boolean, false);

    update public.dev_sheet_outbox
    set status = case when item_succeeded then 'synced' else 'failed' end,
        synced_at = case when item_succeeded then now() else null end,
        processing_started_at = null,
        last_error = case when item_succeeded then null else left(coalesce(item ->> 'message', '동기화 실패'), 2000) end,
        sync_result = coalesce(item -> 'data', '{}'::jsonb),
        payload = case
          when item_succeeded then payload #- '{invoiceFile,data}'
          else payload
        end
    where id = (item ->> 'id')::bigint
      and status = 'processing';

    if found and item_succeeded then
      synced_count := synced_count + 1;
    elsif found then
      failed_count := failed_count + 1;
    end if;
  end loop;

  return jsonb_build_object('synced', synced_count, 'failed', failed_count);
end;
$$;

update public.dev_sheet_outbox
set payload = payload #- '{invoiceFile,data}'
where status = 'synced'
  and payload #> '{invoiceFile,data}' is not null;

comment on function public.finish_dev_sheet_outbox(jsonb) is
  'Finalizes sheet sync results and removes successfully backed-up invoice binary data.';
