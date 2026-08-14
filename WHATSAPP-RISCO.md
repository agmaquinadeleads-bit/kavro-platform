# WHATSAPP-RISCO.md — Análise de Risco & Mitigação

**Data:** 13 de agosto de 2026  
**Escopo:** Evolution API + Meta Cloud API (WhatsApp)  
**Responsável:** Equipe de Backend + Segurança

---

## PARTE I: RISCO DE BANIMENTO DE NÚMERO

### Causa 1: Spam & Volume Anormal

**O quê:** Enviar muitas mensagens para mesmo número em curto período

**Sinais de Alerta:**
- Taxa de bloqueio > 5% (cliente marca como spam)
- Taxa de delivery < 50% (Meta rejeitando)
- Picos de 1.000+ msg em < 1 minuto
- Envio para números blacklist da Meta

**Impacto:**
- 🔴 **Crítico:** Número suspenso permanentemente
- Sem aviso prévio (Meta automated system)
- Recuperação: contato direto Meta (72h+)

**Frequência:** Comum (especialmente agências novas)

---

### Causa 2: Conteúdo Proibido

**O quê:** Mensagens que violam ToS da Meta

**Exemplos Proibidos:**
- Links maliciosos (phishing, crypto scams)
- Conteúdo sexual/violência
- Ameaças ou assédio
- Golpes (esquema Ponzi, fake investment)
- Conteúdo discriminatório

**Impacto:**
- 🔴 **Crítico:** Banimento imediato (sem aviso)
- Reputação do cliente prejudicada
- Possível investigação legal (Meta reporta)

**Frequência:** Raro (se cliente respeita ToS)

---

### Causa 3: Violação de ToS Meta

**O quê:** Violar políticas específicas do WhatsApp Business

**Exemplos:**
- Mensagens automatizadas sem opt-in explícito
- Bot sem identificação clara ("I'm automated")
- Envio em horários proibidos (Meta pode bloquear)
- Envio para números opt-out (cliente recusou)
- Tentativas de contorno (burner numbers, VPN)

**Impacto:**
- 🟡 **Alto:** Restrição de funcionalidades
- Limite de msg/dia reduzido
- Suspenção temporária (24-72h)
- Reputação em risco

**Frequência:** Moderada (agências impatientes)

---

### Causa 4: Configuração Técnica Incorreta

**O quê:** Falhas na integração com Evolution/Meta

**Exemplos:**
- Webhook não responde em < 30s (Meta timeout)
- Muitas retentativas de webhook (flood)
- IP da Evolution API não whitelisted
- Rate limiting inexistente (spike de msg)
- Erro de assinatura (SHA-256 inválido)

**Impacto:**
- 🟡 **Médio:** Perda de eventos
- Mensagens não recebidas
- Webhook desativado (meta pausa)
- Possível suspenção se recorrente

**Frequência:** Técnica (rara com bom código)

---

### Métricas de Saúde do Número

**O quê:** KPIs para monitorar antes de problema crítico

| Métrica | Alerta (Amarelo) | Crítico (Vermelho) | Ação |
|---------|------------------|-------------------|------|
| Taxa de bloqueio | > 3% | > 5% | Pausar envios |
| Taxa de delivery | < 70% | < 50% | Investigar Meta |
| Taxa de erro | > 2% | > 5% | Investigar cliente |
| Webhook timeout | > 5% | > 10% | Revisar código |
| Envios/min | > 10 | > 20 | Rate limit ativo? |

**Dashboard:** Deve exibir essas métricas em tempo real (ETAPA 0.5)

---

## PARTE II: ESTRATÉGIAS DE MITIGAÇÃO

### Estratégia 1: Aquecimento de Número (Gradual Warm-Up)

**Objetivo:** Estabelecer reputação com Meta gradualmente, não explosivamente

**Plano de Aquecimento:**

```
Dia 1-7:     10 msg/dia (validar número funciona)
Dia 8-14:    50 msg/dia (Meta observa padrão)
Dia 15-21:   200 msg/dia (aumentar confiança)
Dia 22-30:   1.000 msg/dia (escalar)
Dia 31+:     Illimitado (ou por plano)
```

**Implementação:**
```typescript
// config por número
const WARMUP_PLAN = {
  new_number: { 
    day_1_7: 10,
    day_8_14: 50,
    day_15_21: 200,
    day_22_30: 1000,
  }
};

// Verificar se dentro do limit
const dailySent = await countSent(numberId, 'today');
const allowedToday = WARMUP_PLAN[number.status][getDay(number.createdAt)];

if (dailySent >= allowedToday) {
  throw new Error("Quota de aquecimento atingida");
}
```

**Controle:** Banco rastreia `daily_message_count` + `warmup_day`

---

### Estratégia 2: Opt-In Explícito (Consentimento)

**Objetivo:** Garantir lead consentiu com WhatsApp (não spam)

**Fluxo Padrão:**

