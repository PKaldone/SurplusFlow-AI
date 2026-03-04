# SurplusFlow AI — Security & Compliance Specification

## 1. THREAT MODEL — Top 20 Risks

| # | Threat | Category | Likelihood | Impact | Mitigation |
|---|--------|----------|-----------|--------|------------|
| 1 | **Identity fraud** — Attacker impersonates claimant to steal funds | Identity | HIGH | CRITICAL | ID verification workflow, 2FA on claimant portal, SSN cross-check, audit trail |
| 2 | **Data breach** — Unauthorized access to PII database | Data | MEDIUM | CRITICAL | Encryption at rest (AES-256), column-level encryption for SSN, RBAC, network segmentation |
| 3 | **Insider access abuse** — Employee accesses/exports sensitive data | Insider | MEDIUM | HIGH | Principle of least privilege, RBAC, audit log all sensitive access, periodic access reviews |
| 4 | **Document tampering** — Modification of contracts or claim docs | Integrity | LOW | CRITICAL | SHA-256 checksums on all documents, append-only audit log with chain verification |
| 5 | **Phishing/social engineering** — Staff tricked into giving access | Social | HIGH | HIGH | 2FA mandatory for staff, security training, email filtering, magic links expire in 15min |
| 6 | **Payout redirection scam** — Attacker changes claimant banking info | Financial | MEDIUM | CRITICAL | Funds go directly to claimant from authority; platform never handles funds; payout confirmation workflow |
| 7 | **Magic link interception** — Email account compromise exposes claimant portal | Auth | MEDIUM | HIGH | Short expiry (15min), single-use tokens, IP logging, anomaly detection |
| 8 | **SQL injection** — Malicious input exploits database queries | Application | LOW | CRITICAL | Parameterized queries only, input validation layer, ORM/query builder |
| 9 | **API rate limit bypass** — Brute force or enumeration attacks | Application | MEDIUM | MEDIUM | Rate limiting per IP, account lockout after 5 failed attempts, CAPTCHA on auth |
| 10 | **File upload malware** — Infected files uploaded via document vault | Malware | MEDIUM | MEDIUM | File type whitelist, virus scanning before storage, no server-side execution of uploads |
| 11 | **Unauthorized contract modification** — Altering fee or terms post-signature | Legal | LOW | HIGH | Executed contracts are immutable snapshots (merge_data frozen), versioned templates |
| 12 | **Suppression list bypass** — Contacting opted-out individuals | Compliance | MEDIUM | HIGH | Stop rule engine checks on every outreach, suppression list checked pre-send |
| 13 | **Solicitation window violation** — Contacting too early after event | Compliance | MEDIUM | HIGH | Rule engine enforces window, compliance approval gate before send |
| 14 | **Cross-tenant data leakage** — Claimant sees another's case data | Data | LOW | CRITICAL | Row-level filtering on all queries, claimant portal scoped to own records only |
| 15 | **JWT token theft** — Stolen token used to impersonate user | Auth | MEDIUM | HIGH | Short expiry (15min), refresh token rotation, session tracking, IP binding |
| 16 | **Privilege escalation** — Lower-role user accesses admin functions | Access | LOW | HIGH | Server-side RBAC enforcement on every endpoint, no client-trust of roles |
| 17 | **Audit log tampering** — Modifying evidence of actions | Integrity | LOW | CRITICAL | Append-only table (REVOKE UPDATE/DELETE), chained checksums, DB role restrictions |
| 18 | **Denial of service** — Overwhelming API or worker queues | Availability | MEDIUM | MEDIUM | Rate limiting, queue concurrency limits, autoscaling, CDN for static assets |
| 19 | **Unencrypted backup exposure** — Database backups leaked | Data | LOW | CRITICAL | Encrypted backups, backup access logging, separate encryption keys for backups |
| 20 | **Third-party dependency compromise** — Supply chain attack via npm | Supply Chain | LOW | HIGH | Lockfile pinning, dependency audit (npm audit), minimal dependency surface, SCA scanning |

---

## 2. SECURITY CONTROLS

