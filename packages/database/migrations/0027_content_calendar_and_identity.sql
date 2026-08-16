begin;

-- Refinamento do módulo de conteúdo: identidade visual da marca (injetada
-- automaticamente em toda geração por IA) e organização por mês
-- (calendário macro/micro em /app/conteudo/[brandId]/[year]/[month]).

alter table public.brands
  add column visual_identity text
    check (visual_identity is null or char_length(visual_identity) <= 4000);

alter table public.editorial_lines
  add column target_month date not null default date_trunc('month', now())::date;

create index editorial_lines_brand_month_idx
  on public.editorial_lines (brand_id, target_month);

commit;
