begin;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_org_lead_id_key unique (org_id, lead_id, id);

create table public.marketing_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('meta', 'google')),
  status text not null default 'disconnected' check (status in ('disconnected', 'pending', 'connected', 'error', 'disabled')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  external_business_id text check (external_business_id is null or char_length(external_business_id) <= 160),
  external_account_id text check (external_account_id is null or char_length(external_account_id) <= 160),
  dataset_id text check (dataset_id is null or char_length(dataset_id) <= 160),
  secret_reference text check (secret_reference is null or char_length(secret_reference) between 8 and 500),
  privacy_basis_code text check (privacy_basis_code is null or char_length(privacy_basis_code) between 2 and 32),
  consent_reference text check (consent_reference is null or char_length(consent_reference) <= 255),
  configured_by uuid not null references auth.users(id),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (status <> 'connected' or (secret_reference is not null and privacy_basis_code is not null))
);

create unique index marketing_integrations_external_account_idx
  on public.marketing_integrations (org_id, provider, external_account_id)
  where external_account_id is not null;

create table public.lead_attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid not null,
  whatsapp_connection_id uuid,
  source_message_id uuid,
  channel text not null check (channel in ('form', 'whatsapp', 'landing_page', 'manual', 'import', 'api')),
  provider text not null default 'other' check (provider in ('meta', 'google', 'direct', 'referral', 'other')),
  source text check (source is null or char_length(source) <= 200),
  medium text check (medium is null or char_length(medium) <= 200),
  campaign_name text check (campaign_name is null or char_length(campaign_name) <= 500),
  campaign_id text check (campaign_id is null or char_length(campaign_id) <= 160),
  adset_name text check (adset_name is null or char_length(adset_name) <= 500),
  adset_id text check (adset_id is null or char_length(adset_id) <= 160),
  ad_name text check (ad_name is null or char_length(ad_name) <= 500),
  ad_id text check (ad_id is null or char_length(ad_id) <= 160),
  utm_source text check (utm_source is null or char_length(utm_source) <= 500),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 500),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 500),
  utm_content text check (utm_content is null or char_length(utm_content) <= 500),
  utm_term text check (utm_term is null or char_length(utm_term) <= 500),
  fbclid text check (fbclid is null or char_length(fbclid) <= 500),
  fbc text check (fbc is null or char_length(fbc) <= 500),
  fbp text check (fbp is null or char_length(fbp) <= 500),
  ctwa_clid text check (ctwa_clid is null or char_length(ctwa_clid) <= 1000),
  gclid text check (gclid is null or char_length(gclid) <= 500),
  gbraid text check (gbraid is null or char_length(gbraid) <= 500),
  wbraid text check (wbraid is null or char_length(wbraid) <= 500),
  landing_path text check (landing_path is null or char_length(landing_path) <= 2048),
  referrer_origin text check (referrer_origin is null or char_length(referrer_origin) <= 255),
  form_id text check (form_id is null or char_length(form_id) <= 160),
  provider_referral jsonb not null default '{}'::jsonb,
  deduplication_key text check (deduplication_key is null or char_length(deduplication_key) between 16 and 160),
  occurred_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade,
  foreign key (org_id, whatsapp_connection_id) references public.whatsapp_connections(org_id, id),
  foreign key (org_id, lead_id, source_message_id) references public.whatsapp_messages(org_id, lead_id, id) on delete cascade,
  check (source_message_id is null or channel = 'whatsapp'),
  check (octet_length(provider_referral::text) <= 16384)
);

create unique index lead_attribution_touchpoints_dedupe_idx
  on public.lead_attribution_touchpoints (org_id, lead_id, deduplication_key)
  where deduplication_key is not null;
create index lead_attribution_touchpoints_first_idx
  on public.lead_attribution_touchpoints (org_id, lead_id, occurred_at, id);
create index lead_attribution_touchpoints_last_idx
  on public.lead_attribution_touchpoints (org_id, lead_id, occurred_at desc, id desc);
create index lead_attribution_touchpoints_meta_click_idx
  on public.lead_attribution_touchpoints (org_id, ctwa_clid)
  where ctwa_clid is not null;
create index lead_attribution_touchpoints_expiry_idx
  on public.lead_attribution_touchpoints (expires_at)
  where expires_at is not null;

create table public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid not null,
  attribution_touchpoint_id uuid,
  event_key text not null check (char_length(event_key) between 8 and 200),
  event_name text not null check (char_length(event_name) between 2 and 100),
  action_source text not null check (action_source in ('website', 'business_messaging', 'offline')),
  value_in_cents bigint not null default 0 check (value_in_cents >= 0),
  currency char(3) not null default 'BRL' check (currency = upper(currency)),
  occurred_at timestamptz not null,
  email_sha256 text check (email_sha256 is null or email_sha256 ~ '^[a-f0-9]{64}$'),
  phone_sha256 text check (phone_sha256 is null or phone_sha256 ~ '^[a-f0-9]{64}$'),
  external_id_sha256 text not null check (external_id_sha256 ~ '^[a-f0-9]{64}$'),
  fbc text check (fbc is null or char_length(fbc) <= 500),
  fbp text check (fbp is null or char_length(fbp) <= 500),
  ctwa_clid text check (ctwa_clid is null or char_length(ctwa_clid) <= 1000),
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, event_key),
  foreign key (org_id, lead_id) references public.leads(org_id, id),
  foreign key (org_id, attribution_touchpoint_id) references public.lead_attribution_touchpoints(org_id, id),
  check (octet_length(custom_data::text) <= 16384)
);

