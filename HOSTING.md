# HOSTING.md — Deployment & Infrastructure

**Data:** 13 de agosto de 2026  
**Escopo:** Deployment workflow, SLA, escalabilidade  
**Responsável:** DevOps / Tech Lead

---

## PARTE I: DEPLOYMENT ARCHITECTURE

### Ambiente Local

```bash
# Desenvolvimento
pnpm dev

# O quê roda:
#  - Frontend: http://localhost:3000 (Next.js dev server)
#  - Backend: http://localhost:3001 (Fastify)
#  - Supabase: http://localhost:54321 (local, se docker-compose setup)
```

### Staging (Railway)

```
Frontend: https://kavro-web-staging.railway.app
  └─ Next.js, auto-deploy on push to develop branch

Backend: https://api-staging.railway.app
  └─ NestJS, auto-deploy on push to develop branch

Database: Supabase staging project
  └─ Isolated (não afeta produção)
  └─ Backup: hourly
  └─ PITR: 7 days

Deploy trigger: `git push origin develop`
```

### Production (Vercel + Railway + Supabase)

```
Frontend: https://app.kavrocrm.com
  └─ Vercel (Next.js optimized)
  └─ CDN: Cloudflare (global)
  └─ Deploy trigger: `git push origin main`

Backend: https://api.kavrocrm.com
  └─ Railway (NestJS + Fastify)
  └─ Auto-scaling: 2-5 instances
  └─ Deploy trigger: `git push origin main`

Database: Supabase production project
  └─ Managed PostgreSQL
  └─ Backup: daily + PITR 7 days
  └─ Read replica: 1 (US West) + 1 (EU)
  └─ Connection limit: 100

CDN: Cloudflare
  └─ Global edge (200+ cities)
  └─ Cache rules: CSS/JS 1 year, API 1 min, / 5 min
```

---

## PARTE II: DEPLOYMENT STEPS

### Frontend Deployment (Vercel)

**1. Configuração Inicial:**
```bash
# Conectar repo GitHub
npm i -g vercel
vercel link

# Configurar environment variables
# NEXT_PUBLIC_API_URL=https://api.kavrocrm.com
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

**2. Deploy:**
```bash
# Automático em push
git push origin main

# Ou manual
vercel --prod

# Resultado:
#  - Build: 2-3 min
#  - Deploy: < 1 min
#  - URL: https://app.kavrocrm.com
```

**3. Verificação:**
```bash
curl -I https://app.kavrocrm.com
# 200 OK
# Cache-Control: public, max-age=300 (5 min)
```

---

### Backend Deployment (Railway)

**1. Configuração Inicial:**
```bash
# Conectar repo GitHub
railway link

# Configurar environment variables
# SUPABASE_URL=https://...
# SUPABASE_SERVICE_ROLE_KEY=...
# EVOLUTION_API_URL=...
# EVOLUTION_API_KEY=...
# META_APP_ID=...
# META_APP_SECRET=...
# KAVRO_WEB_ORIGIN=https://app.kavrocrm.com
# PORT=3001
```

**2. Deploy:**
```bash
# Automático em push
git push origin main

# Ou manual
railway deploy

# Resultado:
#  - Build: 3-5 min
#  - Deploy: < 1 min
#  - URL: https://api.kavrocrm.com
#  - Instances: 2 (auto-scaled)
```

**3. Verificação:**
```bash
curl https://api.kavrocrm.com/v1/health
# { "status": "ok", "timestamp": "..." }
```

---

### Database Migration (Supabase)

**1. Local:**
```bash
# Criar migration
supabase migration new add_feature

# Editar: supabase/migrations/20260813_add_feature.sql
# Testar local: supabase db reset

# Push
supabase db push

# Aplicada em: staging + production
```

**2. Production (Manual):**
```bash
# Via Supabase dashboard:
# 1. Click "Migrations"
# 2. Review & apply latest

# Ou CLI:
supabase migration push production
```

---

## PARTE III: MONITORING & ALERTS

### Health Checks

**Frontend (Vercel):**
```
URL: https://app.kavrocrm.com
Expected: HTTP 200
Frequency: Every 5 minutes
Alert: Down > 5 minutes
```

**Backend (Railway):**
```
URL: https://api.kavrocrm.com/v1/health
Expected: { "status": "ok" }
Frequency: Every minute
Alert: Down > 1 minute
```

**Database (Supabase):**
```
Query: SELECT 1
Frequency: Every 5 minutes
Alert: No response > 5 minutes
```

### Performance Monitoring

**Metrics to track:**
```
Frontend:
  ├─ Page load time (P95)
  ├─ Core Web Vitals
  ├─ JavaScript errors
  └─ Deploy times

