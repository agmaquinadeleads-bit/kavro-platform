# COMPLIANCE.md — Checklist de Conformidade

**Data:** 13 de agosto de 2026  
**Escopo:** LGPD + Políticas de WhatsApp  
**Responsável:** Agente `conformidade` + Revisão Jurídica  

---

## ⚠️ IMPORTANTE: NÃO É PARECER JURÍDICO

Este documento é um **checklist técnico**, não substitui parecer de advogado.

**Sobre Kavro:**
- Somos um **operador de dados** (não controlador)
- Armazenamos leads que **pertencem aos nossos clientes** (controlador)
- Qualquer mudança de escopo → revisar com jurídico

**Quando sinalizar para revisão:**
- Novo tipo de dado coletado (ex: geolocalização)
- Nova integração (ex: analytics terceiro)
- Nova política de retenção
- Nova base legal para armazenamento

---

## PARTE I: LGPD — ARMAZENAMENTO DE DADOS DE TERCEIROS

Kavro armazena dados **do lead** (pessoa física) que não criou a conta. O cliente (agência) é o controlador dos dados.

### I.A — Consentimento & Base Legal

**O quê:** Verificar se cliente obteve consentimento do lead (ou tem base legal)

| Requisito | Status | Evidência | Ação |
|-----------|--------|-----------|------|
| Lead foi informado da coleta? | ❓ | Política do cliente | Documentar com cliente (DPA) |
| Lead consentiu (opt-in)? | ❓ | Registro em lead.whatsapp_opted_in | Validar antes de enviar msg |
| Base legal documentada? | ❓ | Contrato com cliente | **→ Revisar com jurídico** |
| LGPD foi mencionada ao lead? | ❓ | Política de privacidade do cliente | **→ Revisar com jurídico** |

**Responsabilidade:** Cliente é controlador; Kavro é operador (SaaS)

**Ação:** ✅ Documentar em DPA (Data Processing Agreement) assinado com cada cliente

---

### I.B — Retenção de Dados

**O quê:** Quantos dias/meses manter dados após inatividade ou deleção solicitada?

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| TTL de lead definido? | ❌ | Nenhum (acumula infinito) | ETAPA 5 |
| Deleção automática após X meses? | ❌ | Não implementado | ETAPA 5 |
| Soft delete documentado? | ✅ | deleted_at timestamp | ETAPA 0 |
| Hard delete possível? | ❌ | Bloqueado by design | ETAPA 5 |
| Auditoria de deleção? | ✅ | audit_events registra | ETAPA 0 |
| Backup retido quanto tempo? | ⚠️ | 7 dias (Supabase default) | **→ SLA documentar** |

**Padrão recomendado:**
- Lead inativo 365 dias → soft delete automático
- Após hard delete → remover de backups (GDPR)
- Manter log de deleção (para auditoria)

**Ação:** Implementar em ETAPA 5 com configuração por cliente (respeitar legislação local)

---

### I.C — Direito de Acesso

**O quê:** Lead/cliente consegue acessar/exportar todos os dados?

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Cliente exporta todos seus dados (JSON)? | ❌ | Não existe | ETAPA 6 |
| Cliente exporta dados de lead (CSV)? | ❌ | Não existe | ETAPA 6 |
| Conversa WhatsApp exportável? | ❌ | Não existe | ETAPA 3 |
| API de export documentada? | ❌ | Não existe | ETAPA 6 |
| Teste de portabilidade? | ❌ | Não existe | ETAPA 6 |

**Padrão recomendado:**
```
GET /v1/export/leads
  → Download CSV com todos os leads da org
  → Incluir: id, name, email, phone, activities, messages

GET /v1/export/whatsapp/:connectionId/conversations
  → Download JSON com histórico de conversa
  → Incluir: timestamp, sender, message, status
```

**Ação:** Implementar em ETAPA 6 (direito de portabilidade LGPD)

---

### I.D — Direito ao Esquecimento (Right to be Forgotten)