### 2.1 Authentication & Authorization
- **Staff (Admin/Ops/Compliance/Attorney):** Email + password (bcrypt, cost=12) + mandatory TOTP 2FA
- **Claimant:** Magic link (15-min expiry, single-use, SHA-256 hashed in DB)
- **JWT:** Access token (15-min), refresh token (7-day), RS256 or HS256 with 256-bit secret
- **Session management:** Track active sessions, IP + user agent logging, max 5 concurrent sessions
- **Account lockout:** 5 failed login attempts → 15-min lockout → audit alert

### 2.2 RBAC Enforcement
- Server-side role check on every API endpoint via Fastify preHandler hooks
- No client-side role trust — all permissions verified server-side
- Claimant queries automatically scoped to own records (WHERE claimant_id = $userId)
- Sensitive document access restricted to compliance + super_admin roles
- Audit log access restricted to compliance + super_admin

### 2.3 Encryption
- **At rest:** SSE-S3 (AES-256) on all MinIO/S3 buckets (enforced by bucket policy)
- **Sensitive bucket:** Additional envelope encryption (DEK per file, KEK in KMS/Vault)
- **SSN fields:** AES-256-GCM encrypted at application level, separate key from general encryption
- **In transit:** TLS 1.2+ mandatory for all connections
- **Database:** PostgreSQL SSL connections enforced in production

### 2.4 Secrets Management
- **Development:** `.env` files (gitignored), documented in `.env.example`
- **Production:** AWS Secrets Manager / HashiCorp Vault
- **Key rotation schedule:**
  - JWT secret: every 90 days
  - Encryption KEK: annually (re-encrypt DEKs)
  - SSN encryption key: annually (re-encrypt SSN fields)
  - Database passwords: every 90 days
  - S3/MinIO keys: every 90 days
- **No secrets in code, logs, or error messages**

### 2.5 Audit Log Immutability
- PostgreSQL table with INSERT-only permissions for app role:
  ```sql
  GRANT INSERT ON audit_log TO surplusflow_app;
  REVOKE UPDATE, DELETE ON audit_log FROM surplusflow_app;
  GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO surplusflow_app;
  ```
- Chained SHA-256 checksums (each row hashes previous checksum + current data)
- Integrity verification job runs daily, alerts on chain breaks
- Retention: 7 years minimum, archival to cold storage after 2 years

### 2.6 Incident Response
1. **Detection:** Monitoring alerts (see §3), audit log anomaly detection
2. **Triage:** On-call rotation, severity classification (P1-P4)
3. **Containment:** Revoke compromised credentials, disable affected accounts, block IPs
4. **Investigation:** Audit log review, access log analysis
5. **Notification:** Affected users notified within 72 hours (GDPR/state breach notification laws)
6. **Remediation:** Root cause analysis, control improvements, post-mortem documentation
7. **Reporting:** File with applicable state AGs if PII breach affects >500 records

---

## 3. MONITORING PLAN

### 3.1 Application Logs
- **Format:** Structured JSON via Pino
- **Destination:** stdout → log aggregator (DataDog/ELK/CloudWatch)
- **Log levels:** ERROR, WARN, INFO (production), DEBUG (development)
- **Sensitive data redaction:** SSN, passwords, tokens never logged; PII redacted in logs

### 3.2 Metrics
| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| API response time (p95) | Fastify metrics | > 2000ms |
| API error rate (5xx) | HTTP status codes | > 1% over 5 min |
| Failed login attempts | Audit log | > 10 per IP per 15 min |
| Job failure rate | BullMQ events | > 5% over 1 hour |
| Queue depth | Redis queue length | > 1000 jobs in any queue |
| Database connections | pg pool stats | > 80% pool utilization |
| Document upload volume | Audit log | > 100/hour (anomaly) |
| Sensitive document access | Audit log | Any access by non-compliance role |
| Audit export requests | Audit log | Any request (always alert) |
| Magic link generation rate | Audit log | > 20/hour per email (brute force) |
| Suppression list additions | Outreach records | Spike detection |
| Case status transition anomalies | State machine | Blocked transitions attempted |

