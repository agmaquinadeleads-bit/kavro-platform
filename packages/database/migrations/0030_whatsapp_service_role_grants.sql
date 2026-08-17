begin;

-- Descoberto ao vivo (403 "permission denied for table whatsapp_connections"):
-- até aqui, todo GRANT pra service_role neste projeto era só de EXECUTE em
-- funções SECURITY DEFINER (essas rodam com o dono da função, não
-- precisam de GRANT na tabela). O webhook/workers novos da Evolution são
-- o primeiro código a ler/escrever tabelas whatsapp_* direto via REST
-- com a chave de service_role — e isso exige GRANT de verdade, RLS/
-- BYPASSRLS não substitui privilégio de tabela.
grant select, update on public.whatsapp_connections to service_role;
grant select, insert, update on public.whatsapp_conversations to service_role;
grant select, insert, update on public.whatsapp_messages to service_role;
grant select, insert, update on public.whatsapp_outbox to service_role;
grant select, insert, update on public.whatsapp_webhook_events to service_role;
grant select on public.whatsapp_provider_credentials to service_role;

commit;
