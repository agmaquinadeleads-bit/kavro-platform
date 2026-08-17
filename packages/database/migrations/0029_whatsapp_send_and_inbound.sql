begin;

-- Fundação pra WhatsApp de verdade (receber + enviar), fases A do plano:
-- fila outbox com claim seguro, leitura de segredo do Vault, conexão via
-- Evolution (QR Code) guardando o segredo de verificação do webhook.

-- ---------------------------------------------------------------------
-- whatsapp_outbox: paridade com content_publish_outbox (last_error_message)
-- e função de claim (FOR UPDATE SKIP LOCKED) — mesmo motivo de
-- claim_content_publish_outbox_item: PostgREST não expõe lock de linha
-- via REST, então isso precisa ser uma função.
-- ---------------------------------------------------------------------

alter table public.whatsapp_outbox
  add column last_error_message text check (last_error_message is null or char_length(last_error_message) <= 2000);

create or replace function public.claim_whatsapp_outbox_item(p_worker_id text)
returns public.whatsapp_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.whatsapp_outbox;
begin
  update public.whatsapp_outbox
  set status = 'processing', locked_at = now(), locked_by = p_worker_id, attempts = attempts + 1
  where id = (
    select id from public.whatsapp_outbox
    where status in ('pending', 'failed') and next_attempt_at <= now()
    order by next_attempt_at, id
    limit 1
    for update skip locked
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_whatsapp_outbox_item(text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox_item(text) to service_role;

-- ---------------------------------------------------------------------
-- whatsapp_webhook_events: mesma lógica de claim pro worker que transforma
-- evento bruto em conversa/mensagem. Não tem colunas de lease/backoff
-- (locked_at/next_attempt_at) de propósito — reprocessar um evento
-- normalizando dados que já estão no nosso banco é barato e local, sem
-- risco de rate limit externo, então não precisa de backoff.
-- ---------------------------------------------------------------------

create or replace function public.claim_whatsapp_webhook_event(p_worker_id text)
returns public.whatsapp_webhook_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.whatsapp_webhook_events;
begin
  update public.whatsapp_webhook_events
  set processing_status = 'processing', attempts = attempts + 1
  where id = (
    select id from public.whatsapp_webhook_events
    where processing_status in ('pending', 'failed')
    order by received_at, id
    limit 1
    for update skip locked
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_whatsapp_webhook_event(text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_webhook_event(text) to service_role;

-- ---------------------------------------------------------------------
-- whatsapp_provider_credentials: hoje só aceita provider='whatsapp_cloud'
-- com external_phone_number_id/external_business_account_id obrigatórios
-- (específicos da Meta Cloud API). Pra Evolution não existe esse conceito
-- — o que precisa ser guardado é só o segredo de verificação do webhook
-- (X-Kavro-Webhook-Secret), por isso essas duas colunas viram opcionais.
-- ---------------------------------------------------------------------

alter table public.whatsapp_provider_credentials
  alter column external_phone_number_id drop not null,
  alter column external_business_account_id drop not null;

alter table public.whatsapp_provider_credentials
  drop constraint whatsapp_provider_credentials_provider_check;
alter table public.whatsapp_provider_credentials
  add constraint whatsapp_provider_credentials_provider_check check (provider in ('whatsapp_cloud', 'evolution'));

-- Lê de volta o segredo vaultado (token da Meta Cloud API ou segredo de
-- webhook da Evolution) — mesmo padrão de get_social_access_token
-- (0024_social_token_read.sql). Só service_role chama; nunca exposto pro
-- client.
create or replace function public.get_whatsapp_access_token(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref text;
  secret_id uuid;
  token text;
begin
  select secret_reference into ref
  from public.whatsapp_provider_credentials
  where connection_id = p_connection_id;

  if ref is null or left(ref, 6) <> 'vault:' then
    raise exception 'Credential not found' using errcode = '23503';
  end if;

  secret_id := substring(ref from 7)::uuid;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where id = secret_id;

  if token is null then
    raise exception 'Secret not found in vault' using errcode = '23503';
  end if;

  return token;
end;
$$;

revoke all on function public.get_whatsapp_access_token(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_access_token(uuid) to service_role;

-- Cria a conexão Evolution (QR Code) + vaulta o segredo de verificação do
-- webhook — mesmo padrão de complete_meta_whatsapp_connection
-- (0013_meta_embedded_signup_vault.sql), sem os campos específicos da
-- Meta Cloud API.
create or replace function public.complete_evolution_whatsapp_connection(
  p_org_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_instance_name text,
  p_webhook_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_connection_id uuid;
  created_secret_id uuid;
begin
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = p_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Manager membership required' using errcode = '42501';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'Display name required' using errcode = '22023';
  end if;

  if nullif(trim(p_webhook_secret), '') is null then
    raise exception 'Webhook secret required' using errcode = '22023';
  end if;

  select vault.create_secret(
    p_webhook_secret,
    'kavro-evolution-webhook-' || gen_random_uuid()::text,
    'Evolution webhook verification secret managed by the Kavro API'
  ) into created_secret_id;

  insert into public.whatsapp_connections (
    org_id, provider, display_name, instance_name, status, is_default, created_by
  ) values (
    p_org_id,
    'evolution',
    left(trim(p_display_name), 100),
    p_instance_name,
    'connecting',
    not exists (select 1 from public.whatsapp_connections where org_id = p_org_id and is_default),
    p_user_id
  ) returning id into created_connection_id;

  insert into public.whatsapp_provider_credentials (
    org_id, connection_id, provider, secret_reference
  ) values (
    p_org_id, created_connection_id, 'evolution', 'vault:' || created_secret_id::text
  );

  return created_connection_id;
end;
$$;

revoke all on function public.complete_evolution_whatsapp_connection(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_evolution_whatsapp_connection(uuid, uuid, text, text, text) to service_role;

commit;
