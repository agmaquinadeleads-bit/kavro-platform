begin;

-- Etapa que exige informar a proposta (produto/serviço + valor) antes do
-- lead entrar nela — ex: "Proposta apresentada". Independente de
-- is_won/is_lost (uma etapa aberta comum pode exigir isso).
alter table public.pipeline_stages add column requires_proposal boolean not null default false;

alter table public.leads add column proposal_product text
  check (proposal_product is null or char_length(trim(proposal_product)) between 1 and 160);

-- Redefine set_lead_write_metadata (0019_post_sale_pipeline.sql) só pra
-- adicionar a checagem de requires_proposal — resto da função idêntico.
-- Ao contrário de won_product/loss_reason, proposal_product não é limpo
-- ao sair da etapa: é um registro do que foi oferecido, continua fazendo
-- sentido mesmo depois do lead avançar (ou ser fechado).
create or replace function public.set_lead_write_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_stage public.pipeline_stages;
begin
  select * into target_stage
  from public.pipeline_stages
  where id = new.stage_id and org_id = new.org_id and pipeline_id = new.pipeline_id;

  if target_stage.id is null then
    raise exception 'Invalid pipeline stage' using errcode = '23503';
  end if;

  if target_stage.is_lost and nullif(trim(new.loss_reason), '') is null then
    raise exception 'Loss reason is required' using errcode = '23514';
  end if;

  if target_stage.is_won and nullif(trim(new.won_product), '') is null then
    raise exception 'Product is required' using errcode = '23514';
  end if;

  if target_stage.requires_proposal and (nullif(trim(new.proposal_product), '') is null or new.value_in_cents <= 0) then
    raise exception 'Proposal product and value are required' using errcode = '23514';
  end if;

  new.status := case
    when target_stage.is_won then 'won'::public.lead_status
    when target_stage.is_lost then 'lost'::public.lead_status
    else 'open'::public.lead_status
  end;
  new.loss_reason := case when target_stage.is_lost then trim(new.loss_reason) else null end;
  new.won_product := case when target_stage.is_won then trim(new.won_product) else null end;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

commit;
