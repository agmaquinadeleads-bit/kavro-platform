begin;

-- guard_lead_integrity() sempre sobrescrevia created_by com auth.uid() —
-- em uma inserção via service_role (sem sessão de usuário, é o caso do
-- worker de WhatsApp) isso zera o valor e quebra a constraint not null.
-- Só muda o comportamento quando não há auth.uid(): nesse caso preserva
-- o created_by informado (e exige que venha preenchido) em vez de
-- sobrescrever com null. Nenhuma mudança pro caminho autenticado normal.
create or replace function public.guard_lead_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    elsif new.created_by is null then
      raise exception 'created_by é obrigatório quando não há sessão autenticada' using errcode = '23502';
    end if;
    new.version := 1;
    new.deleted_at := null;
    if new.owner_id is not null
      and auth.uid() is not null
      and new.owner_id is distinct from auth.uid()
      and not public.has_org_role(new.org_id, array['owner', 'admin']::public.organization_role[]) then
      raise exception 'Members can only assign new leads to themselves' using errcode = '42501';
    end if;
    return new;
  end if;
  new.org_id := old.org_id; new.created_by := old.created_by;
  if new.owner_id is distinct from old.owner_id
    and not public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[])
    and new.owner_id is distinct from auth.uid() then
    raise exception 'Only administrators can assign leads to other users' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Cria o lead na primeira mensagem de verdade recebida de um contato
-- novo no WhatsApp. SECURITY DEFINER (mesmo padrão de
-- complete_evolution_whatsapp_connection) — roda com privilégio total,
-- não depende de grant direto em whatsapp_conversations/leads pro
-- service_role. Trava a linha da conversa (FOR UPDATE) antes de checar
-- lead_id, pra duas mensagens quase simultâneas do mesmo contato novo
-- não criarem dois leads.
create or replace function public.create_lead_from_whatsapp(
  p_org_id uuid,
  p_conversation_id uuid,
  p_created_by uuid,
  p_name text,
  p_phone text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing_lead_id uuid;
  target_pipeline record;
  first_stage record;
  new_lead_id uuid;
begin
  select lead_id into existing_lead_id
  from public.whatsapp_conversations
  where id = p_conversation_id and org_id = p_org_id
  for update;

  if existing_lead_id is not null then
    return existing_lead_id;
  end if;

  -- "Funil padrão" não tem flag própria no schema — convenção já usada
  -- em route_lead_by_tag()/sync_post_sale_customer(): o funil comercial
  -- normal é o de menor position que não é pós-venda nem protegido.
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

  insert into public.leads (org_id, pipeline_id, stage_id, created_by, name, phone, source)
  values (p_org_id, target_pipeline.id, first_stage.id, p_created_by, p_name, p_phone, 'whatsapp')
  returning id into new_lead_id;

  update public.whatsapp_conversations set lead_id = new_lead_id where id = p_conversation_id;

  return new_lead_id;
end;
$$;

revoke all on function public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text) from public;
grant execute on function public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text) to service_role;

commit;
