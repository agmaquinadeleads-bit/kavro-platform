begin;

-- Até aqui só existia policy de select pra whatsapp_conversations
-- (0010_whatsapp_foundation.sql) — o badge de não lidas nunca zerava
-- depois que o usuário efetivamente abria a conversa, porque o navegador
-- não tinha permissão nenhuma de update na tabela. Restringe a coluna
-- liberada só a unread_count (grant por coluna), então o usuário não
-- consegue alterar mais nada na conversa por essa via.
create policy whatsapp_conversations_mark_read_member on public.whatsapp_conversations
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

grant update (unread_count) on public.whatsapp_conversations to authenticated;

commit;
