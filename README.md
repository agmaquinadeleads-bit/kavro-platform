# Kavro CRM

Este diretório contém o protótipo original do Kavro e será a base da migração para uma aplicação web segura e modular.

## Fontes de referência

- `legacy/hostgator/crm.zip`: backup completo da pasta publicada na HostGator em 9 de agosto de 2026.
- `index (17).html`: cópia avulsa do `crm/index.html` contido no backup.
- SHA-256: `078f5772f64727fcf349537fbac9c0aeea3658bdb3316e1441884d560755920c`

Os dois arquivos HTML possuem exatamente o mesmo conteúdo, confirmado pelo SHA-256.

O backup de produção contém `index.html`, cadastro, recuperação de senha, formulário incorporável, página de parceiros, manifesto PWA, service worker, ícones e `.htaccess`.

O protótipo deve permanecer intacto durante a migração. A nova aplicação será criada separadamente, permitindo comparar os fluxos e preservar o comportamento existente.

## Situação atual

O arquivo único reúne interface, estado, acesso ao Supabase e integrações externas. Essa arquitetura é adequada como protótipo, mas expõe lógica e credenciais ao navegador e torna testes e manutenção difíceis.

Consulte [docs/SECURITY-BASELINE.md](docs/SECURITY-BASELINE.md) e [docs/MIGRATION-ROADMAP.md](docs/MIGRATION-ROADMAP.md).
