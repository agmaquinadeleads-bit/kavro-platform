# PERFORMANCE.md — Infraestrutura & Otimizações

**Data:** 13 de agosto de 2026  
**Escopo:** Performance targets, métricas, escalabilidade  
**Responsável:** DevOps + Backend

---

## PARTE I: INFRAESTRUTURA RECOMENDADA

### Frontend Hosting

**Recomendação:** Vercel (nativo para Next.js)

```
Pricing:
  - Pro: $20/mês (1 projeto)
  - Overages: $0.50 per 1M function invocations
  - Bandwidth: Included (Vercel edge)

SLA:
  - Uptime: 99.95%
  - CDN: Global (170+ cidades)
  - Auto-scaling: Horizontal

Features:
  - Deploy automático (git push)
  - Preview deploys (branches)
  - Edge Middleware (built-in)
  - Observability (Integração)
```

**Alternativas:**
- Netlify (similar, sem Edge Middleware)
- Cloudflare Pages (mais barato, menos features)
- AWS Amplify (mais complexo, mais caro)

---

### Backend Hosting

**Recomendação:** Railway ou Fly.io

**Railway ($7+ /mês):**
```
Pricing:
  - Usage-based: $5/month included, $0.10/hour after
  - Typical: $20-50/mês (staging), $50-200/mês (prod)

SLA:
  - Uptime: 99.5%
  - Auto-scaling: Horizontal (Dockerfile)
  - Regions: 6+ worldwide

Features:
  - Deploy: git push ou CLI
  - Database hosting (Postgres, Redis)
  - Integrated observability
  - Environment management
```

**Fly.io ($0+ /mês):**
```
Pricing:
  - Free tier: 3 shared-cpu-1x 256MB VMs
  - Paid: $1.94/month per VM (Oregon)
  - Bandwidth: $0.02/GB over 100GB

SLA:
  - Uptime: 99.9% (shared), 99.99% (dedicated)
  - Auto-scaling: Horizontal
  - Regions: 30+ worldwide

Features:
  - Deploy: git push ou CLI
  - No database hosting (use external)
  - Low-latency (anycast)
  - Volume storage
```

**Escolher:** Railway (simpler) ou Fly.io (cheaper at scale)

---

### Database Hosting

**Recomendação:** Supabase (PostgreSQL managed)

```
Pricing:
  - Free: 500MB, 2 projects
  - Pro: $25/mês (8GB, 2 projects)
  - Enterprise: Custom (read replicas, SLA)

Features:
  - PostgreSQL 14+
  - RLS (row-level security)
  - Realtime subscriptions
  - Full-text search
  - Vector storage (pgvector)
  - Backup: Daily + PITR (7 days)

SLA:
  - Uptime: 99.9% (Pro)
  - Backup: Hourly snapshots
  - Recovery: Point-in-time (7 days free)
  - Read replicas: Pro+ ($50/mês each)
```

**Alternativas:**
- AWS RDS (mais controle, mais caro)
- Digital Ocean (simpler, menos features)
- Neon (cheaper, early-stage)

---

### CDN & Static Assets

**Recomendação:** Cloudflare (free plan)

```
Pricing:
  - Free: Unlimited, full features
  - Pro: $20/mês (advanced DDoS, WAF)
  - Business: $200+/mês (SLA, priority support)

Features:
  - Edge caching (200+ datacenters)
  - Image optimization (WebP, responsive)
  - Compression (Brotli, gzip)
  - DDoS protection
  - SSL/TLS (free, auto-renew)
  - Analytics dashboard

Cache Rules:
  - /api/* → No cache (1min TTL max)
  - /public/* → 1 year cache (immutable)
  - /_next/static → 1 year cache
  - / → 5 minutes cache (ISR revalidate)
```

---

### Observability & Monitoring

**Recomendação:** Datadog (trial) ou self-hosted stack

**Datadog ($15+ /mês):**
```
Pricing:
  - Trial: 14 days free
  - Standard: $15/mês (basic)
  - APM: $5+ per 1M traces

Capabilities:
  - Logs aggregation
  - Metrics (CPU, memory, latency)
  - APM (application tracing)
  - Alerts (email, Slack)
  - Dashboards (custom)

Integration:
  - Node.js: datadog-browser-logs, datadog/browser-rum
  - PostgreSQL: Custom queries
```

**Alternativas:**
- New Relic (similar pricing)
- Sentry (error tracking only, $29)
- Self-hosted (Prometheus + Grafana, free but ops-heavy)

