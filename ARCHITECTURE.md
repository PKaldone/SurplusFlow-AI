# SurplusFlow AI — Technical Architecture Specification

## 1. System Overview

SurplusFlow AI is a compliance-first surplus recovery platform that identifies unclaimed property and foreclosure/tax-sale surplus opportunities, qualifies claimants, assembles claim packets, tracks claims through payout, and invoices success fees.

**Technology Stack:**
- **API:** Node.js + TypeScript + Fastify (chosen over Nest for lower overhead, faster cold starts, schema-first validation via JSON Schema/Typebox, and native plugin architecture ideal for modular domain services)
- **Worker:** BullMQ on Redis for job queuing
- **Database:** PostgreSQL 16 with row-level security
- **Cache/Queue:** Redis 7
- **Object Storage:** MinIO (S3-compatible) with server-side encryption (SSE-S3)
- **Frontend:** Next.js 14 (App Router) for both Admin and Portal
- **PDF Engine:** Puppeteer + Handlebars templates
- **Auth:** JWT (Admin/Ops/Compliance/Attorney) + Magic Link OTP (Claimant)

---

## 2. User Roles & Permissions (RBAC)

| Role | Code | Capabilities |
|------|------|-------------|
| **Super Admin** | `super_admin` | Full system access, manage users, configure rules, override compliance holds |
| **Admin** | `admin` | Manage cases, opportunities, outreach campaigns, view billing |
| **Ops** | `ops` | Work case queues, upload docs, trigger outreach, generate packets |
| **Compliance** | `compliance` | Review/approve outreach, verify jurisdiction rules, audit trail review |
| **Attorney Partner** | `attorney` | View assigned cases, download dossiers, submit filings, mark case milestones |
| **Claimant** | `claimant` | View own case, upload documents, sign contracts, track status, view invoices |

### Permission Matrix

```
Resource              super_admin  admin  ops  compliance  attorney  claimant
─────────────────────────────────────────────────────────────────────────────
opportunities.list         ✓         ✓     ✓       ✓          ─         ─
opportunities.create       ✓         ✓     ─       ─          ─         ─
cases.list_all             ✓         ✓     ✓       ✓          ─         ─
cases.view_own             ✓         ✓     ✓       ✓          ✓         ✓
cases.update               ✓         ✓     ✓       ─          ─         ─
documents.upload           ✓         ✓     ✓       ─          ✓         ✓
documents.view_sensitive   ✓         ─     ─       ✓          ─         ─
rules.manage               ✓         ─     ─       ✓          ─         ─
outreach.approve           ✓         ✓     ─       ✓          ─         ─
outreach.send              ✓         ✓     ✓       ─          ─         ─
billing.manage             ✓         ✓     ─       ─          ─         ─
billing.view_own           ✓         ✓     ✓       ─          ✓         ✓
audit.view                 ✓         ─     ─       ✓          ─         ─
users.manage               ✓         ✓     ─       ─          ─         ─
attorney.assign            ✓         ✓     ─       ─          ─         ─
compliance.verify_rules    ✓         ─     ─       ✓          ─         ─
```

---

## 3. Core Workflows

### 3A. Unclaimed Property Recovery

```
[Data Ingestion] → [Match/Dedupe] → [Qualify Opportunity] → [Rule Check]
    → [Generate Outreach] → [Compliance Approval] → [Send Outreach]
    → [Claimant Responds] → [Enroll: Contract + Disclosures]
    → [Collect Docs] → [Assemble Claim Packet]
    → [Submit to State] → [Track Progress] → [Payout Received]
    → [Invoice Success Fee] → [Case Closed]
```

### 3B. Foreclosure / Tax Sale Surplus Recovery

```
[Court/County Data Ingestion] → [Identify Surplus Events]
    → [Owner/Heir Research] → [Rule Check (county-level)]
    → [Generate Outreach] → [Compliance Approval] → [Send Outreach]
    → [Claimant Responds] → [Enroll: Contract + Disclosures + Assignment (if allowed)]
    → [Collect Docs + Verify Identity]
    → [Check: Attorney Required?]
        → YES: [Generate Dossier] → [Route to Attorney] → [Attorney Files Motion]
        → NO:  [Assemble Claim Packet] → [File with Court/County]
    → [Track Progress / Hearings] → [Payout Received]
    → [Invoice Success Fee] → [Case Closed]
```