create index conversion_events_org_occurred_idx on public.conversion_events (org_id, occurred_at desc);

create table public.conversion_deliveries (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  conversion_event_id uuid not null,
  integration_id uuid not null,
  provider text not null check (provider in ('meta', 'google')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text check (locked_by is null or char_length(locked_by) <= 160),
  external_event_id text check (external_event_id is null or char_length(external_event_id) <= 255),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  last_error_at timestamptz,
  sent_at timestamptz,
  privacy_basis_code text not null check (char_length(privacy_basis_code) between 2 and 32),
  consent_reference text check (consent_reference is null or char_length(consent_reference) <= 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, conversion_event_id, integration_id),
  foreign key (org_id, conversion_event_id) references public.conversion_events(org_id, id) on delete cascade,
  foreign key (org_id, integration_id) references public.marketing_integrations(org_id, id) on delete cascade
);

create index conversion_deliveries_ready_idx
  on public.conversion_deliveries (next_attempt_at, id)
  where status in ('pending', 'failed');

create or replace function public.touch_marketing_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

revoke all on function public.touch_marketing_updated_at() from public;
create trigger marketing_integrations_touch before update on public.marketing_integrations for each row execute function public.touch_marketing_updated_at();
create trigger conversion_deliveries_touch before update on public.conversion_deliveries for each row execute function public.touch_marketing_updated_at();

create or replace function public.enqueue_won_lead_conversion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  created_event public.conversion_events;
  selected_touch public.lead_attribution_touchpoints;
begin
  if new.status <> 'won' or old.status = 'won' then return new; end if;

  select * into selected_touch
  from public.lead_attribution_touchpoints
  where org_id = new.org_id and lead_id = new.id
  order by occurred_at desc, id desc
  limit 1;

  insert into public.conversion_events (
    org_id, lead_id, attribution_touchpoint_id, event_key, event_name,
    action_source, value_in_cents, currency, occurred_at,
    email_sha256, phone_sha256, external_id_sha256, fbc, fbp, ctwa_clid, custom_data
  ) values (
    new.org_id,
    new.id,
    selected_touch.id,
    'lead-won:' || new.id::text || ':' || new.version::text,
    'Purchase',
    case
      when selected_touch.channel = 'whatsapp' then 'business_messaging'
      when selected_touch.channel in ('form', 'landing_page') then 'website'
      else 'offline'
    end,
    new.value_in_cents,
    'BRL',
    now(),
    case when new.email is null then null else encode(extensions.digest(lower(trim(new.email)), 'sha256'), 'hex') end,
    case when new.phone is null then null else encode(extensions.digest(regexp_replace(new.phone, '[^0-9]', '', 'g'), 'sha256'), 'hex') end,
    encode(extensions.digest(new.id::text, 'sha256'), 'hex'),
    selected_touch.fbc,
    selected_touch.fbp,
    selected_touch.ctwa_clid,
    jsonb_build_object('lead_version', new.version)
  ) returning * into created_event;

  insert into public.conversion_deliveries (
    org_id, conversion_event_id, integration_id, provider, privacy_basis_code, consent_reference
  )
  select new.org_id, created_event.id, integration.id, integration.provider, integration.privacy_basis_code, integration.consent_reference
  from public.marketing_integrations integration
  where integration.org_id = new.org_id and integration.status = 'connected';

  return new;
end;
$$;

revoke all on function public.enqueue_won_lead_conversion() from public;
create trigger leads_enqueue_won_conversion
  after update on public.leads
  for each row execute function public.enqueue_won_lead_conversion();

alter table public.marketing_integrations enable row level security;
alter table public.lead_attribution_touchpoints enable row level security;
alter table public.conversion_events enable row level security;
alter table public.conversion_deliveries enable row level security;

create policy marketing_integrations_select_admin
  on public.marketing_integrations for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));
create policy lead_attribution_touchpoints_select_admin
  on public.lead_attribution_touchpoints for select to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));
create policy conversion_events_select_member
  on public.conversion_events for select to authenticated
  using (public.is_org_member(org_id));
revoke all on public.marketing_integrations from anon, authenticated;
revoke all on public.lead_attribution_touchpoints from anon, authenticated;
revoke all on public.conversion_events from anon, authenticated;
revoke all on public.conversion_deliveries from anon, authenticated;
grant select on public.lead_attribution_touchpoints to authenticated;
grant select on public.conversion_events to authenticated;
grant select (
  id, org_id, provider, status, display_name, external_business_id,
  external_account_id, dataset_id, configured_by, last_verified_at,
  created_at, updated_at
) on public.marketing_integrations to authenticated;

create view public.marketing_integrations_safe
with (security_invoker = true)
as select id, org_id, provider, status, display_name, external_business_id, external_account_id,
  dataset_id, configured_by, last_verified_at, created_at, updated_at
from public.marketing_integrations;

revoke all on public.marketing_integrations_safe from anon, authenticated;
grant select on public.marketing_integrations_safe to authenticated;

commit;