### 3.3 Alerts
- **P1 (Critical):** Data breach indicators, audit chain integrity failure, >5% 5xx rate
- **P2 (High):** Failed login spikes, sensitive data access anomalies, job queue stalled
- **P3 (Medium):** High response times, approaching resource limits, elevated error rates
- **P4 (Low):** Unusual access patterns, export requests, new jurisdiction rule usage

### 3.4 Dashboards
- **Operations:** Case pipeline (counts by status), queue health, outreach metrics
- **Security:** Login attempts, sensitive access log, audit integrity status
- **Compliance:** Rule evaluation results, unverified rules count, outreach compliance

---

## 4. ATTORNEY PARTNER MODULE

### 4.1 Routing Triggers
A case is routed to an attorney when:

| Trigger | Detection Method | Routing Reason |
|---------|-----------------|----------------|
| Judicial filing required | Rule engine: `judicial_filing_required = true` | `judicial_motion` |
| Contested heirs | Ops flags during research | `contested_heirs` |
| Lien or judgment on funds | Research/title check reveals encumbrances | `lien_dispute` |
| Complex chain of title | Multiple ownership transfers, probate needed | `complex_title` |
| Statutory requirement | Rule engine: specific statute requires attorney | `statutory_requirement` |

### 4.2 Attorney Workflow
```
[Ops identifies attorney need] → [Admin assigns attorney via API]
    → [System generates dossier PDF] → [Attorney notified]
    → [Attorney accepts/declines assignment]
    → [Attorney reviews dossier, requests additional docs if needed]
    → [Attorney files motion/petition with court]
    → [Attorney updates status: filed → hearing → completed]
    → [Case resumes normal flow: SUBMITTED → AWAITING_PAYOUT]
```

### 4.3 Dossier Contents (Auto-Generated PDF)
1. **Cover Page:** Case number, attorney assignment details, routing reason
2. **Case Summary:** Source type, jurisdiction, claimed amount, timeline
3. **Claimant Profile:** Name, contact info (SSN redacted to last 4), relationship to property
4. **Property/Opportunity Details:** Parcel number, sale date, surplus amount, holder info
5. **Jurisdiction Rules Summary:** Applicable constraints, required filings, statute references
6. **Document Inventory:** List of all collected documents with upload dates
7. **Communication History:** Outreach timeline, claimant responses
8. **Compliance Notes:** Rule evaluation results, any flags or warnings
9. **Filing Checklist:** What needs to be filed, where, with what forms

### 4.4 Attorney Portal (Minimal)
- View assigned cases with dossier download
- Update assignment status (accepted → in_progress → filed → completed)
- Add notes and filing references
- Upload court documents (orders, judgments)
- All actions audit-logged

---

## 5. COMPLIANCE REVIEW WORKFLOW

### 5.1 Verification Status Lifecycle
```
                ┌─────────────┐
                │  UNVERIFIED  │ (newly created or imported rule)
                └──────┬──────┘
                       │ compliance user submits for review
                ┌──────▼──────────┐
                │ PENDING_REVIEW  │ (under legal review)
                └──────┬──────────┘
                       │ compliance user verifies with evidence
                ┌──────▼──────┐
                │  VERIFIED   │ (confirmed by legal review)
                └──────┬──────┘
                       │ statute changes / time passes
                ┌──────▼──────────────┐
                │  REQUIRES_UPDATE    │ (flagged for re-review)
                └──────┬──────────────┘
                       │ new review cycle
                       └──────→ PENDING_REVIEW → VERIFIED
                
                At any point: VERIFIED → EXPIRED (rule expiration_date passed)
```

### 5.2 Who Can Verify
- **Only `compliance` and `super_admin` roles** can change verification_status
- Verification requires:
  - `verification_evidence`: Link to statute text, legal memo, or attorney confirmation
  - `verified_by`: User ID of the verifier (auto-set from auth)
  - `verified_at`: Timestamp (auto-set)
  - Optional `notes`: Additional context

### 5.3 System Behaviors by Verification Status

