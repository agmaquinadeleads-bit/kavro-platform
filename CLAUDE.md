# CLAUDE.md — Guia de Desenvolvimento do Kavro CRM

**Última atualização:** 13 de agosto de 2026  
**Responsável:** Equipe de Arquitetura  
**Validação requerida antes de merge:** Segurança, Conformidade (dados de clientes)

---

## 1. O QUE É KAVRO CRM

### Posicionamento
**Kavro** é um CRM SaaS para agências de marketing digital e gestores de tráfego pagos (Meta Ads, Google Ads, TikTok Ads).

### Problema Resolvido
Gestores de tráfego recebem leads via formulários, WhatsApp, landing pages — mas usam planilhas Excel ou CRMs genéricos lentos. Faltam:
- Integração nativa com WhatsApp (Evolution API + Meta)
- Isolamento de dados por cliente (multi-tenant)
- Rastreamento de atribuição (UTM, Meta CAPI)
- Interface limpa e rápida para vendas

### Usuário-Alvo
- Agência digital (2-20 pessoas)
- Gestor de tráfego independente
- Loja online com atendimento WhatsApp

### Proposta de Valor
- Centralizar leads + WhatsApp em um lugar
- Rastrear origem de cada lead (attribution)
- Isolamento: cada cliente vê apenas seus dados
- Rápido: < 2s para qualquer ação

---

## 2. STACK TÉCNICO

### Frontend
- **Framework:** Next.js 16.2.12 (App Router, SSR)
- **React:** 19.2.0
- **Autenticação:** Supabase SSR (0.12.3)
- **Validação:** Zod 4.0.0
- **Testes:** Vitest 4.0.0
- **Linting:** ESLint 9.0.0

### Backend
- **Framework:** NestJS 11.1.28
- **Server:** Fastify 5.6.0
- **Autenticação:** Supabase Auth (JWT)
- **Validação:** Zod 4.0.0
- **Testes:** Vitest 4.0.0

### Banco de Dados
- **SGBD:** PostgreSQL 14+ (Supabase)
- **Auth:** Supabase Auth (email/password)
- **RLS:** Habilitado em todas as tabelas
- **Migrations:** SQL versionadas (14 migrations ativas)

### Integrações
- **WhatsApp:** Evolution API v2.3.7 (self-hosted) + Meta Cloud API (produção)
- **Stripe:** (futuro) para subscription
- **CDN:** Cloudflare (assets)
- **Logs:** Axiom (centralizados)

### Infraestrutura (Recomendado)
- **Frontend:** Vercel (Next.js nativo)
- **Backend:** Railway ou Fly.io (auto-scaling)
- **Banco:** Supabase (PostgreSQL managed)
- **Observabilidade:** Datadog ou New Relic

---

## 3. CONVENÇÕES DE CÓDIGO

### TypeScript
- ✅ Rigoroso: `strict: true` em tsconfig.json
- ✅ Sem `any` (exceto legado)
- ✅ Tipos explícitos em função públicas
- ❌ Não use `as` casting sem motivo
- ❌ Não use `!` non-null assertion sem documentar

### Nomes (Naming)

| Contexto | Padrão | Exemplo |
|----------|--------|---------|
| Banco (SQL) | snake_case | `organization_members`, `org_id` |
| JavaScript | camelCase | `organizationMembers`, `orgId` |
| Constantes | UPPER_SNAKE_CASE | `MAX_LEADS_PER_PAGE`, `API_TIMEOUT_MS` |
| Tipos/Interfaces | PascalCase | `OrganizationMember`, `LeadDTO` |
| Funções | camelCase | `createLead()`, `validateSession()` |
| Arquivo | kebab-case | `lead.controller.ts`, `auth.guard.ts` |
| Componente React | PascalCase | `DashboardLeads.tsx`, `MetaAuthPopup.tsx` |

### Padrão de Erro

