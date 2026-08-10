begin;

create table public.whatsapp_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null,
  provider text not null check (provider = 'whatsapp_cloud'),
  external_phone_number_id text not null check (char_length(external_phone_number_id) between 3 and 160),
  external_business_account_id text not null check (char_length(external_business_account_id) between 3 and 160),
  secret_reference text not null check (char_length(secret_reference) between 8 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (connection_id),
  unique (external_phone_number_id),
  foreign key (org_id, connection_id) references public.whatsapp_connections(org_id, id) on delete cascade
);

comment on column public.whatsapp_provider_credentials.secret_reference is
  'Opaque reference to a secret manager entry. Never store a Meta access token in this table.';

create trigger whatsapp_provider_credentials_touch
  before update on public.whatsapp_provider_credentials
  for each row execute function public.touch_whatsapp_updated_at();

alter table public.whatsapp_provider_credentials enable row level security;
revoke all on public.whatsapp_provider_credentials from anon, authenticated;

commit;