---

### Logs Centralizados

**Recomendation:** Axiom ($5+ /mês)

```
Pricing:
  - Free: 1GB/day, 7-day retention
  - Pro: $20/mth (25GB/day, 30-day)

Features:
  - Structured logging (JSON)
  - Real-time streaming
  - Retention policies
  - API queries

Integration:
  - Node.js: winston, pino drivers
  - Format: JSON (no PII)
```

**Alternativa:** ELK Stack (self-hosted, free but ops-intensive)

---

## PARTE II: MÉTRICAS DE PERFORMANCE (SLA)

### Frontend Targets

```
Core Web Vitals:
  ├─ LCP (Largest Contentful Paint): < 2.5s (target: < 1.5s)
  ├─ FID (First Input Delay): < 100ms (target: < 50ms)
  └─ CLS (Cumulative Layout Shift): < 0.1 (target: < 0.05)

Bundle Size:
  ├─ Initial JS: < 200KB gzipped
  ├─ CSS: < 50KB gzipped
  └─ Per-route: < 100KB gzipped

Lighthouse Score:
  ├─ Performance: ≥ 90
  ├─ Accessibility: ≥ 90
  ├─ Best Practices: ≥ 90
  └─ SEO: ≥ 90

Time to Interactive: < 3s
First Contentful Paint: < 1.5s
```

**Test:**
```bash
# Local
lighthouse https://kavrocrm.com --view

# CI/CD
npm run lighthouse
```

---

### Backend Targets

```
Latency (API Response):
  ├─ P50 (median): < 50ms
  ├─ P95: < 200ms
  └─ P99: < 500ms

Throughput:
  ├─ Requests/second: ≥ 1.000 RPS (staging)
  ├─ Requests/second: ≥ 10.000 RPS (prod with scaling)

Error Rate:
  ├─ 5xx errors: < 0.1%
  ├─ Timeout rate: < 0.01%

Memory:
  ├─ Per container: < 512MB (staging)
  ├─ Per container: < 1GB (prod)

CPU:
  ├─ Average: < 50%
  ├─ Peak: < 80% (auto-scale if > 80%)
```

**Monitor:**
```typescript
// NestJS middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    }));
  });
  next();
});
```

---

### Database Targets

```
Query Latency:
  ├─ P50: < 10ms
  ├─ P95: < 100ms
  └─ P99: < 500ms

Connection Pool:
  ├─ Staging: 20 connections
  ├─ Production: 100 connections

Disk Usage:
  ├─ Current: ~500MB (empty)
  ├─ Full (10M leads): ~5GB
  ├─ Projected (100K users): ~50GB

Backup:
  ├─ Frequency: Daily
  ├─ Retention: 7 days + PITR
  ├─ RTO (recovery time): < 1 hour
  ├─ RPO (data loss): < 1 hour
```

---

## PARTE III: OTIMIZAÇÕES POR CAMADA

### Frontend (Next.js)

**Implementar em:**

| Otimização | O quê | Quando |
|-----------|-------|--------|
| Code splitting | Chunk por rota (automático) | ETAPA 0 (já pronto) |
| Image optimization | next/image, WebP, responsive | ETAPA 2 (UI chat) |
| Lazy loading | React.lazy, Suspense | ETAPA 2 (relatórios) |
| CSS-in-JS | CSS modules, zero-runtime | ETAPA 0 (usar) |
| Caching | revalidatePath, ISR | ETAPA 1 (API) |
| Bundle analysis | next/bundle-analyzer | ETAPA 4 (audit) |

**Checklist de Merge:**
- [ ] Bundle size < 50KB/rota (gzipped)
- [ ] Lighthouse score ≥ 90
- [ ] Sem console.log em prod
- [ ] Images otimizadas (next/image)
- [ ] Lazy load em components > 50KB

---

### Backend (NestJS)

**Implementar em:**

| Otimização | O quê | Quando |
|-----------|-------|--------|
| Pagination | limit 25-100 sempre | ETAPA 0 (já pronto) |
| Query caching | Redis cache lookups | ETAPA 4 |
| Connection pooling | Database connection pool | ETAPA 0 (Supabase) |
| Rate limiting | Fastify throttle | ETAPA 0 (já pronto) |
| Compression | gzip, brotli | ETAPA 0 (Fastify built-in) |
| Monitoring | Structured logging | ETAPA 4 |
| Profiling | Node.js profiler | ETAPA 4 |

