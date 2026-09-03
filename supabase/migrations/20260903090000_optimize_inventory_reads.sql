create or replace function public.read_dev_inventory_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'recordRows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'data', data,
        'record_key', record_key,
        'storage', storage
      ))
      from public.dev_inventory_records
    ), '[]'::jsonb),
    'boxRows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'data', data,
        'box_id', box_id,
        'management_id', management_id,
        'product_id', product_id,
        'storage', storage,
        'box_number', box_number
      ))
      from public.dev_inventory_boxes
    ), '[]'::jsonb)
  );
$$;

create or replace function public.mark_dev_inbound_qr_generated(
  p_management_id text,
  p_product_id text,
  p_box_count integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed boolean := false;
begin
  with updated as (
    update public.dev_inbounds
    set data = jsonb_set(
      jsonb_set(data, '{qrGeneratedCount}', to_jsonb(greatest(p_box_count, 0)), true),
      '{qrPrintStatus}', to_jsonb('QR 생성'::text), true
    ),
    updated_at = now()
    where management_id = p_management_id
      and (nullif(p_product_id, '') is null or product_id = p_product_id)
      and (
        coalesce(data ->> 'qrPrintStatus', '') <> 'QR 생성'
        or coalesce((data ->> 'qrGeneratedCount')::integer, -1) <> greatest(p_box_count, 0)
      )
    returning management_id, product_id
  ), queued as (
    insert into public.dev_sheet_outbox (state_version, action, payload, result)
    select
      state.version,
      'getInboundBoxQrs',
      jsonb_build_object('managementId', updated.management_id, 'productId', updated.product_id),
      jsonb_build_object('managementId', updated.management_id, 'boxCount', greatest(p_box_count, 0))
    from updated
    cross join public.dev_state state
    where state.singleton = true
    returning 1
  )
  select exists(select 1 from queued) into changed;

  return changed;
end;
$$;

revoke execute on function public.read_dev_inventory_state() from public, anon, authenticated;
grant execute on function public.read_dev_inventory_state() to service_role;
revoke execute on function public.mark_dev_inbound_qr_generated(text, text, integer) from public, anon, authenticated;
grant execute on function public.mark_dev_inbound_qr_generated(text, text, integer) to service_role;