```
1. Lead preenche formulário (origem = form)
   ↓
2. Cliente envia SMS: "Confirme WhatsApp para contato"
   ↓
3. Lead responde "SIM" via SMS ou UI
   ↓
4. Kavro marca: lead.whatsapp_opted_in = true
   ↓
5. Apenas então enviar mensagens WhatsApp
```

**Schema de Banco:**

```sql
ALTER TABLE public.leads ADD COLUMN (
  whatsapp_opted_in boolean NOT NULL DEFAULT false,
  whatsapp_opt_in_date timestamptz,
  whatsapp_opt_out_date timestamptz,
  whatsapp_opt_out_reason text
);

CREATE INDEX leads_opted_in_idx 
  ON public.leads (org_id, whatsapp_opted_in)
  WHERE whatsapp_opted_in = true;
```

**Validação em Envio:**

```typescript
// Nunca enviar se não opted in
if (!lead.whatsapp_opted_in) {
  throw new ForbiddenException(
    "Lead não consentiu com WhatsApp"
  );
}
```

**UI:** Checkbox em `/app/leads/[id]` para marcar opt-in manual (admin override)

---

### Estratégia 3: Limites de Disparo (Rate Limiting)

**Objetivo:** Evitar spike de mensagens que triggerem anti-spam da Meta

**Limites Implementados:**

```
Por número:        Max 10 msg/min (300/hora, 7.200/dia)
Por lead:          Max 3 msg/min (180/hora)
Por organização:   Max 100 msg/min (configurável por plano)
Por horário:       8h-20h apenas (respeitar fuso horário)
```

**Implementação (Redis/Timewindow):**

```typescript
const key = `whatsapp:rate:${connectionId}:${Math.floor(Date.now() / 60000)}`;
const count = await redis.incr(key);

if (count > 10) {
  throw new TooManyRequestsException(
    "Limite de taxa atingido para este número"
  );
}

await redis.expire(key, 120); // janela 2min
```

**Fila de Jobs:** Se limite atingido, adicionar à queue (Bull/RabbitMQ)

```typescript
if (count >= limit) {
  await messageQueue.add({
    connectionId,
    leadId,
    text
  }, { delay: 60000 }); // Tentar em 1 min
}
```

---

### Estratégia 4: Monitoramento de Saúde (Proativo)

**Objetivo:** Detectar problemas antes de banimento

**Alertas em Tempo Real:**

```typescript
// Taxa de bloqueio > 3%
const blockRate = blockedCount / sentCount;
if (blockRate > 0.03) {
  await alerts.send({
    severity: 'warning',
    message: `Taxa de bloqueio ${(blockRate * 100).toFixed(1)}% em ${numberName}`
  });
}

// Taxa de bloqueio > 5% → PAUSAR ENVIOS
if (blockRate > 0.05) {
  await whatsappConnections.update(connectionId, { 
    paused_reason: 'high_block_rate',
    paused_at: new Date()
  });
  
  await alerts.send({
    severity: 'critical',
    message: `Envios pausados automaticamente (bloqueio ${blockRate}%)`
  });
}

// Taxa de delivery < 50% → Investigar
if (deliveryRate < 0.50) {
  await alerts.send({
    severity: 'warning',
    message: `Entrega baixa (${deliveryRate}%). Verificar com Meta.`
  });
}
```

**Dashboard (ETAPA 0.5):**
- Gráfico de bloqueio/entrega últimos 7 dias
- Status de cada número (aquecimento, normal, pausado)
- Timeline de eventos (bloqueio, recovery, limit atingido)

---

## PARTE III: O QUE O SOFTWARE DEVE IMPEDIR POR DESIGN

### ❌ BLOQUEADO (Nunca permitir)

```
1. Enviar para número não optado
   if (!lead.whatsapp_opted_in) throw;

2. Enviar para número já bloqueado Meta
   SELECT * FROM whatsapp_blocked_numbers WHERE number = $1;
   if (blocked) throw;

3. Enviar > limite de rate
   if (redis.get(rateKey) >= limit) throw;

4. Enviar conteúdo sem validação
   if (!validateMIME(content)) throw;
   if (!scanForVirus(content)) throw;

5. Enviar em horário proibido (outside 8h-20h)
   if (hour < 8 || hour > 20) throw;

6. Enviar com template não registrado
   if (useTemplate && !template.id) throw;

7. Webhook sem verificação SHA-256
   if (!verifySignature(event, secret)) throw;

8. Enviar para número opt-out
   if (lead.whatsapp_opted_out) throw;
```

### ✅ OBRIGATÓRIO (Sempre)

```
1. Log de cada tentativa (sucesso/erro)
   INSERT INTO whatsapp_send_log (...)

2. Rastreamento de opt-in/opt-out
   lead.whatsapp_opted_in = true/false
   lead.whatsapp_opt_in_date = timestamp

3. Identificação clara de bot
   "Oi! Sou um assistente automático da Kavro CRM."

4. Respaldo de consentimento
   lead.whatsapp_opt_in_ip = user.ip
   lead.whatsapp_opt_in_timestamp = now()

5. Retry automático com backoff
   attempt 1: agora
   attempt 2: +1min (exponencial)
   attempt 3: +5min
   attempt 4: +30min
   (máx 4 tentativas)

6. Deduplicação por idempotency key
   POST /send { idempotencyKey: uuid }
   // Mesmo UUID = mesma tentativa (idempotent)
```

