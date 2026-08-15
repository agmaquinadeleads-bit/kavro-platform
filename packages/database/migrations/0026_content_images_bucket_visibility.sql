begin;

-- storage.buckets tem RLS própria, separada de storage.objects — sem uma
-- policy aqui, o endpoint de metadata do bucket (/storage/v1/bucket/{id})
-- devolve 404 mesmo o bucket existindo e sendo público pra leitura de
-- objetos. Só torna o bucket "content-images" visível, não os outros.
create policy content_images_bucket_visible on storage.buckets for select
  to public
  using (id = 'content-images');

commit;
