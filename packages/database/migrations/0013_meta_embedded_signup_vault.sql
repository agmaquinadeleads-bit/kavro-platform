begin;

create extension if not exists supabase_vault with schema vault;

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
