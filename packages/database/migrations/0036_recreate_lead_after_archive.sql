begin;

-- Bug real: arquivar um lead não limpa whatsapp_conversations.lead_id,
-- então create_lead_from_whatsapp() via de cara "essa conversa já tem
-- lead" e nunca criava um novo — mesmo o lead antigo estando arquivado
-- (invisível no Kanban/lista). Resultado: contato manda mensagem de
-- novo depois do lead excluído e nada aparece no CRM.
--
-- Corrige checando se o lead vinculado está arquivado (deleted_at
-- preenchido): se estiver, cria um lead novo igual seria pra uma
-- conversa sem lead nenhum, e substitui o vínculo. Lead ativo continua
-- retornando na hora (sem duplicar), igual antes.
drop function if exists public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text, text);

create function public.create_lead_from_whatsapp(
  p_org_id uuid,
  p_conversation_id uuid,
  p_created_by uuid,
  p_name text,
  p_phone text,
  p_message_text text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing_lead_id uuid;
  existing_lead_deleted_at timestamptz;
  target_pipeline record;
  first_stage record;
  matched_source text;
  new_lead_id uuid;
begin
  select lead_id into existing_lead_id
  from public.whatsapp_conversations
  where id = p_conversation_id and org_id = p_org_id
  for update;

  if existing_lead_id is not null then
    select deleted_at into existing_lead_deleted_at
    from public.leads
    where id = existing_lead_id and org_id = p_org_id;

    -- Lead ainda existe e está ativo: nada a fazer, é o mesmo lead de
    -- sempre recebendo mais uma mensagem.
    if existing_lead_deleted_at is null then
      return existing_lead_id;
    end if;
    -- Lead foi arquivado (ou não existe mais) — segue pra criar um novo
    -- e realinhar a conversa a ele, como se fosse a primeira mensagem.
  end if;

  select p.* into target_pipeline
  from public.pipelines p
  where p.org_id = p_org_id and not p.is_post_sale and not p.is_protected
  order by p.position asc
  limit 1;

  if target_pipeline.id is null then
    select p.* into target_pipeline from public.pipelines p where p.org_id = p_org_id order by p.position asc limit 1;
  end if;

  if target_pipeline.id is null then
    raise exception 'Nenhum funil encontrado pra criar o lead' using errcode = 'P0001';
  end if;

  select s.* into first_stage
  from public.pipeline_stages s
  where s.org_id = p_org_id and s.pipeline_id = target_pipeline.id
  order by s.position asc
  limit 1;

  if first_stage.id is null then
    raise exception 'Funil sem etapas pra receber o lead' using errcode = 'P0001';
  end if;

  matched_source := null;
  if p_message_text is not null and char_length(trim(p_message_text)) > 0 then
    select c.name into matched_source
    from public.ad_creatives c
    where c.org_id = p_org_id and lower(trim(c.initial_message)) = lower(trim(p_message_text))
    limit 1;
  end if;

  insert into public.leads (org_id, pipeline_id, stage_id, created_by, name, phone, source)
  values (p_org_id, target_pipeline.id, first_stage.id, p_created_by, p_name, p_phone, coalesce(matched_source, 'whatsapp'))
  returning id into new_lead_id;

  update public.whatsapp_conversations set lead_id = new_lead_id where id = p_conversation_id;

  return new_lead_id;
end;
$$;

revoke all on function public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text, text) to service_role;

commit;