**Backend (NestJS):**
```typescript
throw new BadRequestException("Descrição em português")
throw new UnauthorizedException("Sessão expirada")
throw new ForbiddenException("Seu perfil não pode fazer isso")
throw new NotFoundException("Lead não encontrado")
throw new ConflictException("Email já cadastrado")
```

**Frontend (Server Actions):**
```typescript
if (!input.success) redirect("/app?error=invalid_lead");
if (error) redirect(`/app/leads/${id}?error=update_failed`);
// Query params: error=[key], success=[key], redirect automático
```

### Padrão de Validação

**Sempre usar Zod:**
```typescript
const schema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().nullable(),
  orgId: z.string().uuid()
});

const input = schema.safeParse(data);
if (!input.success) {
  throw new BadRequestException("Validação falhou");
}
// Usar input.data (tipado)
```

### Padrão de Autenticação

**Frontend (Server Actions):**
```typescript
async function authenticatedContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");
  
  return { supabase, user, orgId: membership.org_id, role: membership.role };
}
```

**Backend (NestJS Guard):**
```typescript
@UseGuards(KavroAuthGuard)
@Get("/:id")
getResource(@CurrentSession() session: KavroSession) {
  // session.orgId extraído do JWT
  // session.userId validado
  // session.role (owner|admin|member)
}
```

### Padrão de Isolamento Multi-Tenant

**Regra 1: Sempre validar org_id no contexto**
```typescript
// ✅ BOM
const { supabase, orgId } = await authenticatedContext();

// ✌️ NÃO COPIE org_id do input do usuário
await supabase
  .from("leads")
  .insert({ org_id: orgId, ... }) // Força orgId do contexto

// ❌ MAU (usuário pode escolher qualquer org)
await supabase
  .from("leads")
  .insert({ org_id: input.orgId, ... })
```

**Regra 2: WHERE sempre inclui org_id**
```typescript
// ✅ BOM
await supabase
  .from("leads")
  .update({ name: input.name })
  .eq("id", leadId)
  .eq("org_id", orgId) // Dupla validação (RLS + aplicação)
  .select("id");

// ❌ MAU (confiar apenas em RLS)
await supabase
  .from("leads")
  .update({ name: input.name })
  .eq("id", leadId)
  .select("id");
```

### Padrão de Server Actions

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
});

export async function myAction(formData: FormData) {
  const input = schema.safeParse({
    name: formData.get("name"),
  });
  if (!input.success) redirect("/page?error=invalid");
  
  const { supabase, orgId } = await authenticatedContext();
  const { error } = await supabase.from("table").insert({
    org_id: orgId,
    name: input.data.name,
  });
  
  if (error) redirect("/page?error=create_failed");
  revalidatePath("/app"); // Invalidar cache
  redirect("/page?success=created");
}
```

### Padrão de RLS (Supabase)

```sql
-- Tabela
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Policy: select
CREATE POLICY leads_select_member ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- Policy: insert
CREATE POLICY leads_insert_member ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id) 
    AND created_by = auth.uid()
  );

-- Policy: update
CREATE POLICY leads_update_member ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id));

