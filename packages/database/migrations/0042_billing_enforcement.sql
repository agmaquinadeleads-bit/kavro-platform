begin;

-- Enforcement de verdade dos limites de plano (Fase B) — trava dentro das
-- próprias funções que criam vendedor/conexão de WhatsApp, não só um aviso
-- na tela. CREATE OR REPLACE mantém a mesma assinatura (mesmo OID) de cada
-- função — corpo inteiro reescrito porque create or replace substitui a
-- função toda, não um diff.
--
-- effective_*_limit nulo (org sem organization_billing, ou sem
-- vinculação de Stripe ainda) sempre significa "sem limite" — é assim
-- que toda organização existente hoje (inclusive as que já pagam de
-- verdade) continua funcionando exatamente igual, sem re-cadastrar nada.

create or replace function public.accept_org_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  current_email text;
  email_confirmed timestamptz;
  current_user_id uuid := auth.uid();
  seat_limit integer;
  seat_count integer;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if invitation_token !~ '^[a-f0-9]{64}$' then raise exception 'Invitation is not active' using errcode = '22023'; end if;
  select lower(email), email_confirmed_at into current_email, email_confirmed from auth.users where id = current_user_id;
  select * into invitation from public.organization_invitations where token_hash = extensions.digest(invitation_token, 'sha256') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.cancelled_at is not null or invitation.expires_at <= now() then raise exception 'Invitation is not active' using errcode = '22023'; end if;
  if email_confirmed is null then raise exception 'Confirmed email required' using errcode = '42501'; end if;
  if current_email is distinct from invitation.email then raise exception 'Invitation email does not match' using errcode = '42501'; end if;
  if exists (select 1 from public.organization_members where user_id = current_user_id) then raise exception 'User already belongs to an organization' using errcode = '23505'; end if;

  -- Trava real de vendedor — a checagem na Server Action (createInvitation)
  -- é só UX, essa aqui é a que vale de verdade (o convite pode ter sido
  -- criado dias atrás, antes de estourar o limite).
  select effective_seats_limit into seat_limit from public.organization_billing where org_id = invitation.org_id;
  if seat_limit is not null then
    select count(*) into seat_count from public.organization_members where org_id = invitation.org_id;
    if seat_count >= seat_limit then
      raise exception 'Seat limit reached for this plan' using errcode = '42501';
    end if;
  end if;

  insert into public.organization_members (org_id, user_id, role) values (invitation.org_id, current_user_id, invitation.role);
  update public.organization_invitations set accepted_at = now(), accepted_by = current_user_id where id = invitation.id;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id) values (invitation.org_id, current_user_id, 'invitation.accepted', 'invitation', invitation.id);
  return invitation.org_id;
end;
$$;

revoke all on function public.accept_org_invitation(text) from public;
grant execute on function public.accept_org_invitation(text) to authenticated;

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
  wa_limit integer;
  wa_count integer;
begin
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = p_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Manager membership required' using errcode = '42501';
  end if;

  select effective_whatsapp_numbers_limit into wa_limit from public.organization_billing where org_id = p_org_id;
  if wa_limit is not null then
    select count(*) into wa_count from public.whatsapp_connections where org_id = p_org_id;
    if wa_count >= wa_limit then
      raise exception 'WhatsApp number limit reached for this plan' using errcode = '42501';
    end if;
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

create or replace function public.complete_meta_whatsapp_connection(
  p_org_id uuid,
  p_user_id uuid,
  p_phone_number_id text,
  p_business_account_id text,
  p_phone_number text,
  p_display_name text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_connection_id uuid;
  created_secret_id uuid;
  wa_limit integer;
  wa_count integer;
begin
  if not exists (
    select 1
    from public.organization_members
    where org_id = p_org_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Manager membership required' using errcode = '42501';
  end if;

  select effective_whatsapp_numbers_limit into wa_limit from public.organization_billing where org_id = p_org_id;
  if wa_limit is not null then
    select count(*) into wa_count from public.whatsapp_connections where org_id = p_org_id;
    if wa_count >= wa_limit then
      raise exception 'WhatsApp number limit reached for this plan' using errcode = '42501';
    end if;
  end if;

  if nullif(trim(p_access_token), '') is null then
    raise exception 'Access token required' using errcode = '22023';
  end if;

  select vault.create_secret(
    p_access_token,
    'kavro-meta-whatsapp-' || gen_random_uuid()::text,
    'Meta WhatsApp token managed by the Kavro API'
  ) into created_secret_id;

  insert into public.whatsapp_connections (
    org_id, provider, display_name, instance_name, phone_number,
    status, is_default, created_by, last_connected_at
  ) values (
    p_org_id,
    'whatsapp_cloud',
    left(coalesce(nullif(trim(p_display_name), ''), p_phone_number), 100),
    'meta_' || replace(gen_random_uuid()::text, '-', ''),
    left(nullif(trim(p_phone_number), ''), 32),
    'connected',
    not exists (select 1 from public.whatsapp_connections where org_id = p_org_id and is_default),
    p_user_id,
    now()
  ) returning id into created_connection_id;

  insert into public.whatsapp_provider_credentials (
    org_id, connection_id, provider, external_phone_number_id,
    external_business_account_id, secret_reference
  ) values (
    p_org_id,
    created_connection_id,
    'whatsapp_cloud',
    p_phone_number_id,
    p_business_account_id,
    'vault:' || created_secret_id::text
  );

  return created_connection_id;
end;
$$;

revoke all on function public.complete_meta_whatsapp_connection(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_meta_whatsapp_connection(uuid, uuid, text, text, text, text, text) to service_role;

commit;
