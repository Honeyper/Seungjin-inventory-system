with qr_summary as (
  select
    management_id,
    product_id,
    count(*) as total_count,
    count(*) filter (
      where nullif(data ->> 'qrData', '') is not null
        or nullif(data ->> 'qrGeneratedAt', '') is not null
    ) as generated_count
  from public.dev_inventory_boxes
  group by management_id, product_id
)
update public.dev_inbounds as inbound
set data = inbound.data || jsonb_build_object(
      'qrGeneratedCount', qr_summary.generated_count,
      'qrPrintStatus', case
        when qr_summary.total_count > 0
          and qr_summary.generated_count >= qr_summary.total_count then 'QR 생성'
        else '미인쇄'
      end
    ),
    updated_at = now()
from qr_summary
where inbound.management_id = qr_summary.management_id
  and inbound.product_id = qr_summary.product_id;
