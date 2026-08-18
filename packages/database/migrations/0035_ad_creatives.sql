begin;

-- Lista de origens de lead (ex: Meta Ads, Google Ads, Indicação) — mesmo
-- padrão de public.tags (0020_tags_and_audit_detail.sql), sem cor nem
-- roteamento automático, que não fazem sentido aqui.
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create unique index lead_sources_org_name_unique on public.lead_sources (org_id, lower(name));

alter table public.lead_sources enable row level security;

create policy lead_sources_select_member
  on public.lead_sources for select
  to authenticated
  using (public.is_org_member(org_id));

create policy lead_sources_write_admin
  on public.lead_sources for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.lead_sources from anon, authenticated;
grant select, insert, update, delete on public.lead_sources to authenticated;

-- Criativo de anúncio: guarda a mensagem inicial exata que o WhatsApp
-- pré-preenche quando alguém clica no anúncio ("Enviar mensagem") — é
-- essa mensagem que identifica de qual criativo o lead veio, comparada
-- em create_lead_from_whatsapp() (redefinida abaixo).
create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  source_id uuid,
  initial_message text not null check (char_length(trim(initial_message)) between 1 and 4000),
  image_object_key text check (image_object_key is null or char_length(image_object_key) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, source_id) references public.lead_sources(org_id, id) on delete set null
);

-- Duas mensagens iniciais idênticas (mesmo texto) tornariam a origem
-- ambígua — cada criativo precisa de uma mensagem única dentro da org.
create unique index ad_creatives_org_message_unique on public.ad_creatives (org_id, lower(trim(initial_message)));
create index ad_creatives_org_source_idx on public.ad_creatives (org_id, source_id);

alter table public.ad_creatives enable row level security;

create policy ad_creatives_select_member
  on public.ad_creatives for select
  to authenticated
  using (public.is_org_member(org_id));

create policy ad_creatives_write_admin
  on public.ad_creatives for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.ad_creatives from anon, authenticated;
grant select, insert, update, delete on public.ad_creatives to authenticated;

create or replace function public.touch_ad_creative_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

revoke all on function public.touch_ad_creative_updated_at() from public;
create trigger ad_creatives_touch before update on public.ad_creatives for each row execute function public.touch_ad_creative_updated_at();

-- Bucket público (igual content-images, 0025_content_images_bucket.sql)
-- — só imagem de referência do anúncio pra organização interna, não é
-- dado sensível.
insert into storage.buckets (id, name, public)
values ('ad-creative-images', 'ad-creative-images', true)
on conflict (id) do nothing;

create policy ad_creative_images_select_public on storage.objects for select
  to public
  using (bucket_id = 'ad-creative-images');

create policy ad_creative_images_insert_admin on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ad-creative-images'
    and public.has_org_role((storage.foldername(name))[1]::uuid, array['owner', 'admin']::public.organization_role[])
  );

create policy ad_creative_images_delete_admin on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ad-creative-images'
    and public.has_org_role((storage.foldername(name))[1]::uuid, array['owner', 'admin']::public.organization_role[])
  );

create policy ad_creative_images_bucket_visible on storage.buckets for select
  to public
  using (id = 'ad-creative-images');

-- create_lead_from_whatsapp ganha p_message_text (parâmetro novo — dropa
-- e recria em vez de "or replace" puro, pra não deixar duas versões
-- sobrepostas da função com assinaturas diferentes). Se o texto bater
-- (exato, sem diferenciar maiúscula/espaço nas pontas) com a mensagem
-- inicial de algum criativo da org, o lead nasce com esse criativo como
-- origem em vez do genérico "whatsapp".
drop function if exists public.create_lead_from_whatsapp(uuid, uuid, uuid, text, text);

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
    return existing_lead_id;
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