---

## 4. ClaimCase State Machine

```
                    ┌─────────────┐
                    │   PROSPECT  │ (opportunity identified, no contact yet)
                    └──────┬──────┘
                           │ outreach_initiated
                    ┌──────▼──────┐
                    │  OUTREACH   │ (letters/emails/sms sent, awaiting response)
                    └──────┬──────┘
                           │ claimant_responded
                    ┌──────▼──────┐
              ┌─────│  CONTACTED  │ (claimant engaged, pre-enrollment)
              │     └──────┬──────┘
              │            │ contract_signed
              │     ┌──────▼──────┐
              │     │  ENROLLED   │ (contract executed, collecting docs)
              │     └──────┬──────┘
              │            │ docs_complete
              │     ┌──────▼──────────┐
              │     │ PACKET_ASSEMBLY │ (generating claim packet)
              │     └──────┬──────────┘
              │            │ packet_ready
              │     ┌──────▼────────────┐
              │     │ ATTORNEY_REVIEW?  │ (if rule engine says required)
              │     └──────┬────────────┘
              │            │ review_complete / not_needed
              │     ┌──────▼──────┐
              │     │  SUBMITTED  │ (filed with state/county/court)
              │     └──────┬──────┘
              │            │ claim_approved
              │     ┌──────▼──────────┐
              │     │ AWAITING_PAYOUT │ (approved, waiting for funds)
              │     └──────┬──────────┘
              │            │ payout_confirmed
              │     ┌──────▼──────┐
              │     │   INVOICED  │ (success fee invoiced to claimant)
              │     └──────┬──────┘
              │            │ fee_collected
              │     ┌──────▼──────┐
              │     │   CLOSED    │ (complete)
              │     └─────────────┘
              │
              │  (at any point)
              ├────► RESCINDED    (claimant exercised cooling-off)
              ├────► WITHDRAWN    (claimant withdrew / opt-out)
              ├────► BLOCKED      (compliance block)
              ├────► ON_HOLD      (pending compliance review / attorney)
              └────► DENIED       (claim denied by authority)
```

### Allowed Transitions Map

```typescript
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  PROSPECT:         ['OUTREACH', 'BLOCKED', 'WITHDRAWN'],
  OUTREACH:         ['CONTACTED', 'WITHDRAWN', 'BLOCKED'],
  CONTACTED:        ['ENROLLED', 'WITHDRAWN', 'BLOCKED'],
  ENROLLED:         ['PACKET_ASSEMBLY', 'RESCINDED', 'WITHDRAWN', 'BLOCKED', 'ON_HOLD'],
  PACKET_ASSEMBLY:  ['ATTORNEY_REVIEW', 'SUBMITTED', 'ON_HOLD', 'BLOCKED'],
  ATTORNEY_REVIEW:  ['SUBMITTED', 'ON_HOLD', 'BLOCKED'],
  SUBMITTED:        ['AWAITING_PAYOUT', 'DENIED', 'ON_HOLD'],
  AWAITING_PAYOUT:  ['INVOICED', 'ON_HOLD'],
  INVOICED:         ['CLOSED', 'ON_HOLD'],
  CLOSED:           [],
  RESCINDED:        [],
  WITHDRAWN:        [],
  BLOCKED:          ['PROSPECT'],  // can unblock back to prospect
  ON_HOLD:          ['ENROLLED', 'PACKET_ASSEMBLY', 'ATTORNEY_REVIEW', 'SUBMITTED', 'AWAITING_PAYOUT', 'INVOICED'],
  DENIED:           [],
};
```

---

## 5. Queue / Job Architecture

**Queue Provider:** BullMQ on Redis