Backend:
  ├─ API latency (P95, P99)
  ├─ Error rate (%)
  ├─ Database query time
  └─ Memory/CPU usage

Database:
  ├─ Query duration
  ├─ Connection count
  ├─ Disk usage (%)
  └─ Backup status
```

**Tool:** Datadog / New Relic dashboard

### Alerting Rules

**Critical (Immediate):**
```
- API down > 1 min → PagerDuty
- Error rate > 5% → PagerDuty
- Database CPU > 90% → PagerDuty
- Backup failed → Email + PagerDuty
```

**Warning (Notify):**
```
- API latency P95 > 500ms → Email
- Error rate > 1% → Slack
- Database CPU > 80% → Email
- Disk usage > 80% → Email
```

---

## PARTE IV: SLA & MAINTENANCE WINDOW

### Service Level Agreement (SLA)

```
Uptime Target:    99.9% (production)
Availability:     43 minutes downtime/month acceptable

Response Time:
  ├─ P50: < 50ms
  ├─ P95: < 200ms
  └─ P99: < 500ms

Backup:
  ├─ Frequency: Daily
  ├─ Retention: 7 days minimum
  ├─ RTO (Recovery Time): < 1 hour
  └─ RPO (Data Loss): < 1 hour

Support:
  ├─ Critical issues: 1 hour response
  ├─ High issues: 4 hours response
  └─ Medium issues: Next business day
```

### Maintenance Window

```
Schedule:
  ├─ Frequency: Monthly (if needed)
  ├─ Day: Tuesday
  ├─ Time: 2am-4am (UTC-3)
  ├─ Duration: Max 2 hours

Notification:
  ├─ Email: 7 days before
  ├─ Slack: 24 hours before
  ├─ Status page: Updated during

Scope:
  ├─ Database maintenance (VACUUM, ANALYZE)
  ├─ Dependency updates
  ├─ Infrastructure upgrades
  └─ Backup restoration test
```

---

## PARTE V: DISASTER RECOVERY

### Backup Strategy

**Database (Supabase automated):**
```
- Point-in-time recovery: 7 days
- Full backups: Daily at 00:00 UTC
- Transaction logs: Continuous
- Retention: 30 days
```

**Application Code:**
```
- Version control: GitHub (primary)
- Deploy history: Vercel + Railway (auto)
```

### Recovery Procedures

**If database corrupted:**
```
1. Pause API (maintenance mode)
2. Restore from latest backup (1 click Supabase)
3. Verify data integrity (sample queries)
4. Resume API
5. Notify users (status page)
6. Post-mortem (root cause analysis)

Estimated time: 15-30 minutes
Data loss: < 1 hour
```

**If API unavailable:**
```
1. Check Railway dashboard (resources?)
2. If OOM: increase container size
3. If bug: rollback to previous deploy
4. Redeploy fixed version
5. Monitor recovery

Estimated time: 5-10 minutes
```

**If frontend unreachable:**
```
1. Check Vercel deployment status
2. Check Cloudflare status (DDoS?)
3. Trigger redeploy
4. Wait for CDN invalidation (5 min)
5. Verify endpoints return 200