**Checklist de Merge:**
- [ ] Query P95 < 100ms (EXPLAIN verify)
- [ ] Sem N+1 queries
- [ ] Pagination implementada
- [ ] Rate limiting if public endpoint
- [ ] Logs structured (JSON, no PII)

---

### Database (PostgreSQL)

**Implementar em:**

| Otimização | O quê | Quando |
|-----------|-------|--------|
| Índices | org_id-first, (org_id, created_at) | ETAPA 0 (já pronto) |
| Query plans | EXPLAIN ANALYZE | ETAPA 1 (audit) |
| Vacuum | Autovacuum enabled | ETAPA 0 (Supabase) |
| Partitioning | Tabelas > 10M rows | ETAPA 8 (scale) |
| Materialized views | Aggregations pré-calculadas | ETAPA 6 (relatórios) |
| Full-text search | pg_trgm extension | ETAPA 5 (search) |

**Checklist de Merge:**
- [ ] Índice criado se novo WHERE
- [ ] Query plan OK (seq scan, no warnings)
- [ ] Sem full table scan (exceto migração)
- [ ] Test com 1M synthetic records

---

## PARTE IV: ESCALABILIDADE

### Horizontal Scaling (Containers)

**Frontend:** Vercel auto-scales (sem ação)

**Backend:** Railway/Fly.io auto-scales se CPU > 80%

```
Configuration:
  - Min instances: 2 (HA)
  - Max instances: 10 (per region)
  - Scale trigger: CPU > 80% ou memory > 80%
  - Cool-down: 5 minutes (prevent thrashing)

Cost:
  - 2 instances: $40/mth (staging)
  - 5 instances: $100/mth (prod avg)
  - 10 instances: $200/mth (peak)
```

### Database Scaling

**Vertical scaling (larger instance):**
```
- Staging: 1GB RAM (Pro)
- Production: 4GB RAM (Pro+) → 32GB (Enterprise)
- Read replicas: +$50/mth each (3x to 10x more)
```

**Horizontal scaling (read replicas):**
```
- Write-master: Primary Supabase
- Read-replicas: 1-10 (by region)
- Replication lag: < 1 second
- Use case: Analytics, heavy reads (dashboards)
```

---

## PARTE V: MONITORAMENTO & ALERTAS

### Alertas (Proativo)

```
Critical (PagerDuty):
  [ ] API latency P99 > 1s
  [ ] Error rate > 5%
  [ ] Database CPU > 90%
  [ ] Backup failed
  [ ] SSL certificate expires in 7 days

Warning (Email):
  [ ] API latency P95 > 500ms
  [ ] Error rate > 1%
  [ ] Database CPU > 80%
  [ ] Disk usage > 80%
  [ ] Memory > 80%

Info (Slack):
  [ ] Deploy completed
  [ ] Scale event (instances added)
  [ ] Backup completed
```

### Dashboard (Grafana / Datadog)

```
Tiles:
  ├─ Uptime (%) — last 7 days
  ├─ Requests/sec — live graph
  ├─ Latency P95 — rolling 1h
  ├─ Error rate (%) — last 24h
  ├─ Database connections — live
  ├─ CPU/Memory per region — live
  └─ Cost tracker — current month
```

---

## PARTE VI: CHECKLIST DE PRODUÇÃO

Antes de ir live:

- [ ] Frontend:
  - [ ] Lighthouse score ≥ 90
  - [ ] Bundle size < 200KB (gzipped)
  - [ ] Core Web Vitals OK
  - [ ] CDN configured (Cloudflare)

- [ ] Backend:
  - [ ] API P95 < 200ms
  - [ ] Rate limiting ON
  - [ ] Monitoring configured
  - [ ] Errors tracked (Sentry/Datadog)

- [ ] Database:
  - [ ] Backup automated (daily)
  - [ ] Read replica (if > 1000 QPS)
  - [ ] Indexes validated
  - [ ] Connection pool tuned

- [ ] Infraestrutura:
  - [ ] SSL/TLS enabled
  - [ ] Auto-scaling configured
  - [ ] Alerts configured
  - [ ] On-call setup (who fixes at 2am?)

- [ ] Load Test:
  - [ ] 1K concurrent users — OK
  - [ ] 10K RPS — OK
  - [ ] 1h sustained — no memory leak
  - [ ] Failover test — database down → recover

---

**Responsável:** DevOps + Backend  
**Review:** Antes de cada etapa de escala