| Queue Name | Job Types | Priority | Concurrency | Retry |
|-----------|-----------|----------|-------------|-------|
| `ingestion` | `import-state-data`, `import-county-records`, `import-csv` | normal | 3 | 3x exp backoff |
| `matching` | `match-owners`, `deduplicate`, `enrich-contact` | normal | 5 | 3x |
| `outreach` | `generate-letter`, `generate-email`, `generate-sms`, `schedule-followup` | normal | 5 | 2x |
| `docgen` | `generate-contract`, `generate-packet`, `generate-dossier`, `generate-invoice` | high | 2 | 3x |
| `compliance` | `rule-check`, `disclosure-check`, `solicitation-window-check` | high | 3 | 1x |
| `notifications` | `email-send`, `sms-send`, `webhook-fire` | normal | 10 | 3x |
| `followups` | `followup-check`, `escalation-check`, `payout-check` | low | 2 | 2x |

### Job Flow Diagram

```
[Ingestion Queue]
    → import-state-data → writes to opportunities table
    → triggers matching queue

[Matching Queue]
    → match-owners → links opportunity to potential claimants
    → triggers compliance queue (rule-check)

[Compliance Queue]
    → rule-check → evaluates jurisdiction rules
    → if ALLOWED/ALLOWED_WITH_CONSTRAINTS → triggers outreach queue
    → if BLOCKED → marks opportunity as blocked

[Outreach Queue]
    → generate-letter/email/sms → creates outreach record
    → waits for compliance approval (if required)
    → on approval → triggers notifications queue
    → schedules followup jobs

[DocGen Queue]
    → generate-contract → merges template with case data → stores in vault
    → generate-packet → assembles all docs into PDF bundle
    → generate-dossier → creates attorney handoff package
    → generate-invoice → creates invoice PDF

[Notifications Queue]
    → email-send / sms-send → external delivery
    → webhook-fire → notify integrations

[Followups Queue]
    → cron-scheduled checks for overdue items
    → escalation logic for stale cases
```

---

## 6. Data Model

### 6.1 Users & Auth

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('super_admin','admin','ops','compliance','attorney','claimant')),
    password_hash   VARCHAR(255),          -- NULL for claimants (magic link)
    mfa_secret      VARCHAR(255),          -- TOTP secret, encrypted
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    token_hash      VARCHAR(255) NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE magic_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    used            BOOLEAN DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 Opportunities

```sql
CREATE TABLE opportunities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type     VARCHAR(50) NOT NULL CHECK (source_type IN ('unclaimed_property','foreclosure_surplus','tax_sale_surplus')),
    source_id       VARCHAR(255),           -- external reference ID
    source_url      TEXT,
    state           VARCHAR(2) NOT NULL,    -- US state code
    county          VARCHAR(100),
    jurisdiction_key VARCHAR(100) NOT NULL,  -- "CA" or "CA-LOS_ANGELES"
    property_description TEXT,
    reported_amount NUMERIC(12,2),
    holder_name     VARCHAR(255),           -- entity holding funds
    owner_name      VARCHAR(255),           -- listed owner
    owner_address   TEXT,
    parcel_number   VARCHAR(100),
    sale_date       DATE,
    surplus_date    DATE,
    deadline_date   DATE,                   -- filing deadline if known
    status          VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new','matched','qualified','disqualified','claimed','expired')),
    ingestion_batch VARCHAR(100),
    raw_data        JSONB,                  -- original source data
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_opp_jurisdiction ON opportunities(jurisdiction_key);
CREATE INDEX idx_opp_status ON opportunities(status);
CREATE INDEX idx_opp_source ON opportunities(source_type, source_id);
CREATE INDEX idx_opp_state ON opportunities(state);
CREATE INDEX idx_opp_owner ON opportunities(owner_name);
CREATE INDEX idx_opp_amount ON opportunities(reported_amount);
```

### 6.3 Claimants

```sql
CREATE TABLE claimants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),  -- linked portal account
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    middle_name     VARCHAR(100),
    email           VARCHAR(255),
    phone           VARCHAR(20),
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    state           VARCHAR(2),
    zip             VARCHAR(10),
    ssn_encrypted   BYTEA,                  -- AES-256 encrypted
    ssn_last4       VARCHAR(4),             -- for display only
    date_of_birth   DATE,
    identity_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(50),
    do_not_contact  BOOLEAN DEFAULT FALSE,
    suppression_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_claimant_name ON claimants(last_name, first_name);
CREATE INDEX idx_claimant_email ON claimants(email);
CREATE INDEX idx_claimant_user ON claimants(user_id);
```

