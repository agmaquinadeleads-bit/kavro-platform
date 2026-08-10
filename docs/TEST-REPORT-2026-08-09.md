# Relatório de teste — fundação multi-tenant

Data: 9 de agosto de 2026  
Ambiente: Kavro Staging  
Dados: exclusivamente fictícios

## Resultado

Status geral: aprovado.

| Teste | Resultado |
|---|---|
| Usuário externo não lê lead de outra organização | Passou |
| Proprietário não lê lead da organização externa | Passou |
| Usuário externo não altera lead de outra organização | Passou |
| Usuário externo não insere lead em outra organização | Passou |
| Membro autorizado lê dados da própria organização | Passou |
| Login com usuário válido do staging | Passou |
| Sessão carrega a organização correta | Passou |
| Logout encerra a sessão e retorna ao login | Passou |
| Acesso direto a `/app` sem sessão retorna ao login | Passou |
| Link de recuperação de senha está disponível | Passou |
| Criação autorizada protege criador e versão | Passou |
| Etapa pertencente a outro tenant é rejeitada | Passou |
| Movimentação incrementa a versão | Passou |
| Escrita concorrente desatualizada é rejeitada | Passou |
| Arquivamento lógico remove o lead do funil ativo | Passou |
| Exclusão definitiva pelo frontend é negada | Passou |
| Auditoria registra criação, movimentação e arquivamento | Passou |
| Jornada UI: criar → mover → arquivar | Passou |
| Busca por lead preserva os filtros na URL | Passou |
| Detalhe protegido carrega somente o lead da organização | Passou |
| Edição versionada atualiza os dados | Passou |
| Histórico exibe a atualização auditada | Passou |
| Detalhe responsivo em viewport de 390 px | Passou |

## Escopo comprovado

As políticas RLS iniciais bloquearam tentativas cruzadas de `SELECT`, `UPDATE` e `INSERT` entre duas organizações. O acesso autorizado ao próprio tenant permaneceu funcional. O fluxo SSR de login, leitura da organização, logout e proteção da rota interna também foi validado no navegador.

## Limites

Este teste valida a fundação inicial, não a segurança completa do produto. Ainda serão adicionados testes para exclusão, papéis, convites, Storage, Realtime, funções, revogação de sessão e troca de organização.

Nenhuma credencial, chave ou dado pessoal foi registrado na saída do teste.

## Módulo de tarefas — 10/08/2026

- Migração `0004_lead_tasks.sql` aplicada no Kavro Staging.
- Criação de tarefa com campos protegidos: aprovado.
- Isolamento entre organizações na leitura e atualização: aprovado.
- Conclusão com incremento de versão e bloqueio de escrita antiga: aprovado.
- Exclusão definitiva bloqueada: aprovado.
- Auditoria de criação, conclusão e reabertura: aprovado.
- Fluxo visual criar → concluir → reabrir: aprovado.
- Exibição de prazo atrasado e contador de pendências: aprovado.
- Credenciais ou valores sensíveis impressos durante os testes: não.

## Central de tarefas e responsáveis — 10/08/2026

- Migração `0005_team_profiles_and_lead_assignment.sql` aplicada no Kavro Staging.
- Regressão de segurança completa do módulo de tarefas: aprovada.
- Central de tarefas pendentes no painel: aprovada.
- Alternância de visualização Minhas/Equipe para proprietário: aprovada.
- Prazo atrasado e vínculo com o lead: aprovados.
- Diretório interno de perfis da organização: aprovado.
- Atribuição de responsável pela interface: aprovada.
- Proteção de tenant, autoria e responsável externo: implementada no banco.

## Convites de equipe — 10/08/2026

- Migrações `0006_team_invitations.sql` e `0007_fix_invitation_crypto_schema.sql` aplicadas no Kavro Staging.
- Token aleatório com apenas hash persistido: aprovado.
- Isolamento de convite entre organizações: aprovado.
- Aceite por usuário inelegível/e-mail divergente: bloqueado.
- Cancelamento e bloqueio de reutilização: aprovados.
- Auditoria sem vazamento do token: aprovada.
- Página de equipe, criação do link e cancelamento pela interface: aprovados.
- Página pública exige ação POST para aceitar: aprovada.

## Remoção segura de membros — 10/08/2026

- Migrações `0008_safe_member_removal.sql` e reforço `0009_harden_member_removal.sql` aplicados no Kavro Staging.
- Autorremoção do proprietário: bloqueada.
- Remoção de usuário de outra organização: bloqueada.
- Revalidação de papel após lock da organização: implementada.
- Redistribuição transacional de leads e tarefas: implementada.
- Alteração indevida de tarefa arquivada durante redistribuição: bloqueada.
- Regressão completa das tarefas após o reforço: aprovada.

## Fundação WhatsApp — 10/08/2026

- Migração `0010_whatsapp_foundation.sql` aplicada no Kavro Staging.
- Leitura RLS das conexões, conversas e mensagens: aprovada.
- Criação de conexão diretamente pelo navegador: bloqueada.
- Injeção direta de mensagem e webhook pelo navegador: bloqueada.
- Isolamento de registros WhatsApp entre organizações: aprovado.
- Contratos compartilhados de conexão, texto, mídia e idempotência: compilados.
- Guard de sessão multi-tenant e adaptador Evolution server-only: compilados.
- Build completo de contracts, API e web: aprovado.
- Estado vazio da caixa compartilhada e navegação para configurações: aprovados.
- Tela de preparação mantém conexão desabilitada e produção intocada: aprovada.
