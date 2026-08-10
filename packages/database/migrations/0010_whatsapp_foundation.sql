begin;

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'evolution' check (provider in ('evolution', 'whatsapp_cloud')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  instance_name text not null check (instance_name ~ '^[a-z0-9][a-z0-9_-]{7,79}$'),
  phone_number text check (phone_number is null or char_length(phone_number) <= 32),
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'qr_code', 'connected', 'error')),
  is_default boolean not null default false,
  created_by uuid not null references auth.users(id),
  last_connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (instance_name)
);

create unique index whatsapp_connections_one_default_idx on public.whatsapp_connections (org_id) where is_default;
create index whatsapp_connections_org_status_idx on public.whatsapp_connections (org_id, status);

create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null,
  lead_id uuid,
  remote_jid text not null check (char_length(remote_jid) between 3 and 160),
  contact_name text check (contact_name is null or char_length(contact_name) <= 160),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 500),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, connection_id, id),
  unique (org_id, connection_id, remote_jid),
  foreign key (org_id, connection_id) references public.whatsapp_connections(org_id, id) on delete cascade,
  foreign key (org_id, lead_id) references public.leads(org_id, id)
);

create index whatsapp_conversations_org_recent_idx on public.whatsapp_conversations (org_id, last_message_at desc nulls last);
create index whatsapp_conversations_lead_idx on public.whatsapp_conversations (org_id, lead_id) where lead_id is not null;

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  connection_id uuid not null,
  conversation_id uuid not null,
  lead_id uuid,
  external_id text check (external_id is null or char_length(external_id) <= 255),
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null check (message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'unknown')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  sender_jid text check (sender_jid is null or char_length(sender_jid) <= 160),
  text_content text check (text_content is null or char_length(text_content) <= 20000),
  media_object_key text check (media_object_key is null or char_length(media_object_key) <= 500),
  media_mime_type text check (media_mime_type is null or char_length(media_mime_type) <= 160),
  media_file_name text check (media_file_name is null or char_length(media_file_name) <= 255),
  media_size_bytes bigint check (media_size_bytes is null or media_size_bytes between 0 and 52428800),
  reply_to_external_id text check (reply_to_external_id is null or char_length(reply_to_external_id) <= 255),
  client_idempotency_key uuid,
  provider_timestamp timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, connection_id) references public.whatsapp_connections(org_id, id) on delete cascade,
  foreign key (org_id, connection_id, conversation_id) references public.whatsapp_conversations(org_id, connection_id, id) on delete cascade,
  foreign key (org_id, lead_id) references public.leads(org_id, id)
);

create unique index whatsapp_messages_external_id_idx on public.whatsapp_messages (org_id, connection_id, external_id) where external_id is not null;
create unique index whatsapp_messages_idempotency_idx on public.whatsapp_messages (org_id, client_idempotency_key) where client_idempotency_key is not null;
create index whatsapp_messages_conversation_time_idx on public.whatsapp_messages (org_id, conversation_id, provider_timestamp desc nulls last, created_at desc);
create index whatsapp_messages_pending_idx on public.whatsapp_messages (org_id, status, created_at) where status in ('pending', 'failed');

create table public.whatsapp_webhook_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  connection_id uuid not null,
  event_name text not null check (char_length(event_name) between 2 and 100),
  provider_event_id text check (provider_event_id is null or char_length(provider_event_id) <= 255),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  sanitized_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed', 'discarded')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (org_id, connection_id) references public.whatsapp_connections(org_id, id) on delete cascade
);

create unique index whatsapp_webhook_events_provider_id_idx on public.whatsapp_webhook_events (connection_id, provider_event_id) where provider_event_id is not null;
create unique index whatsapp_webhook_events_payload_hash_idx on public.whatsapp_webhook_events (connection_id, payload_hash);
create index whatsapp_webhook_events_pending_idx on public.whatsapp_webhook_events (processing_status, received_at) where processing_status in ('pending', 'failed');

create table public.whatsapp_conversation_reads (
  org_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (org_id, conversation_id, user_id),
  foreign key (org_id, conversation_id) references public.whatsapp_conversations(org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.organization_members(org_id, user_id) on delete cascade
);

create table public.whatsapp_outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  message_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, message_id),
  foreign key (org_id, message_id) references public.whatsapp_messages(org_id, id) on delete cascade
);

create index whatsapp_outbox_ready_idx on public.whatsapp_outbox (next_attempt_at, id) where status in ('pending', 'failed');

create or replace function public.touch_whatsapp_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

revoke all on function public.touch_whatsapp_updated_at() from public;
create trigger whatsapp_connections_touch before update on public.whatsapp_connections for each row execute function public.touch_whatsapp_updated_at();
create trigger whatsapp_conversations_touch before update on public.whatsapp_conversations for each row execute function public.touch_whatsapp_updated_at();
create trigger whatsapp_messages_touch before update on public.whatsapp_messages for each row execute function public.touch_whatsapp_updated_at();
create trigger whatsapp_outbox_touch before update on public.whatsapp_outbox for each row execute function public.touch_whatsapp_updated_at();

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_conversation_reads enable row level security;
alter table public.whatsapp_outbox enable row level security;

create policy whatsapp_connections_select_member on public.whatsapp_connections for select to authenticated using (public.is_org_member(org_id));
create policy whatsapp_conversations_select_member on public.whatsapp_conversations for select to authenticated using (public.is_org_member(org_id));
create policy whatsapp_messages_select_member on public.whatsapp_messages for select to authenticated using (public.is_org_member(org_id));
create policy whatsapp_webhook_events_select_admin on public.whatsapp_webhook_events for select to authenticated using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));
create policy whatsapp_conversation_reads_self on public.whatsapp_conversation_reads for all to authenticated using (public.is_org_member(org_id) and user_id = auth.uid()) with check (public.is_org_member(org_id) and user_id = auth.uid());

revoke all on public.whatsapp_connections from anon, authenticated;
revoke all on public.whatsapp_conversations from anon, authenticated;
revoke all on public.whatsapp_messages from anon, authenticated;
revoke all on public.whatsapp_webhook_events from anon, authenticated;
revoke all on public.whatsapp_conversation_reads from anon, authenticated;
revoke all on public.whatsapp_outbox from anon, authenticated;
grant select on public.whatsapp_connections, public.whatsapp_conversations, public.whatsapp_messages to authenticated;
grant select on public.whatsapp_webhook_events to authenticated;
grant select, insert, update on public.whatsapp_conversation_reads to authenticated;

commit;