**O quê:** Lead pode solicitar deleção de todos seus dados?

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Lead solicita deleção? | ⚠️ | Via cliente (não direto) | ETAPA 5 |
| Deleção hard (completa)? | ❌ | Soft delete apenas | ETAPA 5 |
| Apaga conversa WhatsApp? | ❌ | Não | ETAPA 5 |
| Registra deleção (auditoria)? | ✅ | audit_events | ETAPA 0 |
| Notifica lead da deleção? | ❌ | Não | ETAPA 5 |
| Tempo de exclusão? | ❓ | Imediato (ideal) | ETAPA 5 |

**Padrão recomendado:**
```sql
-- Cliente deleta lead via UI
DELETE FROM public.leads WHERE id = $1 AND org_id = $2;
  -- RLS + soft delete (deleted_at)
  -- Cascata apaga: tasks, activities, conversations, messages
  -- audit_events registra: who, when, action='lead.hard_deleted'

-- Agendado (30 dias):
  -- Remover de backups
  -- Reportar (compliance log)
```

**Ação:** Implementar hard delete em ETAPA 5

---

### I.E — Criptografia em Repouso

**O quê:** Dados sensíveis (telefone, email) criptografados no banco?

| Requisito | Status | Implementação | Justificativa |
|-----------|--------|----------------|---------------|
| Criptografia de lead.phone? | ❌ | Não | Supabase gerencia, baixa prioridade |
| Criptografia de lead.email? | ❌ | Não | Supabase gerencia |
| Criptografia de whatsapp_messages.content? | ❌ | Não | Padrão Meta (encrypted in transit) |
| Chave de criptografia fora do código? | N/A | Supabase handles | N/A |

**Status:** Aceitável para MVP. Supabase gerencia segurança de infraestrutura.

---

## PARTE II: WHATSAPP — CONFORMIDADE DE MENSAGERIA

### II.A — Política de WhatsApp

**O quê:** Não violar termos de serviço da Meta para não banir número

| Requisito | Status | Implementação | Bloqueador |
|-----------|--------|----------------|-----------|
| Opt-in explícito antes de enviar? | ⚠️ | lead.whatsapp_opted_in | UI falta (ETAPA 2) |
| Rate limiting (max msg/min)? | ✅ | 10 msg/min por número | ETAPA 2 |
| Sem spam/promotional sem opt-in? | ⚠️ | Validação manual | UI falta |
| Respeitar bloqueos da Meta? | ⚠️ | Evolution API faz check | Não testado |
| Aquecimento de número (gradual)? | ❌ | Documentado, não automático | ETAPA 0.5 |
| Horário de envio (8h-20h)? | ❌ | Não implementado | ETAPA 2 |
| Identificação clara de bot? | ⚠️ | "Via Kavro CRM" | UI falta |

**Meta Policy Links:**
- https://www.whatsapp.com/legal/business-terms-of-service
- Proibido: spam, phishing, malware, conteúdo sexual, violência

**Ação:** ✅ Documentar em contrato com cliente que cliente é responsável por conformidade

---

### II.B — Webhook & Segurança

**O quê:** Webhook de entrada da Meta validado e seguro

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Assinatura SHA-256 validada? | ✅ | meta-webhook.service.ts | ETAPA 0 |
| Log de eventos webhook? | ⚠️ | Partial (sem PII) | ETAPA 4 |
| Tratamento de erro sem expor dados? | ✅ | Logging redacted | ETAPA 0 |
| Idempotência de webhook? | ✅ | Deduplicação por msg ID | ETAPA 0 |
| Retry automático se falhar? | ⚠️ | Manual queue | ETAPA 2 |
| Timeout webhook < 30s? | ✅ | Fastify response rápida | ETAPA 0 |

**Status:** ✅ Seguro

---

### II.C — Dados de Terceiros em Webhook

**O quê:** Não expor dados de lead em logs/trace

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Logs sem nome/email/telefone? | ✅ | Apenas IDs | ETAPA 0 |
| Trace sem corpo de mensagem? | ✅ | Apenas status/timestamp | ETAPA 0 |
| Erro report sem PII? | ✅ | generic_error_id | ETAPA 4 |
| Backup de webhook sem dados sensíveis? | ✅ | Message hash only | ETAPA 0 |

