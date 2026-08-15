begin;

-- Lê de volta o token vaultado pra uso do worker de publicação — até aqui
-- só existia o caminho de escrita (complete_social_connection). Só o
-- service_role pode chamar; nunca exposto pro client.
create or replace function public.get_social_access_token(p_connection_id uuid)
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
  from public.social_credentials
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

revoke all on function public.get_social_access_token(uuid) from public, anon, authenticated;
grant execute on function public.get_social_access_token(uuid) to service_role;

commit;