-- Policy: delete (admin only)
CREATE POLICY leads_delete_admin ON public.leads
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, array['owner', 'admin']));
```

---

## 4. ESTRUTURA DE PASTAS

```
kavro/
├── apps/
│   ├── api/                      # Backend NestJS
│   │   ├── src/
│   │   │   ├── auth/             # Autenticação
│   │   │   ├── modules/          # Módulos NestJS
│   │   │   └── whatsapp/         # Integração WhatsApp
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.mts
│   │
│   └── web/                      # Frontend Next.js
│       ├── src/
│       │   ├── app/              # App Router (Next.js 13+)
│       │   ├── components/       # Componentes reutilizáveis
│       │   └── lib/              # Utilitários
│       ├── public/               # Assets (imagens, ícones)
│       ├── scripts/              # Testes de integração
│       ├── package.json
│       ├── next.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── contracts/                # Tipos TypeScript compartilhados
│   │   ├── src/
│   │   │   └── index.ts          # Schemas Zod
│   │   └── package.json
│   │
│   └── database/                 # SQL Migrations
│       ├── migrations/           # Versionadas (0001-0014...)
│       └── README.md
│
├── docs/                         # Documentação de arquitetura
│   ├── SECURITY-BASELINE.md
│   ├── MIGRATION-ROADMAP.md
│   └── WHATSAPP-ARCHITECTURE.md
│
├── .claude/                      # Configuração Claude Code
│   └── agents/                   # Subagentes (8 arquivos)
│
├── CLAUDE.md                     # Este arquivo
├── COMPLIANCE.md
├── WHATSAPP-RISCO.md
├── DESIGN.md
├── PERFORMANCE.md
├── HOSTING.md
├── ROADMAP.md
├── README.md
├── Dockerfile
├── Dockerfile.web
├── docker-compose.yml            # (futuro)
├── pnpm-workspace.yaml
└── .gitignore
```

---

## 5. COMANDOS ESSENCIAIS

### Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Rodar tudo (web + api)
pnpm dev

# Rodar apenas frontend
pnpm --filter @kavro/web dev

# Rodar apenas backend
pnpm --filter @kavro/api dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

### Testes

```bash
# Todos os testes
pnpm test

# Teste específico: CRUD de leads
npm run test:leads

# Teste: isolamento multi-tenant
npm run test:rls

# Teste: team invitations
npm run test:team

# Teste: WhatsApp RLS
npm run test:whatsapp

# Teste: lead tasks
npm run test:tasks
```

### Database

```bash
# Conectar ao Supabase local (futuro docker-compose)
# Por enquanto, usar Supabase cloud staging

# Aplicar migrações
supabase db push

# Ver status
supabase status
```

### Deploy

```bash
# Staging (Railway)
git push origin develop

# Produção (Vercel + Railway)
git push origin main
```

---

## 6. PADRÃO DE EDIÇÃO DE CÓDIGO

### Regra de Ouro
**NUNCA reescreva um arquivo inteiro.** Edições cirúrgicas apenas.

### Quando Editar (Edit tool)
- Mudança < 30% do arquivo
- Mudança lógica e isolada
- Não muda estrutura geral

### Quando Refatorar (Delete + Write)
- Mudança > 30% do arquivo
- Restruturação de lógica
- Documentar o por quê no commit

### Checklist Antes de Commitar

- [ ] TypeScript compila sem erro (`pnpm typecheck`)
- [ ] Sem `eslint` warnings (`pnpm lint`)
- [ ] Testes passam (`pnpm test` ou específico)
- [ ] Sem `console.log` em código de produção
- [ ] Sem credenciais commitadas
- [ ] Sem código morto (imports não usados)
- [ ] RLS validado (se mudança no banco)
- [ ] Commit granular (uma mudança lógica por commit)
- [ ] Mensagem de commit clara em português

### Padrão de Commit

```
feat: adiciona endpoint GET /v1/leads

- Listar leads com paginação (25/página)
- Filtro por stage opcional
- RLS valida org_id
- Testes: test-lead-crud.mjs passa

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 7. PADRÃO DE SEGURANÇA

### Checklist Antes de Mergear (Dados de Clientes)

- [ ] **Isolamento:** org_id sempre validado em WHERE
- [ ] **RLS:** Política criada ou revisada (se tabela nova)
- [ ] **Validação:** Input com Zod (nunca string raw)
- [ ] **Credenciais:** Nenhuma em código (somente .env)
- [ ] **Logs:** Sem PII (id apenas, nunca email/nome)
- [ ] **Webhook:** Assinado (SHA-256 ou secret)
- [ ] **Autorização:** Role check (owner/admin/member)
- [ ] **SQL Injection:** Usar query builder (não string interpolation)
- [ ] **CSRF:** Supabase trata automaticamente
- [ ] **Rate limiting:** Implementado para endpoints públicos

---

## 8. PADRÃO DE PERFORMANCE

### Frontend

