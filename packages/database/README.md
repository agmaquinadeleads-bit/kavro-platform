# Banco de dados do Kavro

Este pacote contém o modelo proposto para a nova aplicação. As migrations não são aplicadas automaticamente ao Supabase de produção.

## Regras

- Toda entidade pertencente a um cliente carrega `org_id`.
- O tenant é obtido da sessão e validado no banco.
- RLS permanece habilitada em todas as tabelas organizacionais.
- Relações compostas impedem associar registros de organizações diferentes.
- Credenciais de integrações não pertencem a estas tabelas.
- Alterações sensíveis devem gerar eventos em `audit_events` por uma função privilegiada do backend.

Antes de qualquer aplicação em produção, este modelo será comparado com o export do Supabase atual e testado com duas organizações independentes.

