# 📋 ROADMAP v2 — Pragmático (Seguindo HTML)

**Atualizado:** 14 ago 2026  
**Estratégia:** Trazer features do HTML primeiro, depois API REST

---

## 🎯 Filosofia

**Prioridade:** MVP completo (UI funcional) antes de integrações avançadas.

Usuário com **experiência real** em 8 semanas > API perfeita em 17 semanas.

---

## ETAPA 0: ✅ COMPLETO
**Fundação, Auth, CRUD Leads via Server Actions, Deploy**

---

## ETAPA 1: UI Leads Completa (2 semanas)

**O quê:** Tabela + Filtros + Paginação + Bulk Actions + Loss Modal

### Task 1.1: Tabela Leads com Paginação
- Colunas: Nome, Email, Telefone, Origem, Etapa, Valor, Atribuído, Data
- Paginação: 25/50/100 por página
- Ordenação: Headers sortable (▲▼)
- Status badges coloridos

### Task 1.2: Filtros Compartilhados
- Barra com: Search (nome/email), Date (from-to), Stage, Origem, Criativo
- Presets: "Hoje", "Vencidos", "Semana", "Mês"
- Apply/Reset

### Task 1.3: Bulk Actions
- Checkbox: Select all + Individuais
- Floating bar: Contador + Delete button + Cancel
- Confirmação antes de delete

### Task 1.4: Loss Modal & Reasons
- Modal com 6 razões: Sem orçamento, Competitor, Desistiu, Sem contato, Outro
- Confirmar move para "Loss" etapa
- Registrar em audit trail

---

## ETAPA 2: Dashboard + Gráficos (2 semanas)

**O quê:** KPIs + Gráficos interativos (Chart.js)

### Task 2.1: KPI Grid
- 40 métricas (4 linhas x 10 colunas)
- Cards com: Label, Value (clamp responsive), Status (green/warn/red)
- Tipos: Operational (2 cols), Financial (5 cols)

### Task 2.2: Gráficos
- Evolução: Line chart (leads por dia, últimos 30 dias)
- Loss: Pie chart (razões de perda)
- Origem: Bar chart (leads por canal: Meta, Google, Direct, etc)
- Valor: Currency chart (faturamento por origem)

### Task 2.3: Alertas & Funnel
- Alert bar: "X vencidos", "Y para hoje"
- Funnel: Tabela Origem → Count → % → Bar visual

---

## ETAPA 3: Conversas/Chat UI (3 semanas)

**O quê:** Interface de chat + Media support (conecta com Evolution API backend)

### Task 3.1: Listagem de Conversas
- Lead list: Nome, Last message preview, Unread count badge
- Search de conversas
- Filtros: Stage, Origin, Creative

### Task 3.2: Chat Detalhado
- Messages stacked (user/bot, different colors)
- Timestamps
- Typing indicator ("... está digitando")
- Message status: Enviando, Entregue, Lido

### Task 3.3: Media Support
- Upload: Imagens (JPG/PNG), Vídeos, Documentos, Áudio
- Thumbnail preview
- Download option
- File info: Type, Size

### Task 3.4: Input Area & Audio
- Text input + Send button
- Emoji picker (opcional)
- Attach files (drag-drop ou select)
- Audio record bar: Gravar/enviar áudio (Wave API)

### Task 3.5: Channel Selector
- Dropdown: WhatsApp (default), Email (future), SMS (future)
- Display sender context (phone/email/name)

---

## ETAPA 4: Relatórios (1 semana)

**O quê:** 4 relatórios padrão + Export PDF

### Task 4.1: Relatório Origem
- Tabela: Origem | Count | % | Trending (↑↓)
- Gráfico pie abaixo

### Task 4.2: Relatório Etapa/Conversão
- Tabela: Etapa | Total | % da anterior
- Taxa conversão (qual % sai de cada etapa?)

### Task 4.3: Relatório Valor
- Tabela: Origem | Valor médio | Total | % do total
- Gráfico bar

### Task 4.4: Export PDF
- Usar jsPDF (já no HTML)
- Incluir: Título, Data range, Tabela, Gráfico
- Logo Kavro no header

---

## ETAPA 5: Configurações (2 semanas)

**O quê:** Team, Billing, Webhooks, Export, Auditoria