**Status:** ✅ Seguro

---

## PARTE III: DADOS DE TERCEIROS — ISOLAMENTO

### III.A — Isolamento Multi-Tenant

**O quê:** Organização A não vê dados de organização B

| Requisito | Status | Implementação | Bloqueador |
|-----------|--------|----------------|-----------|
| Cada lead tem org_id? | ✅ | Chave estrangeira | ETAPA 0 |
| RLS valida org_id? | ✅ | Policy de select/insert/update | ETAPA 0 |
| Testes de cross-tenant bloqueado? | ✅ | test-tenant-isolation.mjs | ETAPA 0 |
| Índices org_id-first? | ✅ | leads(org_id, created_at) | ETAPA 0 |
| Cascata ao deletar org? | ✅ | ON DELETE CASCADE | ETAPA 0 |

**Status:** ✅ Garantido por banco (RLS + aplicação)

---

### III.B — Auditoria de Acesso

**O quê:** Rastrear quem acessou quais dados, quando

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Toda operação em lead registrada? | ✅ | audit_events tabela | ETAPA 0 |
| Quem (userId) registrado? | ✅ | actor_id | ETAPA 0 |
| O quê (action) registrado? | ✅ | action='lead.created' etc | ETAPA 0 |
| Quando (timestamp) registrado? | ✅ | created_at | ETAPA 0 |
| Retenção de auditoria? | ❓ | 90 dias? | **→ Documentar SLA** |
| Admin consegue ver auditoria? | ✅ | RLS policy admin only | ETAPA 0 |

**Status:** ✅ Implementado

---

## PARTE IV: POLÍTICAS & TERMOS

### IV.A — Política de Privacidade

**O quê:** Publicada em `/privacy`, explica dados

| Requisito | Status | Implementação | Validação |
|-----------|--------|----------------|-----------|
| Página pública `/privacy` existe? | ✅ | apps/web/src/app/privacy | ETAPA 0 |
| Conteúdo valida legal? | ❌ | Template, não validado | **→ Revisar com jurídico** |
| Menciona WhatsApp? | ⚠️ | Parcial | **→ Completar** |
| Menciona Stripe? | ❌ | Não | **→ Adicionar** |
| Explica retenção de dados? | ❌ | Não | **→ Adicionar** |
| Explica direitos LGPD? | ❌ | Não | **→ Adicionar** |

**Template esperado:**
```
1. Introdução (o que é Kavro)
2. Dados coletados (leads, interações, WhatsApp)
3. Base legal (consentimento/interesse legítimo)
4. Retenção de dados (X meses)
5. Direitos (acesso, portabilidade, exclusão)
6. Contato de privacidade (email)
7. Sujeição a LGPD
```

**Ação:** ✅ Redigir com jurídico antes de produção

---

### IV.B — Termos de Serviço

**O quê:** ToS publicado, define responsabilidades

| Requisito | Status | Implementação | Validação |
|-----------|--------|----------------|-----------|
| ToS publicado? | ❌ | Não existe | **→ Redigir com jurídico** |
| Define responsabilidade (cliente vs Kavro)? | ❌ | Não | **→ Adicionar** |
| Inclui conformidade LGPD? | ❌ | Não | **→ Adicionar** |
| Inclui WhatsApp policy? | ❌ | Não | **→ Adicionar** |
| SLA de uptime? | ❌ | Não | **→ Adicionar** |
| Direitos de propriedade intelectual? | ❌ | Não | **→ Adicionar** |

**Ação:** ✅ Redigir com jurídico antes de produção

---

### IV.C — Data Processing Agreement (DPA)

**O quê:** Contrato assinado com cliente definindo papéis (controlador vs operador)

| Requisito | Status | Implementação | Validação |
|-----------|--------|----------------|-----------|
| DPA template pronto? | ❌ | Não existe | **→ Redigir com jurídico** |
| Define papéis (Kavro = operador)? | ❌ | Não | **→ Adicionar** |
| Cláusula de sub-processador? | ❌ | Não (Supabase, Meta) | **→ Adicionar** |
| Cláusula de segurança? | ❌ | Não | **→ Adicionar** |
| Cliente assina antes de usar? | ❌ | Não | **→ Implementar em signup** |