### 6.4 Claim Cases

```sql
CREATE TABLE claim_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number     VARCHAR(20) UNIQUE NOT NULL,  -- SF-2024-00001
    opportunity_id  UUID NOT NULL REFERENCES opportunities(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    assigned_to     UUID REFERENCES users(id),      -- ops user
    attorney_id     UUID REFERENCES users(id),      -- if assigned
    status          VARCHAR(30) NOT NULL DEFAULT 'PROSPECT',
    previous_status VARCHAR(30),
    source_type     VARCHAR(50) NOT NULL,
    jurisdiction_key VARCHAR(100) NOT NULL,
    state           VARCHAR(2) NOT NULL,
    county          VARCHAR(100),
    claimed_amount  NUMERIC(12,2),
    agreed_fee_pct  NUMERIC(5,2),             -- e.g. 33.00
    agreed_fee_cap  NUMERIC(12,2),            -- max fee if capped
    contract_version VARCHAR(20),
    contract_signed_at TIMESTAMPTZ,
    rescission_deadline TIMESTAMPTZ,
    cooling_off_days INTEGER,
    attorney_required BOOLEAN DEFAULT FALSE,
    notarization_required BOOLEAN DEFAULT FALSE,
    assignment_enabled BOOLEAN DEFAULT FALSE,
    submitted_at    TIMESTAMPTZ,
    payout_amount   NUMERIC(12,2),
    payout_date     DATE,
    payout_confirmed_at TIMESTAMPTZ,
    fee_amount      NUMERIC(12,2),
    fee_invoiced_at TIMESTAMPTZ,
    fee_collected_at TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    closed_reason   VARCHAR(100),
    notes           TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_case_status ON claim_cases(status);
CREATE INDEX idx_case_opportunity ON claim_cases(opportunity_id);
CREATE INDEX idx_case_claimant ON claim_cases(claimant_id);
CREATE INDEX idx_case_assigned ON claim_cases(assigned_to);
CREATE INDEX idx_case_attorney ON claim_cases(attorney_id);
CREATE INDEX idx_case_jurisdiction ON claim_cases(jurisdiction_key);
CREATE INDEX idx_case_number ON claim_cases(case_number);
CREATE INDEX idx_case_created ON claim_cases(created_at);
```

### 6.5 Jurisdiction Rules

```sql
CREATE TABLE jurisdiction_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_key        VARCHAR(100) NOT NULL,  -- "CA" or "FL-MIAMI_DADE"
    state                   VARCHAR(2) NOT NULL,
    county                  VARCHAR(100),           -- NULL = state-level
    source_type             VARCHAR(50) NOT NULL,
    effective_date          DATE NOT NULL,
    expiration_date         DATE,
    max_fee_percent         NUMERIC(5,2),
    fee_cap_amount          NUMERIC(12,2),
    cooling_off_days        INTEGER DEFAULT 0,
    notarization_required   BOOLEAN DEFAULT FALSE,
    assignment_allowed      BOOLEAN DEFAULT FALSE,
    license_required        BOOLEAN DEFAULT FALSE,
    bond_required           BOOLEAN DEFAULT FALSE,
    bond_amount             NUMERIC(12,2),
    solicitation_restricted BOOLEAN DEFAULT FALSE,
    solicitation_window_days INTEGER,               -- days after event before contact allowed
    required_disclosures    JSONB,                  -- array of disclosure keys
    prohibited_practices    JSONB,                  -- things you cannot do
    contract_template_version VARCHAR(20),
    filing_requirements     JSONB,                  -- what docs/forms needed
    judicial_filing_required BOOLEAN DEFAULT FALSE,
    statute_reference       VARCHAR(255),
    notes                   TEXT,
    verification_status     VARCHAR(30) DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','PENDING_REVIEW','VERIFIED','EXPIRED','REQUIRES_UPDATE')),
    verified_by             UUID REFERENCES users(id),
    verified_at             TIMESTAMPTZ,
    verification_evidence   TEXT,                   -- link to statute or memo
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(jurisdiction_key, source_type, effective_date)
);
CREATE INDEX idx_rules_jurisdiction ON jurisdiction_rules(jurisdiction_key);
CREATE INDEX idx_rules_state ON jurisdiction_rules(state);
CREATE INDEX idx_rules_source ON jurisdiction_rules(source_type);
CREATE INDEX idx_rules_effective ON jurisdiction_rules(effective_date);
CREATE INDEX idx_rules_verification ON jurisdiction_rules(verification_status);
```

