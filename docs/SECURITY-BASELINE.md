# Linha de base de segurança

Data da primeira análise: 9 de agosto de 2026.

## Prioridade crítica

1. Rotacionar a chave da Evolution API atualmente embutida no frontend.
2. Invalidar credenciais de WhatsApp e Meta que possam ter sido usadas ou persistidas no navegador.
3. Mover todas as chamadas privilegiadas de WhatsApp, Meta e Stripe para endpoints autenticados no backend.
4. Auditar todas as tabelas e políticas RLS do Supabase antes de disponibilizar o produto a terceiros.

Os valores das credenciais não são reproduzidos neste documento.

## Constatações

- Existe uma chave fixa de integração entregue ao navegador.
- Tokens de canais são armazenados ou consultados pelo frontend e pelo `localStorage`.
- Há chamadas diretas do navegador para APIs externas privilegiadas.
- O modo de desenvolvimento local usa um token estático no cliente e não constitui autenticação segura.
- A chave publicável do Supabase no frontend é esperada, mas só é segura se todas as tabelas, views, RPCs, Storage buckets e funções tiverem autorização correta.
- O uso extensivo de `innerHTML` e handlers inline aumenta o risco de XSS e dificulta uma Content Security Policy rigorosa.
- Dependências carregadas por CDN não possuem build reproduzível nem lockfile.
- Não há suíte automatizada de testes, análise estática ou pipeline de segurança no diretório atual.

## Controles obrigatórios na nova aplicação

- Segredos somente no servidor e em cofre de segredos.
- Autenticação real em todos os ambientes, sem bypass no bundle de produção.
- Isolamento por organização com RLS deny-by-default.
- Autorização por organização, função, recurso e ação.
- Validação de toda entrada no servidor.
- Cookies seguros ou tokens curtos com rotação e revogação.
- Rate limiting, proteção contra abuso e webhooks assinados/idempotentes.
- Auditoria de operações sensíveis.
- CSP, proteção contra XSS/CSRF/SSRF e uploads inseguros.
- Testes automatizados de acesso cruzado entre organizações.
- Backups com restauração testada e controles de retenção compatíveis com LGPD.

## Condição para produção

Nenhuma vulnerabilidade crítica ou alta aberta; isolamento multi-tenant testado; restauração de backup comprovada; integrações privilegiadas executadas exclusivamente no backend.

