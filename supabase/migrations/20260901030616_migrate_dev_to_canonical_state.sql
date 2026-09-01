create table public.dev_state (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 1 check (version > 0),
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dev_products (
  product_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dev_purchase_orders (
  purchase_order_id text primary key,
  product_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dev_inbounds (
  record_key text primary key,
  management_id text not null,
  product_id text not null,
  inbound_date date,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dev_inventory_records (
  record_key text primary key,
  management_id text not null,
  product_id text not null,
  storage text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dev_inventory_boxes (
  box_id text primary key,
  management_id text not null,
  product_id text not null,
  storage text not null,
  box_number integer not null check (box_number > 0),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.dev_sheet_outbox (
  id bigint generated always as identity primary key,
  state_version bigint not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null default '{}'::jsonb,
  business_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default 'pending' check (status in ('pending', 'processing', 'synced', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create index dev_purchase_orders_product_id_idx
  on public.dev_purchase_orders (product_id);
create index dev_inbounds_date_idx
  on public.dev_inbounds (inbound_date desc, management_id);
create index dev_inbounds_management_product_idx
  on public.dev_inbounds (management_id, product_id);
create index dev_inventory_records_management_product_idx
  on public.dev_inventory_records (management_id, product_id);
create index dev_inventory_boxes_management_product_idx
  on public.dev_inventory_boxes (management_id, product_id, box_number);
create index dev_inventory_boxes_storage_status_idx
  on public.dev_inventory_boxes (storage, ((data ->> 'rawStatus')));
create index dev_sheet_outbox_pending_idx
  on public.dev_sheet_outbox (business_date, id)
  where status in ('pending', 'failed');

insert into public.dev_state (singleton, version)
values (true, 1)
on conflict (singleton) do nothing;

insert into public.dev_products (product_id, data)
select
  coalesce(nullif(item ->> 'productCode', ''), item ->> 'productId'),
  item
from public.api_snapshots snapshot,
  lateral jsonb_array_elements(snapshot.payload -> 'products') item
where snapshot.dataset = 'products'
on conflict (product_id) do update
set data = excluded.data,
    updated_at = now();

insert into public.dev_purchase_orders (purchase_order_id, product_id, data)
select
  item ->> 'purchaseOrderId',
  item ->> 'productId',
  item
from public.api_snapshots snapshot,
  lateral jsonb_array_elements(snapshot.payload -> 'purchaseOrders') item
where snapshot.dataset = 'purchase_orders'
on conflict (purchase_order_id) do update
set product_id = excluded.product_id,
    data = excluded.data,
    updated_at = now();

insert into public.dev_inbounds (record_key, management_id, product_id, inbound_date, data)
select
  concat_ws('|', item ->> 'managementId', item ->> 'productId'),
  item ->> 'managementId',
  item ->> 'productId',
  nullif(item ->> 'inboundDate', '')::date,
  item
from public.api_snapshots snapshot,
  lateral jsonb_array_elements(snapshot.payload -> 'inbounds') item
where snapshot.dataset = 'inbounds'
on conflict (record_key) do update
set inbound_date = excluded.inbound_date,
    data = excluded.data,
    updated_at = now();

insert into public.dev_inventory_records (record_key, management_id, product_id, storage, data)
select
  concat_ws('|', item ->> 'managementId', item ->> 'productId', coalesce(nullif(item ->> 'storage', ''), '미지정')),
  item ->> 'managementId',
  item ->> 'productId',
  coalesce(nullif(item ->> 'storage', ''), '미지정'),
  item - 'allShippingBoxes' - 'activeShippingBoxes' - 'shippedShippingBoxes'
from public.api_snapshots snapshot,
  lateral jsonb_array_elements(snapshot.payload -> 'rows') item
where snapshot.dataset = 'inventory_dashboard'
on conflict (record_key) do update
set management_id = excluded.management_id,
    product_id = excluded.product_id,
    storage = excluded.storage,
    data = excluded.data,
    updated_at = now();

insert into public.dev_inventory_boxes (box_id, management_id, product_id, storage, box_number, data)
select distinct on (box ->> 'boxId')
  box ->> 'boxId',
  item ->> 'managementId',
  coalesce(nullif(box ->> 'productId', ''), item ->> 'productId'),
  coalesce(nullif(box ->> 'storage', ''), nullif(item ->> 'storage', ''), '미지정'),
  (box ->> 'number')::integer,
  box
from public.api_snapshots snapshot,
  lateral jsonb_array_elements(snapshot.payload -> 'rows') item,
  lateral jsonb_array_elements(coalesce(item -> 'allShippingBoxes', '[]'::jsonb)) box
where snapshot.dataset = 'inventory_dashboard'
  and nullif(box ->> 'boxId', '') is not null
order by box ->> 'boxId', item ->> 'managementId'
on conflict (box_id) do update
set management_id = excluded.management_id,
    product_id = excluded.product_id,
    storage = excluded.storage,
    box_number = excluded.box_number,
    data = excluded.data,
    updated_at = now();

create or replace function public.commit_dev_state_mutation(
  p_expected_version bigint,
  p_changes jsonb,
  p_action text,
  p_payload jsonb,
  p_result jsonb,
  p_enqueue_sheet boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_version bigint;
  next_version bigint;
  outbox_id bigint;
begin
  select version
    into current_version
  from public.dev_state
  where singleton = true
  for update;

  if current_version is distinct from p_expected_version then
    raise exception 'DEV_STATE_VERSION_CONFLICT' using errcode = '40001';
  end if;

  insert into public.dev_products (product_id, data, updated_at)
  select item.product_id, item.data, now()
  from jsonb_to_recordset(coalesce(p_changes #> '{products,upserts}', '[]'::jsonb))
    as item(product_id text, data jsonb)
  on conflict (product_id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at;

  delete from public.dev_products target
  using jsonb_array_elements_text(coalesce(p_changes #> '{products,deletes}', '[]'::jsonb)) deleted(product_id)
  where target.product_id = deleted.product_id;

  insert into public.dev_purchase_orders (purchase_order_id, product_id, data, updated_at)
  select item.purchase_order_id, item.product_id, item.data, now()
  from jsonb_to_recordset(coalesce(p_changes #> '{purchaseOrders,upserts}', '[]'::jsonb))
    as item(purchase_order_id text, product_id text, data jsonb)
  on conflict (purchase_order_id) do update
  set product_id = excluded.product_id,
      data = excluded.data,
      updated_at = excluded.updated_at;

  delete from public.dev_purchase_orders target
  using jsonb_array_elements_text(coalesce(p_changes #> '{purchaseOrders,deletes}', '[]'::jsonb)) deleted(purchase_order_id)
  where target.purchase_order_id = deleted.purchase_order_id;

  insert into public.dev_inbounds (record_key, management_id, product_id, inbound_date, data, updated_at)
  select item.record_key, item.management_id, item.product_id, item.inbound_date, item.data, now()
  from jsonb_to_recordset(coalesce(p_changes #> '{inbounds,upserts}', '[]'::jsonb))
    as item(record_key text, management_id text, product_id text, inbound_date date, data jsonb)
  on conflict (record_key) do update
  set management_id = excluded.management_id,
      product_id = excluded.product_id,
      inbound_date = excluded.inbound_date,
      data = excluded.data,
      updated_at = excluded.updated_at;

  delete from public.dev_inbounds target
  using jsonb_array_elements_text(coalesce(p_changes #> '{inbounds,deletes}', '[]'::jsonb)) deleted(record_key)
  where target.record_key = deleted.record_key;

  insert into public.dev_inventory_records (record_key, management_id, product_id, storage, data, updated_at)
  select item.record_key, item.management_id, item.product_id, item.storage, item.data, now()
  from jsonb_to_recordset(coalesce(p_changes #> '{inventoryRecords,upserts}', '[]'::jsonb))
    as item(record_key text, management_id text, product_id text, storage text, data jsonb)
  on conflict (record_key) do update
  set management_id = excluded.management_id,
      product_id = excluded.product_id,
      storage = excluded.storage,
      data = excluded.data,
      updated_at = excluded.updated_at;

  delete from public.dev_inventory_records target
  using jsonb_array_elements_text(coalesce(p_changes #> '{inventoryRecords,deletes}', '[]'::jsonb)) deleted(record_key)
  where target.record_key = deleted.record_key;

  insert into public.dev_inventory_boxes (box_id, management_id, product_id, storage, box_number, data, updated_at)
  select item.box_id, item.management_id, item.product_id, item.storage, item.box_number, item.data, now()
  from jsonb_to_recordset(coalesce(p_changes #> '{inventoryBoxes,upserts}', '[]'::jsonb))
    as item(box_id text, management_id text, product_id text, storage text, box_number integer, data jsonb)
  on conflict (box_id) do update
  set management_id = excluded.management_id,
      product_id = excluded.product_id,
      storage = excluded.storage,
      box_number = excluded.box_number,
      data = excluded.data,
      updated_at = excluded.updated_at;

  delete from public.dev_inventory_boxes target
  using jsonb_array_elements_text(coalesce(p_changes #> '{inventoryBoxes,deletes}', '[]'::jsonb)) deleted(box_id)
  where target.box_id = deleted.box_id;

  next_version := current_version + 1;
  update public.dev_state
  set version = next_version,
      updated_at = now()
  where singleton = true;

  if p_enqueue_sheet then
    insert into public.dev_sheet_outbox (state_version, action, payload, result)
    values (next_version, p_action, p_payload, coalesce(p_result, '{}'::jsonb))
    returning id into outbox_id;
  end if;

  return jsonb_build_object(
    'version', next_version,
    'outboxId', outbox_id
  );
end;
$$;

create or replace function public.read_dev_canonical_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', (select version from public.dev_state where singleton = true),
    'products', coalesce((select jsonb_agg(data order by product_id) from public.dev_products), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(data order by updated_at desc, purchase_order_id desc) from public.dev_purchase_orders), '[]'::jsonb),
    'inbounds', coalesce((select jsonb_agg(data order by inbound_date, management_id) from public.dev_inbounds), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(
        data || jsonb_build_object('recordKey', record_key, 'originalStorage', storage)
        order by management_id, product_id, storage
      )
      from public.dev_inventory_records
    ), '[]'::jsonb),
    'boxes', coalesce((
      select jsonb_agg(
        data || jsonb_build_object(
          'boxId', box_id,
          'managementId', management_id,
          'productId', product_id,
          'storage', storage,
          'number', box_number
        )
        order by management_id, product_id, box_number
      )
      from public.dev_inventory_boxes
    ), '[]'::jsonb)
  );
$$;

create or replace function public.read_dev_inventory_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'records', coalesce((
      select jsonb_agg(
        data || jsonb_build_object('recordKey', record_key, 'originalStorage', storage)
        order by management_id, product_id, storage
      )
      from public.dev_inventory_records
    ), '[]'::jsonb),
    'boxes', coalesce((
      select jsonb_agg(
        data || jsonb_build_object(
          'boxId', box_id,
          'managementId', management_id,
          'productId', product_id,
          'storage', storage,
          'number', box_number
        )
        order by management_id, product_id, box_number
      )
      from public.dev_inventory_boxes
    ), '[]'::jsonb)
  );
$$;

alter table public.dev_state enable row level security;
alter table public.dev_state force row level security;
alter table public.dev_products enable row level security;
alter table public.dev_products force row level security;
alter table public.dev_purchase_orders enable row level security;
alter table public.dev_purchase_orders force row level security;
alter table public.dev_inbounds enable row level security;
alter table public.dev_inbounds force row level security;
alter table public.dev_inventory_records enable row level security;
alter table public.dev_inventory_records force row level security;
alter table public.dev_inventory_boxes enable row level security;
alter table public.dev_inventory_boxes force row level security;
alter table public.dev_sheet_outbox enable row level security;
alter table public.dev_sheet_outbox force row level security;

create policy dev_state_deny_client_access on public.dev_state
  for all to anon, authenticated using (false) with check (false);
create policy dev_products_deny_client_access on public.dev_products
  for all to anon, authenticated using (false) with check (false);
create policy dev_purchase_orders_deny_client_access on public.dev_purchase_orders
  for all to anon, authenticated using (false) with check (false);
create policy dev_inbounds_deny_client_access on public.dev_inbounds
  for all to anon, authenticated using (false) with check (false);
create policy dev_inventory_records_deny_client_access on public.dev_inventory_records
  for all to anon, authenticated using (false) with check (false);
create policy dev_inventory_boxes_deny_client_access on public.dev_inventory_boxes
  for all to anon, authenticated using (false) with check (false);
create policy dev_sheet_outbox_deny_client_access on public.dev_sheet_outbox
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.dev_state from anon, authenticated;
revoke all on table public.dev_products from anon, authenticated;
revoke all on table public.dev_purchase_orders from anon, authenticated;
revoke all on table public.dev_inbounds from anon, authenticated;
revoke all on table public.dev_inventory_records from anon, authenticated;
revoke all on table public.dev_inventory_boxes from anon, authenticated;
revoke all on table public.dev_sheet_outbox from anon, authenticated;
revoke all on sequence public.dev_sheet_outbox_id_seq from anon, authenticated;

grant select, update on table public.dev_state to service_role;
grant select, insert, update, delete on table public.dev_products to service_role;
grant select, insert, update, delete on table public.dev_purchase_orders to service_role;
grant select, insert, update, delete on table public.dev_inbounds to service_role;
grant select, insert, update, delete on table public.dev_inventory_records to service_role;
grant select, insert, update, delete on table public.dev_inventory_boxes to service_role;
grant select, insert, update, delete on table public.dev_sheet_outbox to service_role;
grant usage, select on sequence public.dev_sheet_outbox_id_seq to service_role;

revoke execute on function public.commit_dev_state_mutation(bigint, jsonb, text, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.commit_dev_state_mutation(bigint, jsonb, text, jsonb, jsonb, boolean)
  to service_role;
revoke execute on function public.read_dev_canonical_state()
  from public, anon, authenticated;
grant execute on function public.read_dev_canonical_state()
  to service_role;
revoke execute on function public.read_dev_inventory_state()
  from public, anon, authenticated;
grant execute on function public.read_dev_inventory_state()
  to service_role;