### 6.6 Documents

```sql
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES claim_cases(id),
    claimant_id     UUID REFERENCES claimants(id),
    doc_type        VARCHAR(50) NOT NULL,   -- 'contract','disclosure','id_front','id_back','deed','death_cert','claim_form','invoice','dossier','outreach_letter'
    doc_category    VARCHAR(30) NOT NULL,   -- 'identity','legal','financial','correspondence','generated'
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size       INTEGER,
    storage_key     VARCHAR(500) NOT NULL,  -- S3/MinIO key
    storage_bucket  VARCHAR(100) NOT NULL,
    encryption_key_id VARCHAR(100),         -- KMS key reference
    checksum_sha256 VARCHAR(64),
    is_sensitive    BOOLEAN DEFAULT FALSE,
    retention_until DATE,
    uploaded_by     UUID REFERENCES users(id),
    version         INTEGER DEFAULT 1,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_doc_case ON documents(case_id);
CREATE INDEX idx_doc_claimant ON documents(claimant_id);
CREATE INDEX idx_doc_type ON documents(doc_type);
CREATE INDEX idx_doc_category ON documents(doc_category);
```

### 6.7 Contracts & Templates

```sql
CREATE TABLE contract_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key    VARCHAR(100) NOT NULL,  -- 'master_agreement','disclosure_addendum','assignment_addendum','notary_page','attorney_consent'
    version         VARCHAR(20) NOT NULL,   -- 'v1.0'
    jurisdiction_key VARCHAR(100),          -- NULL = default/generic
    source_type     VARCHAR(50),
    title           VARCHAR(255) NOT NULL,
    body_template   TEXT NOT NULL,           -- Handlebars template
    required_fields JSONB,                  -- merge fields required
    is_active       BOOLEAN DEFAULT TRUE,
    effective_date  DATE,
    superseded_by   UUID REFERENCES contract_templates(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_key, version, jurisdiction_key, source_type)
);
CREATE INDEX idx_template_key ON contract_templates(template_key, version);

CREATE TABLE executed_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    template_id     UUID NOT NULL REFERENCES contract_templates(id),
    document_id     UUID REFERENCES documents(id),     -- link to stored PDF
    merge_data      JSONB NOT NULL,                     -- snapshot of data used
    signed_at       TIMESTAMPTZ,
    signer_ip       INET,
    signer_user_agent TEXT,
    signature_data  TEXT,                               -- e-signature ref
    rescission_deadline TIMESTAMPTZ,
    rescinded       BOOLEAN DEFAULT FALSE,
    rescinded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_exec_contract_case ON executed_contracts(case_id);
```

### 6.8 Outreach

```sql
CREATE TABLE outreach_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    source_type     VARCHAR(50) NOT NULL,
    jurisdiction_key VARCHAR(100),
    template_key    VARCHAR(100) NOT NULL,
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('mail','email','sms')),
    status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sending','sent','paused','cancelled')),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    total_recipients INTEGER DEFAULT 0,
    sent_count      INTEGER DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outreach_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID REFERENCES outreach_campaigns(id),
    case_id         UUID REFERENCES claim_cases(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    channel         VARCHAR(20) NOT NULL,
    template_key    VARCHAR(100) NOT NULL,
    template_version VARCHAR(20),
    touch_number    INTEGER DEFAULT 1,      -- 1st, 2nd, 3rd touch
    status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','delivered','bounced','opted_out','failed')),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    merge_data      JSONB,
    document_id     UUID REFERENCES documents(id),  -- stored copy of what was sent
    stop_reason     VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_outreach_case ON outreach_records(case_id);
CREATE INDEX idx_outreach_claimant ON outreach_records(claimant_id);
CREATE INDEX idx_outreach_campaign ON outreach_records(campaign_id);
CREATE INDEX idx_outreach_status ON outreach_records(status);

CREATE TABLE suppression_list (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier      VARCHAR(255) NOT NULL,  -- email, phone, or address hash
    identifier_type VARCHAR(20) NOT NULL,   -- 'email','phone','address'
    reason          VARCHAR(100) NOT NULL,
    source          VARCHAR(100),
    added_by        UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_suppression_uniq ON suppression_list(identifier, identifier_type);
```

