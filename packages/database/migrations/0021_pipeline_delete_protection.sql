begin;

-- Permite excluir um funil, mas protege os funis "de sistema" (Pós-venda e
-- Parceiros e fornecedores) — eles são alvo de automações (trigger de
-- venda ganha e trigger de tag), excluí-los quebraria essas automações
-- silenciosamente.
alter table public.pipelines add column is_protected boolean not null default false;

update public.pipelines set is_protected = true where is_post_sale;

-- Parceiros e fornecedores não tem uma coluna própria — é identificado
-- pelas tags que já apontam pra ele (routes_to_pipeline_id).
update public.pipelines
set is_protected = true
where id in (
  select distinct routes_to_pipeline_id
  from public.tags
  where routes_to_pipeline_id is not null
);

-- Toda org nova já marca os dois funis de sistema como protegidos.
create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organization public.organizations;
  created_pipeline public.pipelines;
  created_post_sale_pipeline public.pipelines;
  created_partners_pipeline public.pipelines;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.organization_members membership
    where membership.user_id = current_user_id
  ) then
    raise exception 'User already belongs to an organization' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), lower(trim(organization_slug)))
  returning * into created_organization;

  insert into public.organization_members (org_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');

  insert into public.pipelines (org_id, name, position)
  values (created_organization.id, 'Comercial', 0)
  returning * into created_pipeline;

  insert into public.pipeline_stages (
    org_id,
    pipeline_id,
    name,
    position,
    is_won,
    is_lost
  )
  values
    (created_organization.id, created_pipeline.id, 'Novos leads', 0, false, false),
    (created_organization.id, created_pipeline.id, 'Contato realizado', 1, false, false),
    (created_organization.id, created_pipeline.id, 'Proposta', 2, false, false),
    (created_organization.id, created_pipeline.id, 'Fechado', 3, true, false),
    (created_organization.id, created_pipeline.id, 'Perdido', 4, false, true);

  insert into public.pipelines (org_id, name, position, is_post_sale, is_protected)
  values (created_organization.id, 'Pós-venda', 1, true, true)
  returning * into created_post_sale_pipeline;

  insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
  values (created_organization.id, created_post_sale_pipeline.id, 'Novos clientes', 0, false, false);

  insert into public.pipelines (org_id, name, position, is_protected)
  values (created_organization.id, 'Parceiros e fornecedores', 2, true)
  returning * into created_partners_pipeline;

  insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
  values (created_organization.id, created_partners_pipeline.id, 'Novos parceiros', 0, false, false);

  insert into public.tags (org_id, name, color, routes_to_pipeline_id)
  values
    (created_organization.id, 'Parceiro', '#2563eb', created_partners_pipeline.id),
    (created_organization.id, 'Fornecedor', '#7c3aed', created_partners_pipeline.id);

  return created_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

commit;
