create table public.api_snapshots (
  dataset text primary key,
  payload jsonb not null,
  record_count integer not null default 0 check (record_count >= 0),
  source_refreshed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_snapshots_dataset_check check (
    dataset = any (array['products', 'purchase_orders', 'inbounds', 'inventory_dashboard'])
  )
);

create table public.app_sessions (
  token_hash text primary key,
  user_payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index app_sessions_expires_at_idx
  on public.app_sessions (expires_at);

comment on table public.api_snapshots is
  'Private DEV Apps Script read-model snapshots served only through the authenticated Edge Function.';
comment on table public.app_sessions is
  'Opaque application sessions issued after the existing Apps Script account check.';

alter table public.api_snapshots enable row level security;
alter table public.api_snapshots force row level security;
alter table public.app_sessions enable row level security;
alter table public.app_sessions force row level security;

revoke all on table public.api_snapshots from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
grant select, insert, update, delete on table public.api_snapshots to service_role;
grant select, insert, update, delete on table public.app_sessions to service_role;