### 6.9 Billing & Invoices

```sql
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  VARCHAR(20) UNIQUE NOT NULL,  -- INV-2024-00001
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    payout_amount   NUMERIC(12,2) NOT NULL,
    fee_percent     NUMERIC(5,2) NOT NULL,
    fee_cap         NUMERIC(12,2),
    calculated_fee  NUMERIC(12,2) NOT NULL,
    final_fee       NUMERIC(12,2) NOT NULL,       -- min(calculated, cap)
    status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','disputed','waived','cancelled')),
    issued_at       TIMESTAMPTZ,
    due_date        DATE,
    paid_at         TIMESTAMPTZ,
    payment_method  VARCHAR(50),
    payment_reference VARCHAR(255),
    document_id     UUID REFERENCES documents(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invoice_case ON invoices(case_id);
CREATE INDEX idx_invoice_status ON invoices(status);

CREATE TABLE payout_confirmations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    confirmed_by    UUID NOT NULL REFERENCES users(id),
    payout_amount   NUMERIC(12,2) NOT NULL,
    payout_date     DATE NOT NULL,
    payout_method   VARCHAR(50),           -- 'check','ach','wire'
    evidence_doc_id UUID REFERENCES documents(id),  -- screenshot or bank confirm
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payout_case ON payout_confirmations(case_id);
```

### 6.10 Audit Log

```sql
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,  -- sequential, never gaps
    event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id        UUID,                   -- NULL for system actions
    actor_role      VARCHAR(50),
    actor_ip        INET,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID,
    case_id         UUID,                   -- denormalized for easy case audit
    details         JSONB,                  -- action-specific data
    previous_state  JSONB,                  -- before snapshot
    new_state       JSONB,                  -- after snapshot
    checksum        VARCHAR(64)             -- SHA-256 of previous row + this row for tamper detection
);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_case ON audit_log(case_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

-- Make append-only: revoke UPDATE and DELETE on audit_log from app role
-- REVOKE UPDATE, DELETE ON audit_log FROM surplusflow_app;
```

### 6.11 Attorney Assignments

```sql
CREATE TABLE attorney_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    attorney_id     UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','accepted','in_progress','filed','completed','declined')),
    routing_reason  VARCHAR(100) NOT NULL,  -- 'judicial_motion','contested_heirs','lien_dispute','complex_title'
    dossier_doc_id  UUID REFERENCES documents(id),
    accepted_at     TIMESTAMPTZ,
    filed_at        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_atty_case ON attorney_assignments(case_id);
CREATE INDEX idx_atty_attorney ON attorney_assignments(attorney_id);
CREATE INDEX idx_atty_status ON attorney_assignments(status);
```

---

## 7. API Surface

### Auth Module — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | Public | Email + password login (admin/ops/compliance/attorney) |
| POST | `/auth/magic-link` | Public | Request magic link (claimant) |
| POST | `/auth/magic-link/verify` | Public | Verify magic link token |
| POST | `/auth/refresh` | Bearer | Refresh JWT |
| POST | `/auth/logout` | Bearer | Invalidate session |
| POST | `/auth/mfa/setup` | Bearer | Initialize TOTP setup |
| POST | `/auth/mfa/verify` | Bearer | Verify TOTP code |

### Users — `/api/v1/users`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users` | Admin+ | List users with filters |
| POST | `/users` | SuperAdmin | Create user |
| GET | `/users/:id` | Admin+ | Get user details |
| PATCH | `/users/:id` | SuperAdmin | Update user |
| DELETE | `/users/:id` | SuperAdmin | Deactivate user |