| Status | System Behavior |
|--------|----------------|
| UNVERIFIED | Rule is applied with warnings; all outreach requires manual compliance approval; UI shows ⚠️ warning |
| PENDING_REVIEW | Same as UNVERIFIED + "Under Review" badge; compliance notified |
| VERIFIED | Rule is applied normally; outreach can proceed with standard approval flow; UI shows ✓ |
| REQUIRES_UPDATE | Same as UNVERIFIED; system flags all active cases in this jurisdiction for review |
| EXPIRED | Rule not applied; system falls back to state-level or blocks with "No current rule" warning |

### 5.4 Automated Triggers
- **Quarterly review reminder:** All VERIFIED rules older than 90 days flagged for re-review
- **Statute monitoring:** (Future) Monitor legislative databases for changes to referenced statutes
- **New rule detection:** When a case is created in a jurisdiction with no rules, system creates an UNVERIFIED placeholder and alerts compliance team

---

## 6. IMPLEMENTATION CHECKLIST

### Phase 1: Security Foundation
- [ ] Configure PostgreSQL roles (app role INSERT-only on audit_log)
- [ ] Set up MinIO bucket policies (SSE-S3 enforced, no public access)
- [ ] Implement bcrypt password hashing (cost=12)
- [ ] Implement JWT auth with refresh token rotation
- [ ] Implement magic link auth with 15-min expiry
- [ ] Set up TOTP 2FA for staff accounts
- [ ] Implement RBAC middleware with role checks on all endpoints
- [ ] Implement input validation on all API endpoints
- [ ] Set up rate limiting (100 req/min per IP)
- [ ] Implement account lockout (5 failed attempts → 15-min lock)
- [ ] Configure TLS for all connections
- [ ] Set up `.env` management and secret rotation schedule

### Phase 2: Data Protection
- [ ] Implement SSN encryption (AES-256-GCM) at application layer
- [ ] Implement envelope encryption for sensitive document bucket
- [ ] Set up document checksum verification (SHA-256)
- [ ] Implement presigned URL generation with 15-min expiry
- [ ] Implement file upload virus scanning
- [ ] Configure file type whitelist (PDF, JPG, PNG, TIFF only)
- [ ] Implement PII redaction in logs
- [ ] Set up encrypted database backups
- [ ] Configure S3 lifecycle policies for retention enforcement

### Phase 3: Audit & Monitoring
- [ ] Deploy append-only audit log with chained checksums
- [ ] Implement audit integrity verification cron job (daily)
- [ ] Set up structured logging (Pino → aggregator)
- [ ] Configure monitoring dashboards (ops, security, compliance)
- [ ] Set up alerting rules (P1-P4)
- [ ] Implement sensitive access detection alerts
- [ ] Implement failed login spike detection
- [ ] Set up audit export with rate limiting and alerts
- [ ] Configure log retention (7 years)

### Phase 4: Compliance
- [ ] Deploy jurisdiction rule engine with evaluation pipeline
- [ ] Implement verification status lifecycle
- [ ] Set up quarterly rule review reminders
- [ ] Implement outreach stop rules and suppression list
- [ ] Implement compliance approval gate for outreach campaigns
- [ ] Implement cooling-off period enforcement in contract system
- [ ] Set up solicitation window checks
- [ ] Deploy required disclosure enforcement

### Phase 5: Attorney Module
- [ ] Implement attorney assignment API
- [ ] Build dossier PDF generator
- [ ] Set up attorney portal (view assignments, update status, download dossier)
- [ ] Implement attorney routing triggers in case workflow
- [ ] Test end-to-end attorney workflow

### Phase 6: Production Hardening
- [ ] Penetration testing
- [ ] Security audit of all endpoints
- [ ] Load testing (queue throughput, API response times)
- [ ] Disaster recovery testing (backup restore)
- [ ] Incident response tabletop exercise
- [ ] Document security policies and procedures
- [ ] Set up on-call rotation
- [ ] Configure automated dependency vulnerability scanning (npm audit, Snyk/Dependabot)