---

## PARTE IV: EVOLUTION API vs Meta Cloud API (Oficial)

### Comparação Técnica

| Aspecto | Evolution API | Meta Cloud API |
|---------|---------------|----------------|
| **Autenticação** | Token simples | OAuth 2.0 |
| **Requisito** | Número pessoal | Business Account Meta |
| **Setup** | 5 minutos | 1 semana (aprovação Meta) |
| **Custo** | $0 (self) ou $20-50/mês | $0 (free tier) a $0.01+/msg (pago) |
| **Latência** | ~500ms | ~200ms |
| **Throughput** | 1K msg/min por número | 80 msg/segundo (escalável) |
| **Conformidade** | Fora de compliance | Compliance total Meta |
| **Rate Limit** | Manual (você controla) | Automático Meta garante |
| **Escalabilidade** | Limitada | Ilimitada (enterprise) |
| **Suporte** | Comunidade/paid plans | Meta Enterprise |

### Risco de Banimento

| Métrica | Evolution | Meta Cloud |
|---------|-----------|-----------|
| Taxa de ban (estimado) | 🔴 15-20% (sem aquecimento) | 🟢 < 1% |
| Causa principal | Spam/volume | Conteúdo malicioso |
| Recovery | 30-90 dias | 7-14 dias |
| Aviso prévio | Nenhum | SLA 24h |

### Recomendação

| Ambiente | Tecnologia | Justificativa |
|----------|-----------|-------------|
| **Staging/Dev** | Evolution API | Rápido, sem custo, números pessoais |
| **Produção (MVP)** | Meta Cloud API | Compliance, suporte Meta, confiável |
| **Produção (Escala)** | Meta Cloud API | Rate limit garantido, SLA |

**Decisão Kavro:** Evolution (staging) → Meta (produção)

---

## PARTE V: Implementação de Mitigação (Roadmap)

### Sprint 1 (Semanas 1-2) — Rate Limiting + Opt-In

- [ ] Campo `whatsapp_opted_in` em leads (migração)
- [ ] Rate limiting (10 msg/min por número) em EvolutionClient
- [ ] Log de envios (success/error) em whatsapp_send_log
- [ ] Validação: não enviar se opted_in = false
- [ ] UI checkbox para opt-in manual em `/app/leads/[id]`
- [ ] Testes: 10 msg/min enforcement

**Bloqueador:** Nenhum  
**Estimativa:** 4 dias

---

### Sprint 2 (Semanas 3-4) — Monitoramento & Alerts

- [ ] Dashboard de saúde do número (health check)
- [ ] Métrica: taxa de bloqueio em tempo real
- [ ] Métrica: taxa de delivery
- [ ] Alerta email: bloqueio > 3%
- [ ] Alerta email: delivery < 50%
- [ ] Pausa automática: bloqueio > 5%
- [ ] Teste: simular taxa alta, validar pausa

**Bloqueador:** Redis para contadores  
**Estimativa:** 5 dias

---

### Sprint 3 (Semana 5) — Aquecimento

- [ ] Plano de aquecimento em config (Nova schema)
- [ ] Validação: não exceder daily quota
- [ ] UI: mostrar dia de aquecimento
- [ ] Teste: 7 dias, validar incremento

**Bloqueador:** Nenhum  
**Estimativa:** 3 dias

---

### Sprint 4 (Semanas 6-8) — Meta Cloud API Official

- [ ] OAuth flow com Meta
- [ ] Integração com Meta Webhook
- [ ] Migração de números (Evolution → Meta)
- [ ] Suporte a templates (HSM)
- [ ] Rate limit garantido por Meta
- [ ] Teste: envio via Meta

**Bloqueador:** Aprovação de Business Account Meta (1 semana)  
**Estimativa:** 10 dias

---

### Sprint 5 (Semana 9) — LGPD & Conformidade

- [ ] Opt-out link em mensagens
- [ ] Respaldo de consentimento (IP, timestamp)
- [ ] Conformidade checklist
- [ ] Documentação (cliente deve seguir ToS)

**Bloqueador:** Nenhum  
**Estimativa:** 3 dias

---

## Checklist de Produção

Antes de colocar em produção:

- [ ] Número de WhatsApp aprovado pela Meta
- [ ] Rate limiting (10 msg/min) implementado
- [ ] Monitor de saúde em dashboard (taxa bloqueio/delivery)
- [ ] Alertas configurados (email/SMS)
- [ ] Opt-in validado em UI e código
- [ ] Aquecimento documentado (cliente saiba)
- [ ] Teste de failover (se número cair, backup number?)
- [ ] Contato escalação Meta salvaguardado
- [ ] Compliance checklist validado
- [ ] Pen test realizado (sem críticos)

---

**Responsável:** Backend + Security  
**Próxima revisão:** Pós-ETAPA 2 (Mensageria)