### Opportunities — `/api/v1/opportunities`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/opportunities` | Ops+ | List with filters (state, type, amount range, status) |
| GET | `/opportunities/:id` | Ops+ | Detail view |
| POST | `/opportunities/import` | Admin | Trigger CSV/data import job |
| PATCH | `/opportunities/:id` | Ops+ | Update status/notes |
| POST | `/opportunities/:id/qualify` | Ops+ | Run qualification check |
| GET | `/opportunities/:id/rule-check` | Ops+ | Preview jurisdiction rule evaluation |

### Cases — `/api/v1/cases`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/cases` | Ops+ | List with filters |
| POST | `/cases` | Ops+ | Create case from opportunity + claimant |
| GET | `/cases/:id` | Ops+/Attorney(own)/Claimant(own) | Case detail |
| PATCH | `/cases/:id` | Ops+ | Update case fields |
| POST | `/cases/:id/transition` | Ops+ | Trigger status transition |
| GET | `/cases/:id/timeline` | Ops+ | Full event timeline |
| GET | `/cases/:id/documents` | Ops+/Attorney(own)/Claimant(own) | List case documents |
| GET | `/cases/:id/checklist` | Ops+/Claimant(own) | Document checklist with status |
| POST | `/cases/:id/assign-attorney` | Admin | Route to attorney |
| POST | `/cases/:id/generate-packet` | Ops+ | Trigger claim packet generation |
| POST | `/cases/:id/generate-dossier` | Admin | Generate attorney dossier |

### Claimants — `/api/v1/claimants`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/claimants` | Ops+ | List/search claimants |
| POST | `/claimants` | Ops+ | Create claimant record |
| GET | `/claimants/:id` | Ops+/Claimant(own) | Claimant detail |
| PATCH | `/claimants/:id` | Ops+/Claimant(own) | Update |
| POST | `/claimants/:id/verify-identity` | Ops+ | Trigger ID verification |

### Documents — `/api/v1/documents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/documents/upload` | Ops+/Attorney/Claimant | Upload file |
| GET | `/documents/:id` | RBAC-checked | Get metadata |
| GET | `/documents/:id/download` | RBAC-checked | Presigned download URL |
| DELETE | `/documents/:id` | Admin+ | Soft delete |

### Contracts — `/api/v1/contracts`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/contracts/templates` | Admin+ | List templates |
| POST | `/contracts/generate` | Ops+ | Generate contract for a case |
| POST | `/contracts/:id/sign` | Claimant | E-sign contract |
| POST | `/contracts/:id/rescind` | Claimant | Exercise cooling-off |
| GET | `/contracts/:id` | Ops+/Claimant(own) | View executed contract |

### Outreach — `/api/v1/outreach`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/outreach/campaigns` | Ops+ | List campaigns |
| POST | `/outreach/campaigns` | Ops+ | Create campaign |
| POST | `/outreach/campaigns/:id/approve` | Compliance+ | Approve for sending |
| POST | `/outreach/campaigns/:id/send` | Ops+ | Trigger send |
| GET | `/outreach/records` | Ops+ | List outreach records |
| POST | `/outreach/opt-out` | Public | Process opt-out request |

### Rules — `/api/v1/rules`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/rules` | Compliance+ | List all rules |
| GET | `/rules/:id` | Compliance+ | Rule detail |
| POST | `/rules` | Compliance | Create rule |
| PATCH | `/rules/:id` | Compliance | Update rule |
| POST | `/rules/evaluate` | Ops+ | Evaluate rules for given inputs |
| POST | `/rules/:id/verify` | Compliance | Mark as verified with evidence |
| POST | `/rules/import` | Compliance | Bulk import from CSV |

### Billing — `/api/v1/billing`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/invoices` | Admin+/Claimant(own) | List invoices |
| POST | `/billing/invoices` | Admin | Create invoice for case |
| GET | `/billing/invoices/:id` | Admin+/Claimant(own) | Invoice detail |
| PATCH | `/billing/invoices/:id` | Admin | Update invoice status |
| POST | `/billing/payout-confirm` | Ops+ | Record payout confirmation |

### Attorney — `/api/v1/attorney`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/attorney/assignments` | Attorney(own) | My assignments |
| GET | `/attorney/assignments/:id` | Attorney(own) | Assignment detail |
| PATCH | `/attorney/assignments/:id` | Attorney(own) | Update status/notes |
| GET | `/attorney/assignments/:id/dossier` | Attorney(own) | Download dossier |

