begin;

-- Reivindica o próximo item pronto da fila de publicação com segurança
-- (FOR UPDATE SKIP LOCKED) — evita que duas instâncias do worker peguem o
-- mesmo item ao mesmo tempo. PostgREST não expõe lock de linha via REST,
-- por isso isso precisa ser uma função, não um PATCH direto com filtro.
create or replace function public.claim_content_publish_outbox_item(p_worker_id text)
returns public.content_publish_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.content_publish_outbox;
begin
  update public.content_publish_outbox
  set status = 'processing', locked_at = now(), locked_by = p_worker_id, attempts = attempts + 1
  where id = (
    select id from public.content_publish_outbox
    where status in ('pending', 'failed') and next_attempt_at <= now()
    order by next_attempt_at, id
    limit 1
    for update skip locked
  )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_content_publish_outbox_item(text) from public, anon, authenticated;
grant execute on function public.claim_content_publish_outbox_item(text) to service_role;

commit;
