-- Read-only consistency report. Run separately in DEV and PRD.
-- Missing historical product/inbound masters are findings, not deletion candidates.
select jsonb_build_object(
  'products', (select count(*) from public.dev_products),
  'purchase_orders', (select count(*) from public.dev_purchase_orders),
  'inbounds', (select count(*) from public.dev_inbounds),
  'inventory_records', (select count(*) from public.dev_inventory_records),
  'boxes', (select count(*) from public.dev_inventory_boxes),
  'duplicate_box_identities', (select count(*) from (
    select management_id, product_id, box_number from public.dev_inventory_boxes
    group by 1, 2, 3 having count(*) > 1
  ) duplicates),
  'invalid_box_quantities', (select count(*) from public.dev_inventory_boxes
    where coalesce(data->>'quantity', '') !~ '^\d+(\.\d+)?$'),
  'box_id_mismatches', (select count(*) from public.dev_inventory_boxes
    where data->>'boxId' is distinct from box_id),
  'boxes_without_inventory_record', (select count(*) from public.dev_inventory_boxes b
    where not exists (select 1 from public.dev_inventory_records r
      where r.management_id = b.management_id and r.product_id = b.product_id)),
  'boxes_without_product_master', (select count(*) from public.dev_inventory_boxes b
    where not exists (select 1 from public.dev_products p where p.product_id = b.product_id)),
  'boxes_without_inbound_master', (select count(*) from public.dev_inventory_boxes b
    where not exists (select 1 from public.dev_inbounds i
      where i.management_id = b.management_id and i.product_id = b.product_id)),
  'outbox', (select jsonb_agg(summary) from (
    select status, count(*) as count, max(attempts) as max_attempts
    from public.dev_sheet_outbox group by status
  ) summary)
) as audit;