### Audit — `/api/v1/audit`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/audit/log` | Compliance+SuperAdmin | Query audit log |
| GET | `/audit/log/case/:caseId` | Compliance+ | Audit trail for a case |
| GET | `/audit/log/export` | SuperAdmin | Export audit log (rate-limited) |

### Portal (Claimant) — `/api/v1/portal`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/portal/my-cases` | Claimant | List my cases |
| GET | `/portal/my-cases/:id` | Claimant | Case detail + status tracker |
| GET | `/portal/my-cases/:id/documents` | Claimant | My documents |
| POST | `/portal/my-cases/:id/upload` | Claimant | Upload document |
| GET | `/portal/my-cases/:id/contract` | Claimant | View contract |
| GET | `/portal/my-invoices` | Claimant | My invoices |

---

## 8. Document Vault Strategy

### Storage Architecture
- **Provider:** MinIO (local dev) / AWS S3 (production)
- **Buckets:**
  - `surplusflow-documents` — general docs
  - `surplusflow-sensitive` — identity docs, SSN-containing files
  - `surplusflow-generated` — system-generated PDFs

### Encryption
- **At Rest:** SSE-S3 (AES-256) for all buckets, enforced via bucket policy
- **Sensitive Bucket:** Additional client-side encryption using envelope encryption:
  - Data Encryption Key (DEK) generated per file
  - DEK encrypted by Key Encryption Key (KEK) stored in AWS KMS / HashiCorp Vault
  - Encrypted DEK stored alongside file metadata in DB
- **SSN Fields:** AES-256-GCM encrypted at application level before DB insert

### Key Management
- **Development:** Local key file (gitignored), rotated quarterly
- **Production:** AWS KMS or HashiCorp Vault
- Key rotation: KEK rotated annually; re-encryption job for DEKs
- Key access logged in audit trail

### Access Control
- Presigned URLs (15-minute expiry) for downloads
- No direct bucket access from frontend
- RBAC check before presigned URL generation
- Sensitive documents require Compliance or SuperAdmin role
- Every download event logged to audit trail

### Retention
- Identity documents: retained 7 years after case close, then auto-purge
- Contracts: retained permanently
- Generated packets: retained 7 years
- Outreach copies: retained 3 years
- Retention enforced via S3 lifecycle policies + scheduled purge job

---

## 9. Audit Log Design

### Properties
- **Append-only:** Application DB role has INSERT only on audit_log; UPDATE/DELETE revoked
- **Tamper detection:** Each row includes SHA-256 checksum of `previous_checksum + row_data`
- **Immutable:** No soft deletes, no modifications

### Event Types

| Event Category | Actions |
|---------------|---------|
| AUTH | `auth.login`, `auth.logout`, `auth.magic_link_sent`, `auth.mfa_verified`, `auth.failed_login` |
| USER | `user.created`, `user.updated`, `user.deactivated`, `user.role_changed` |
| CASE | `case.created`, `case.status_changed`, `case.assigned`, `case.attorney_routed`, `case.note_added` |
| DOCUMENT | `doc.uploaded`, `doc.downloaded`, `doc.deleted`, `doc.viewed` |
| CONTRACT | `contract.generated`, `contract.signed`, `contract.rescinded` |
| OUTREACH | `outreach.created`, `outreach.approved`, `outreach.sent`, `outreach.opted_out` |
| RULE | `rule.created`, `rule.updated`, `rule.verified`, `rule.evaluated` |
| BILLING | `invoice.created`, `invoice.sent`, `invoice.paid`, `payout.confirmed` |
| COMPLIANCE | `compliance.hold_placed`, `compliance.hold_released`, `compliance.rule_blocked` |
| ATTORNEY | `attorney.assigned`, `attorney.accepted`, `attorney.filed`, `attorney.completed` |
| SYSTEM | `system.job_started`, `system.job_completed`, `system.job_failed`, `system.export_requested` |
| SECURITY | `security.sensitive_access`, `security.permission_denied`, `security.unusual_activity` |

### Audit Writer Interface

```typescript
interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  caseId?: string;
  details?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}
```
