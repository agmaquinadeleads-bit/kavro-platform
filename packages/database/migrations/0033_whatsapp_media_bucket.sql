begin;

-- Bucket privado (diferente de content-images) — áudio/mídia de conversa
-- é dado de cliente, não deve ser público. O backend grava com a
-- service_role key (que ignora RLS de Storage por padrão), o navegador só
-- lê via URL assinada gerada pelo membro autenticado da org dona da mídia.
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

-- Convenção de path: <org_id>/<connection_id>/<arquivo> — a policy usa o
-- primeiro segmento do caminho como org_id, mesmo padrão de content-images
-- (0025_content_images_bucket.sql).
create policy whatsapp_media_select_member on storage.objects for select
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

-- Precisa pra ENVIAR áudio/imagem: o upload do arquivo escolhido no CRM
-- acontece direto do navegador (Server Action com a sessão do usuário),
-- antes de chamar a API pra enfileirar o envio de verdade.
create policy whatsapp_media_insert_member on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

-- Sem essa policy o endpoint de metadata do bucket (/storage/v1/bucket/{id})
-- devolve 404 mesmo o bucket existindo (mesmo problema já visto em
-- 0026_content_images_bucket_visibility.sql) — aqui restrito a
-- authenticated, já que o bucket é privado.
create policy whatsapp_media_bucket_visible on storage.buckets for select
  to authenticated
  using (id = 'whatsapp-media');

commit;
