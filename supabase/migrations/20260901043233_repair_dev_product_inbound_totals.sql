with taken_out as (
  select
    management_id,
    product_id,
    sum(
      coalesce(
        nullif(regexp_replace(data ->> 'quantity', '[^0-9.-]', '', 'g'), ''),
        '0'
      )::numeric
    ) as quantity
  from public.dev_inventory_boxes
  where coalesce(data ->> 'rawStatus', data ->> 'status', '') like '%출고완료%'
    and replace(coalesce(data ->> 'shippingType', ''), ' ', '') like '반출%'
  group by management_id, product_id
), unique_records as (
  select distinct on (management_id, product_id)
    management_id,
    product_id,
    greatest(
      0,
      coalesce(
        nullif(regexp_replace(data ->> 'inboundTotalQuantity', '[^0-9.-]', '', 'g'), ''),
        '0'
      )::numeric
    ) as inbound_quantity
  from public.dev_inventory_records
  order by management_id, product_id, updated_at desc, record_key
), calculated_totals as (
  select
    product_id,
    sum(greatest(0, inbound_quantity - coalesce(taken_out.quantity, 0))) as quantity
  from unique_records
  left join taken_out using (management_id, product_id)
  group by product_id
)
update public.dev_products as product
set data = jsonb_set(
      product.data,
      '{accumulatedInboundQuantity}',
      to_jsonb(
        concat(
          to_char(coalesce(expected_totals.quantity, 0), 'FM999,999,999,999,990'),
          ' ea'
        )
      ),
      true
    ),
    updated_at = now()
from (
  select
    dev_product.product_id,
    coalesce(calculated_totals.quantity, 0) as quantity
  from public.dev_products as dev_product
  left join calculated_totals using (product_id)
) as expected_totals
where product.product_id = expected_totals.product_id;
