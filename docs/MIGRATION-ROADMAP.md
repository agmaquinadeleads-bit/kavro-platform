# Roteiro de migração

## Princípio

A migração será incremental. O protótipo HTML permanecerá como referência visual e funcional enquanto cada fluxo ganha frontend modular, API, persistência, autorização e testes.

## Domínios planejados

- `kavrocrm.com.br`: site institucional, aquisição e conteúdo público.
- `app.kavrocrm.com.br`: aplicação de produção e login dos clientes.
- `staging.kavrocrm.com.br`: homologação isolada, nunca conectada às credenciais de produção.
- `api.kavrocrm.com.br`: API autenticada e integrações executadas no servidor.

O DNS atual não será alterado antes da homologação e de um plano de rollback aprovado.

## Etapa 0 — Descoberta e contenção

- Congelar a versão de referência.
- Inventariar telas, tabelas, funções e integrações.
- Rotacionar credenciais expostas.
- Exportar schema, migrations, funções e políticas RLS do Supabase sem segredos.
- Definir critérios de aceite e métricas do produto.

## Etapa 1 — Fundação

- Monorepo TypeScript.
- Frontend React/Next.js.
- Backend modular em TypeScript.
- PostgreSQL/Supabase com migrations versionadas.
- Autenticação, organizações, papéis e auditoria.
- CI, testes e ambiente de homologação.

## Etapa 2 — CRM essencial

- Contatos, empresas e leads.
- Negócios, pipelines e etapas.
- Tarefas, atividades e campos personalizados.
- Pesquisa, filtros, importação e exportação.
- Dashboards essenciais.

## Etapa 3 — Comunicação e automações

- WhatsApp oficial com credenciais no backend.
- Caixa compartilhada, números, filas e histórico.
- E-mail, calendário e webhooks.
- Automações com logs, retries, idempotência e versionamento.

## Etapa 4 — Produto comercial

- Relatórios, metas e forecast.
- Assinaturas, planos e limites aplicados no servidor.
- Onboarding, administração e recursos LGPD.
- IA assistiva e auditável.

## Etapa 5 — Hardening e lançamento

- Testes E2E, carga, segurança e acessibilidade.
- Observabilidade, alertas e runbooks.
- Backup, restauração e rollback ensaiados.
- Homologação com usuários reais.