- [ ] Bundle size < 200KB (gzipped)
- [ ] Sem imports desnecessários (tree-shake)
- [ ] Imagens otimizadas (JPEG/WebP, responsive)
- [ ] Lazy loading em componentes heavy (chat, relatórios)
- [ ] Nenhum console.log em produção
- [ ] Caching com revalidatePath/ISR

### Backend

- [ ] Query P95 < 100ms (verificar com EXPLAIN)
- [ ] Sem N+1 queries (use select() com cuidado)
- [ ] Paginação sempre (limit 25-100)
- [ ] Caching de lookups (org config, profiles)
- [ ] Sem loop síncrono (use queue para jobs)

### Banco de Dados

- [ ] Índice criado se novo WHERE (org_id, created_at)
- [ ] Análise de query plan (PostgreSQL EXPLAIN)
- [ ] Sem full table scan (exceto migração)
- [ ] Test com 1M de registros (synthetic data)

**Métrica de Sucesso:** API P95 < 200ms, Lighthouse ≥ 90

---

## 9. TESTES

### Integração (Scripts manuais em `apps/web/scripts/`)

```bash
npm run test:leads    # CRUD de leads
npm run test:rls      # Isolamento multi-tenant
npm run test:team     # Invitations + remoção
npm run test:tasks    # Lead tasks
npm run test:whatsapp # RLS de WhatsApp
```

### Unitário (Vitest)

```bash
pnpm test  # Rodar tudo
```

**Objetivo:** 70%+ coverage ao final (MVP: aceitável sem)

### Antes de Mergear

1. Rodar testes relevantes (`npm run test:*`)
2. Verificar sem regressão em features antigas
3. Checar performance (nenhuma query > 100ms)
4. Validar isolamento (se toca dados)

---

## 10. DOCUMENTAÇÃO

### Quando Documentar

- ✅ Decisões de arquitetura (em `docs/`)
- ✅ Fluxo complexo (diagrama ou prosa)
- ✅ RLS policy não óbvia (comentário na migração)
- ✅ Webhook schema (em `docs/` ou código)
- ❌ Não documentar "o quê" o código faz (código limpo fala por si)
- ❌ Não usar TODOs no código (falar em issue/chat)

### Checklist de PR

- [ ] Commit message clara (português)
- [ ] Documentação de decisão atualizada (se necessário)
- [ ] Código reviewável (< 400 linhas por commit)
- [ ] Tests passam
- [ ] Performance OK (P95 latência)

---

## 11. CHECKLIST DE PERFORMANCE POR FEATURE

### Frontend
- [ ] Sem imports desnecessários (tree-shake check)
- [ ] Sem console.log em produção
- [ ] Imagens otimizadas (JPEG/WebP, responsive)
- [ ] Nenhum bundle > 50KB por rota
- [ ] Lazy loading em components heavy (chat, relatórios)

### Backend
- [ ] Query P95 < 100ms (verificar com EXPLAIN)
- [ ] Sem N+1 queries (usar select() com cuidado)
- [ ] Paginação sempre (limit 25-100)
- [ ] Caching de lookups (org config, user profiles)
- [ ] Sem loop síncrono (jobs via queue)

### Banco
- [ ] Índice criado se WHERE novo
- [ ] Análise de query plan (PostgreSQL)
- [ ] Sem full table scan (exceto migração)
- [ ] Test com 1M de registros (synthetic data)

### Monitoramento
- [ ] Métrica de latência adicionada (se endpoint novo)
- [ ] Erro tracking configurado (Sentry/Datadog)
- [ ] Alerta criado se > P99

---

## 12. REFERÊNCIAS RÁPIDAS

### Supabase Auth (Frontend)
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
const { error } = await supabase.auth.signOut();
```

### RLS Helper (Backend)
```sql
CREATE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = $1 AND user_id = auth.uid()
  )
$$ LANGUAGE SQL SECURITY DEFINER;
```

### Zod Schema (Compartilhado)
```typescript
export const leadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email().nullable(),
});
export type Lead = z.infer<typeof leadSchema>;
```

---

**Fim do CLAUDE.md**