### Task 5.1: Team Management
- Listar membros: Nome, Email, Role, Status
- Invite nova pessoa: Copiar link ou enviar email
- Remover membro: Confirm + soft delete
- Mudar role: owner/admin/member (só owner)

### Task 5.2: Billing & Trial
- Mostrar: Plano atual, Próximo billing date, Days left
- Upgrade button (Stripe — future)
- Billing lock: Overlay se limite atingido

### Task 5.3: Webhooks
- CRUD webhooks: URL, Events (lead.created, lead.updated, etc)
- Teste: Send test payload
- Logs: Últimas 100 requests (timestamp, status, payload)

### Task 5.4: Export Dados
- CSV: Leads + Conversas
- JSON: Full backup
- Filtro: Data range + Stage
- Async download (backend job)

### Task 5.5: Auditoria
- Tabela: Ação | Usuario | Timestamp | Detalhes
- Filtro: Tipo (create/update/delete), Data
- Exportar auditoria em CSV

---

## ETAPA 6: Polish & Performance (1 semana)

**O quê:** Dark mode, Toast, Loading states, Responsivo

### Task 6.1: Toast System
- Container (bottom-right)
- Tipos: Success, Error, Warning, Info
- Auto-dismiss (4-6s)
- Stacking

### Task 6.2: Dark Mode Completo
- Verificar CSS vars em todas componentes
- Toggle button (persist em localStorage)
- Testes light/dark

### Task 6.3: Loading States
- Skeleton screens (tabelas, gráficos)
- Spinner em botões (enviando mensagem, etc)
- Disable inputs durante save

### Task 6.4: Responsivo
- Mobile: < 768px sidebar collapsa, layout adapta
- Tablet: 768-1200px
- Desktop: > 1200px
- Testes em iPhone 12, iPad, Desktop

---

## ETAPA 7: Integrações Avançadas (3 semanas)

**O quê:** Zapier, Make.com, Webhooks, Atribuição

### Task 7.1: Zapier Integration
- Publicar triggers: Lead criado, Lead movido, Conversa recebida
- Documentação: Endpoints, Payloads

### Task 7.2: Make.com (OpenAI Automation)
- Mesmo que Zapier
- Exemplos: Auto-responder, Lead scoring, Summarize conversations

### Task 7.3: Atribuição (UTM + Meta CAPI)
- Rastrear UTM params de origin
- Integrar com Meta Conversions API
- Mostrar origem de cada lead

---

## ETAPA 8: API REST Leads (1 semana)

**O quê:** HTTP endpoints (quando UI tiver 100%)

```
GET    /v1/leads              # List com paginação
POST   /v1/leads              # Criar
GET    /v1/leads/:id          # Detalhe
PATCH  /v1/leads/:id          # Atualizar
DELETE /v1/leads/:id          # Soft delete
```

---

## ETAPA 9: Hardening (2 semanas)

**O quê:** E2E tests, Load testing, Security audit, SLA docs

### Task 9.1: E2E Tests
- Cypress/Playwright
- Fluxo crítico: Login → Criar lead → Chat → Export
- 50+ testes

### Task 9.2: Load Testing
- k6 ou Artillery
- 100 concurrent users
- Latência P95 < 200ms

### Task 9.3: Security Audit
- Pentest contratado (ou security agent review)
- RLS policies validadas
- No hardcoded secrets

### Task 9.4: SLA Documentation
- Uptime guarantee (99.9%)
- Response times (P95, P99)
- Support response time
- Escalation procedures

---

## 📅 TIMELINE

| Etapa | Semanas | Status |
|-------|---------|--------|
| 0 | ✅ | Completo |
| 1 | 2 | 🚀 **START HERE** |
| 2 | 2 | |
| 3 | 3 | |
| 4 | 1 | |
| 5 | 2 | |
| 6 | 1 | |
| 7 | 3 | |
| 8 | 1 | |
| 9 | 2 | |
| **Total** | **~17 semanas** | **MVP Completo** |

---

## 🎯 Meta Mínima (MVP)

**Semanas 1-6 (6 semanas):**
- ✅ Leads UI completa
- ✅ Dashboard
- ✅ Chat funcional
- ✅ Relatórios básicos
- ✅ Config mínima (Team, Export)

**Isso = MVP pronto para usuários reais!**

---

## ⚡ Próximo Passo

**ETAPA 1: UI Leads Completa**

Quer que eu quebre em tasks específicas com estimativas detalhadas?