**Ação:** ✅ Redigir com jurídico antes de produção

---

## PARTE V: INCIDENTES & SEGURANÇA

### V.A — Plano de Resposta a Incidente

**O quê:** Se vazou dado, qual é o procedimento?

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Procedure de detecção (anomalia)? | ❌ | Não documentado | ETAPA 4 |
| Notificação em X horas? | ❓ | SLA não definido | **→ ETAPA 4** |
| Notificação de cliente? | ❌ | Não definido | **→ Documentar** |
| Notificação de ANPD (se breach)? | ❌ | Não definido | **→ Com jurídico** |
| Log de incidente? | ❌ | Não existe | **→ ETAPA 4** |
| Postmortem & fix? | ❌ | Não definido | **→ Documentar** |

**Template esperado:**
1. Detectar anomalia (alerta de segurança)
2. Isolar sistema (pausar operações se crítico)
3. Investigar (logs, auditoria)
4. Notificar cliente (24-48h)
5. Remediação (patch, rotação de credenciais)
6. Postmortem (análise de causa raiz)

**Ação:** Documentar em ETAPA 4

---

### V.B — Teste de Segurança

**O quê:** Pen test ou self-assessment periódico

| Requisito | Status | Implementação | Target |
|-----------|--------|----------------|--------|
| Pen test agendado? | ❌ | Não | ETAPA 8 |
| Varredura SAST (code scan)? | ❌ | Não | ETAPA 8 |
| Varredura DAST (runtime scan)? | ❌ | Não | ETAPA 8 |
| Teste de isolamento cross-tenant? | ✅ | test-tenant-isolation.mjs | ETAPA 0 |
| Teste de SQL injection? | ❌ | Não automático | ETAPA 8 |

**Ação:** Agendar em ETAPA 8 (pré-produção)

---

## PARTE VI: DECISÕES & DOCUMENTAÇÃO

### VI.A — Decisões Já Tomadas

| Decisão | Justificativa | Revisar? |
|---------|---------------|----------|
| Soft delete (não hard delete) | Preservar auditoria, recuperável | Não (correto) |
| RLS no banco (não app logic) | Padrão de segurança em SaaS | Não (correto) |
| Supabase vs auto-hosted | Gerenciamento de segurança/backup | Não (correto) |
| Evolution API + Meta Cloud | Oficialmente suportado pela Meta | Não (correto) |
| Logs sem PII | LGPD + segurança | Não (correto) |

---

### VI.B — Aguardando Decisão Jurídica

| Questão | Impacto | Target |
|---------|--------|--------|
| Qual é a base legal para armazenar leads? | Alto | **→ Antes de produção** |
| TTL de retenção (quanto tempo guardar)? | Alto | **→ ETAPA 5** |
| Está sujeito a LGPD ou outra legislação? | Alto | **→ Antes de lançar** |
| DPA template (responsabilidades)? | Alto | **→ Antes de clientes** |
| Política de privacidade (conteúdo)? | Médio | **→ ETAPA 1** |
| Termos de Serviço (compliance)? | Médio | **→ ETAPA 1** |
| SLA de backup/recuperação? | Médio | **→ ETAPA 4** |
| Conformidade WhatsApp (contrato)? | Médio | **→ ETAPA 2** |

---

## CHECKLIST FINAL: ANTES DE PRODUÇÃO

- [ ] DPA assinado com cliente
- [ ] Política de Privacidade validada (jurídico)
- [ ] Termos de Serviço publicados (jurídico)
- [ ] Plano de resposta a incidente documentado
- [ ] Pen test realizado (sem críticos abertos)
- [ ] Backup & recovery testado (RTO/RPO documentado)
- [ ] Auditoria setup confirmado (90+ dias retenção)
- [ ] Conformidade WhatsApp validada (opt-in, rate limits)
- [ ] LGPD compliance checklist assinado
- [ ] Contato jurídico identificado (escalation)

---

**Responsável:** Agente `conformidade` (valida), Jurídico (aprova)  
**Última revisão:** 13 de agosto de 2026
