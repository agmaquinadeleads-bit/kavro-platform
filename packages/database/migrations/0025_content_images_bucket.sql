begin;

-- Bucket público (a Graph API da Meta precisa buscar a imagem por uma URL
-- pública pra criar o container de mídia — não dá pra usar URL assinada
-- privada). Primeiro bucket de Storage usado no projeto.
insert into storage.buckets (id, name, public)
values ('content-images', 'content-images', true)
on conflict (id) do nothing;

-- Convenção de path: <org_id>/<arquivo> — a policy usa o primeiro
-- segmento do caminho como org_id pra aplicar o mesmo isolamento
-- multi-tenant do resto do projeto.
create policy content_images_select_public on storage.objects for select
  to public
  using (bucket_id = 'content-images');

create policy content_images_insert_member on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'content-images'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

create policy content_images_delete_admin on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'content-images'
    and public.has_org_role((storage.foldername(name))[1]::uuid, array['owner', 'admin']::public.organization_role[])
  );

commit;