Estimated time: 2-5 minutes
```

### Runbook (What to do)

**On-call engineer:**
```
├─ Alert from Datadog/PagerDuty
├─ Check status dashboard
├─ Check deployment logs (last deploy)
├─ Check error tracking (Sentry)
├─ Check database metrics
├─ Decide: rollback or investigate?
├─ Communicate (Slack channel #incidents)
└─ Post-mortem (24h after incident)
```

---

## PARTE VI: COST TRACKING

### Monthly Breakdown (Estimate)

**Staging:**
```
Vercel:    $20  (frontend, included in pro plan)
Railway:   $30  (2 instances, 1 DB)
Supabase:  $25  (staging project)
Datadog:   $0   (trial period)
Cloudflare: $0  (free)
─────────────
Total:     $75
```

**Production (at 1K users):**
```
Vercel:    $20+ (included pro plan)
Railway:   $100 (API auto-scaling 2-5 instances)
Supabase:  $50+ (Pro with read replica)
Datadog:   $50+ (APM + logs)
Cloudflare: $20 (Pro plan, optional)
─────────────
Total:     $240/month
```

**Production (at 10K users):**
```
Vercel:    $50+ (overage)
Railway:   $200 (API scaling 5-10 instances)
Supabase:  $100+ (Enterprise features)
Datadog:   $150+ (volume discount)
Cloudflare: $20
─────────────
Total:     $520/month
```

### Cost Optimization

```
✅ Do:
  - Use CDN aggressively (cache everything)
  - Set auto-scaling limits (prevent runaway)
  - Monitor egress costs (Supabase)
  - Reserved instances (if predictable traffic)

❌ Don't:
  - Over-provision staging (mirror prod)
  - Leave old deployments running
  - Unused read replicas
  - Excessive logging (costs add up)
```

---

## PARTE VII: SCALING PLAYBOOK

### Hitting 1K concurrent users?

```
Action: Frontend
  └─ Already handled (Vercel auto-scales)

Action: Backend
  └─ Railway will auto-scale to 3-4 instances
  └─ Monitor CPU/memory (should stay < 80%)

Action: Database
  └─ Keep monitoring (still should be OK)
  └─ If queries slow: add read replica
```

### Hitting 10K concurrent users?

```
Action: Frontend
  └─ Might need Vercel Pro+ ($100+)

Action: Backend
  └─ Railway scaling to 5-10 instances
  └─ Cost increases to ~$200/mth
  └─ Monitor for N+1 queries

Action: Database
  └─ Add read replica (reads separate from writes)
  └─ Cost: +$50/mth per replica
  └─ Implement query caching (Redis)
```

### Hitting 100K concurrent users?

```
Action: Frontend
  └─ Vercel Enterprise ($1000+/mth)
  └─ Or: Cloudflare Pages Enterprise

Action: Backend
  └─ Multiple regions (Fly.io better here)
  └─ Or: Kubernetes (EKS/GKE) — more ops

Action: Database
  └─ Read replicas in each region
  └─ Write-master + read-slaves
  └─ Sharding (by org_id) if > 100GB
  └─ Cost: $500+/mth
```

---

## PARTE VIII: CHECKLIST PRÉ-PRODUÇÃO

- [ ] **Frontend**
  - [ ] Lighthouse score ≥ 90
  - [ ] SSL certificate installed
  - [ ] Environment variables set
  - [ ] CDN configured (Cloudflare)
  - [ ] Custom domain pointing

- [ ] **Backend**
  - [ ] Fastify production build working
  - [ ] Environment variables set (no hardcoded)
  - [ ] Rate limiting ON
  - [ ] CORS restricted to prod domain
  - [ ] Health check endpoint tested

- [ ] **Database**
  - [ ] Backup automated (Supabase)
  - [ ] Read replica setup (optional for MVP)
  - [ ] Indexes tuned
  - [ ] Connection pool: 100
  - [ ] Restore test successful

- [ ] **Monitoring**
  - [ ] Uptime monitoring configured
  - [ ] Error tracking (Sentry/Datadog)
  - [ ] Performance metrics dashboard
  - [ ] Alerts configured (email + PagerDuty)

- [ ] **Security**
  - [ ] SSL/TLS enforced
  - [ ] HSTS header
  - [ ] CORS whitelist set
  - [ ] Rate limiting in place
  - [ ] Secrets in environment (not code)

- [ ] **Documentation**
  - [ ] Runbook for on-call
  - [ ] Deployment guide
  - [ ] Rollback procedure
  - [ ] SLA documented
  - [ ] Contact info (support, escalation)

- [ ] **Testing**
  - [ ] Load test (1K concurrent users)
  - [ ] Failover test (DB down)
  - [ ] Rollback test (previous version)
  - [ ] Backup restore test

---

## DEPLOYMENT COMMANDS (QUICK REFERENCE)

```bash
# Staging deploy (develop → staging)
git push origin develop

# Production deploy (main → prod)
git push origin main

# Database migration
supabase db push

# View logs
vercel logs                    # Frontend
railway logs                   # Backend

# Rollback
vercel rollback                # Frontend (select previous)
railway rollback               # Backend (select previous)

# Status
curl https://api.kavrocrm.com/v1/health
```

---

**Responsável:** DevOps / Tech Lead  
**Review:** Quarterly (SLA review)
