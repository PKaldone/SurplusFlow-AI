-- Migration 001: Core Schema
-- SurplusFlow AI - All tables, indexes, and constraints
-- Run with: psql -f 001_core_schema.sql

BEGIN;

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    phone           VARCHAR(20),
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL CHECK (role IN ('super_admin','admin','ops','compliance','attorney','claimant')),
    password_hash   VARCHAR(255),
    mfa_secret_encrypted VARCHAR(255),
    mfa_enabled     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS magic_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    used            BOOLEAN DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token_hash);

-- ============================================================
-- OPPORTUNITIES
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type     VARCHAR(50) NOT NULL CHECK (source_type IN ('unclaimed_property','foreclosure_surplus','tax_sale_surplus')),
    source_id       VARCHAR(255),
    source_url      TEXT,
    state           VARCHAR(2) NOT NULL,
    county          VARCHAR(100),
    jurisdiction_key VARCHAR(100) NOT NULL,
    property_description TEXT,
    reported_amount NUMERIC(12,2),
    holder_name     VARCHAR(255),
    owner_name      VARCHAR(255),
    owner_address   TEXT,
    parcel_number   VARCHAR(100),
    sale_date       DATE,
    surplus_date    DATE,
    deadline_date   DATE,
    status          VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new','matched','qualified','disqualified','claimed','expired')),
    ingestion_batch VARCHAR(100),
    raw_data        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opp_jurisdiction ON opportunities(jurisdiction_key);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_source ON opportunities(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_opp_state ON opportunities(state);
CREATE INDEX IF NOT EXISTS idx_opp_owner ON opportunities(owner_name);
CREATE INDEX IF NOT EXISTS idx_opp_amount ON opportunities(reported_amount);

-- ============================================================
-- CLAIMANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS claimants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
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
    ssn_encrypted   BYTEA,
    ssn_last4       VARCHAR(4),
    date_of_birth   DATE,
    identity_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(50),
    do_not_contact  BOOLEAN DEFAULT FALSE,
    suppression_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claimant_name ON claimants(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_claimant_email ON claimants(email);
CREATE INDEX IF NOT EXISTS idx_claimant_user ON claimants(user_id);

-- ============================================================
-- CLAIM CASES
-- ============================================================

CREATE TABLE IF NOT EXISTS claim_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number     VARCHAR(20) UNIQUE NOT NULL,
    opportunity_id  UUID NOT NULL REFERENCES opportunities(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    assigned_to     UUID REFERENCES users(id),
    attorney_id     UUID REFERENCES users(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'PROSPECT',
    previous_status VARCHAR(30),
    source_type     VARCHAR(50) NOT NULL,
    jurisdiction_key VARCHAR(100) NOT NULL,
    state           VARCHAR(2) NOT NULL,
    county          VARCHAR(100),
    claimed_amount  NUMERIC(12,2),
    agreed_fee_pct  NUMERIC(5,2),
    agreed_fee_cap  NUMERIC(12,2),
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
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_status ON claim_cases(status);
CREATE INDEX IF NOT EXISTS idx_case_opportunity ON claim_cases(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_case_claimant ON claim_cases(claimant_id);
CREATE INDEX IF NOT EXISTS idx_case_assigned ON claim_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_attorney ON claim_cases(attorney_id);
CREATE INDEX IF NOT EXISTS idx_case_jurisdiction ON claim_cases(jurisdiction_key);
CREATE INDEX IF NOT EXISTS idx_case_number ON claim_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_case_created ON claim_cases(created_at);

-- ============================================================
-- JURISDICTION RULES
-- ============================================================

CREATE TABLE IF NOT EXISTS jurisdiction_rules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jurisdiction_key        VARCHAR(100) NOT NULL,
    state                   VARCHAR(2) NOT NULL,
    county                  VARCHAR(100),
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
    solicitation_window_days INTEGER,
    required_disclosures    JSONB DEFAULT '[]',
    prohibited_practices    JSONB DEFAULT '[]',
    contract_template_version VARCHAR(20),
    filing_requirements     JSONB DEFAULT '{}',
    judicial_filing_required BOOLEAN DEFAULT FALSE,
    statute_reference       VARCHAR(255),
    notes                   TEXT,
    verification_status     VARCHAR(30) DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','PENDING_REVIEW','VERIFIED','EXPIRED','REQUIRES_UPDATE')),
    verified_by             UUID REFERENCES users(id),
    verified_at             TIMESTAMPTZ,
    verification_evidence   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(jurisdiction_key, source_type, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_rules_jurisdiction ON jurisdiction_rules(jurisdiction_key);
CREATE INDEX IF NOT EXISTS idx_rules_state ON jurisdiction_rules(state);
CREATE INDEX IF NOT EXISTS idx_rules_source ON jurisdiction_rules(source_type);
CREATE INDEX IF NOT EXISTS idx_rules_effective ON jurisdiction_rules(effective_date);
CREATE INDEX IF NOT EXISTS idx_rules_verification ON jurisdiction_rules(verification_status);

-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES claim_cases(id),
    claimant_id     UUID REFERENCES claimants(id),
    doc_type        VARCHAR(50) NOT NULL,
    doc_category    VARCHAR(30) NOT NULL,
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size       INTEGER,
    storage_key     VARCHAR(500) NOT NULL,
    storage_bucket  VARCHAR(100) NOT NULL,
    encryption_key_id VARCHAR(100),
    checksum_sha256 VARCHAR(64),
    is_sensitive    BOOLEAN DEFAULT FALSE,
    retention_until DATE,
    uploaded_by     UUID REFERENCES users(id),
    version         INTEGER DEFAULT 1,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_doc_claimant ON documents(claimant_id);
CREATE INDEX IF NOT EXISTS idx_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_doc_category ON documents(doc_category);

-- ============================================================
-- CONTRACT TEMPLATES & EXECUTED CONTRACTS
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key    VARCHAR(100) NOT NULL,
    version         VARCHAR(20) NOT NULL,
    jurisdiction_key VARCHAR(100),
    source_type     VARCHAR(50),
    title           VARCHAR(255) NOT NULL,
    body_template   TEXT NOT NULL,
    required_fields JSONB DEFAULT '[]',
    is_active       BOOLEAN DEFAULT TRUE,
    effective_date  DATE,
    superseded_by   UUID REFERENCES contract_templates(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_key, version, jurisdiction_key, source_type)
);
CREATE INDEX IF NOT EXISTS idx_template_key ON contract_templates(template_key, version);

CREATE TABLE IF NOT EXISTS executed_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    template_id     UUID NOT NULL REFERENCES contract_templates(id),
    document_id     UUID REFERENCES documents(id),
    merge_data      JSONB NOT NULL,
    signed_at       TIMESTAMPTZ,
    signer_ip       INET,
    signer_user_agent TEXT,
    signature_data  TEXT,
    rescission_deadline TIMESTAMPTZ,
    rescinded       BOOLEAN DEFAULT FALSE,
    rescinded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exec_contract_case ON executed_contracts(case_id);

-- ============================================================
-- OUTREACH
-- ============================================================

CREATE TABLE IF NOT EXISTS outreach_campaigns (
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

CREATE TABLE IF NOT EXISTS outreach_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID REFERENCES outreach_campaigns(id),
    case_id         UUID REFERENCES claim_cases(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    channel         VARCHAR(20) NOT NULL,
    template_key    VARCHAR(100) NOT NULL,
    template_version VARCHAR(20),
    touch_number    INTEGER DEFAULT 1,
    status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','delivered','bounced','opted_out','failed')),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    merge_data      JSONB,
    document_id     UUID REFERENCES documents(id),
    stop_reason     VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outreach_case ON outreach_records(case_id);
CREATE INDEX IF NOT EXISTS idx_outreach_claimant ON outreach_records(claimant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign ON outreach_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_records(status);

CREATE TABLE IF NOT EXISTS suppression_list (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier      VARCHAR(255) NOT NULL,
    identifier_type VARCHAR(20) NOT NULL,
    reason          VARCHAR(100) NOT NULL,
    source          VARCHAR(100),
    added_by        UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_uniq ON suppression_list(identifier, identifier_type);

-- ============================================================
-- BILLING & INVOICES
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  VARCHAR(20) UNIQUE NOT NULL,
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    claimant_id     UUID NOT NULL REFERENCES claimants(id),
    payout_amount   NUMERIC(12,2) NOT NULL,
    fee_percent     NUMERIC(5,2) NOT NULL,
    fee_cap         NUMERIC(12,2),
    calculated_fee  NUMERIC(12,2) NOT NULL,
    final_fee       NUMERIC(12,2) NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_invoice_case ON invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);

CREATE TABLE IF NOT EXISTS payout_confirmations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    confirmed_by    UUID NOT NULL REFERENCES users(id),
    payout_amount   NUMERIC(12,2) NOT NULL,
    payout_date     DATE NOT NULL,
    payout_method   VARCHAR(50),
    evidence_doc_id UUID REFERENCES documents(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_case ON payout_confirmations(case_id);

-- ============================================================
-- ATTORNEY ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS attorney_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    attorney_id     UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','accepted','in_progress','filed','completed','declined')),
    routing_reason  VARCHAR(100) NOT NULL,
    dossier_doc_id  UUID REFERENCES documents(id),
    accepted_at     TIMESTAMPTZ,
    filed_at        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atty_case ON attorney_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_atty_attorney ON attorney_assignments(attorney_id);
CREATE INDEX IF NOT EXISTS idx_atty_status ON attorney_assignments(status);

-- ============================================================
-- AUDIT LOG (APPEND-ONLY)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id        UUID,
    actor_role      VARCHAR(50),
    actor_ip        INET,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID,
    case_id         UUID,
    details         JSONB,
    previous_state  JSONB,
    new_state       JSONB,
    checksum        VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- ============================================================
-- CASE STATUS HISTORY (for tracking all transitions)
-- ============================================================

CREATE TABLE IF NOT EXISTS case_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES claim_cases(id),
    from_status     VARCHAR(30),
    to_status       VARCHAR(30) NOT NULL,
    changed_by      UUID REFERENCES users(id),
    reason          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_history_case ON case_status_history(case_id);

-- ============================================================
-- PERMISSIONS: Make audit_log append-only for app role
-- ============================================================

-- In production, restrict the app role:
-- GRANT INSERT ON audit_log TO surplusflow_app;
-- REVOKE UPDATE, DELETE ON audit_log FROM surplusflow_app;
-- GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO surplusflow_app;

COMMIT;
