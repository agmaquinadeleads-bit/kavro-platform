begin;

-- Faltou na migration anterior (0030): o botão "Excluir" chama um DELETE
-- direto via REST com a chave de service_role, e só tinha sido concedido
-- select/update pra whatsapp_connections. As demais tabelas (provider
-- credentials, conversations, messages) se limpam sozinhas via ON DELETE
-- CASCADE — isso não precisa de GRANT extra pra elas, é o Postgres
-- aplicando a constraint, não uma query nova do service_role.
grant delete on public.whatsapp_connections to service_role;

commit;
