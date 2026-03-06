-- ============================================================
-- SurplusFlow AI — Demo Data Seed Script
-- Run: psql -f infra/seed-demo-data.sql (after migrations + seed.js)
--
-- Idempotent: uses ON CONFLICT / IF NOT EXISTS checks
-- Requires: users from infra/scripts/seed.js already present
-- ============================================================

BEGIN;

-- ============================================================
-- 0. RESOLVE USER IDS FROM seed.js
-- ============================================================

DO $$
DECLARE
    v_admin_id          UUID;
    v_ops_id            UUID;
    v_compliance_id     UUID;
    v_attorney_id       UUID;
    v_claimant_user_id  UUID;

    -- Claimant IDs
    v_cl1 UUID; v_cl2 UUID; v_cl3 UUID; v_cl4 UUID;
    v_cl5 UUID; v_cl6 UUID; v_cl7 UUID; v_cl8 UUID;

    -- Opportunity IDs
    v_op1  UUID; v_op2  UUID; v_op3  UUID; v_op4  UUID;
    v_op5  UUID; v_op6  UUID; v_op7  UUID; v_op8  UUID;
    v_op9  UUID; v_op10 UUID; v_op11 UUID; v_op12 UUID;

    -- Case IDs
    v_cs1 UUID; v_cs2 UUID; v_cs3 UUID; v_cs4 UUID;
    v_cs5 UUID; v_cs6 UUID; v_cs7 UUID; v_cs8 UUID;

    -- Campaign IDs
    v_camp1 UUID; v_camp2 UUID;

BEGIN
    -- Lookup seeded users
    SELECT id INTO v_admin_id         FROM users WHERE email = 'admin@surplusflow.com';
    SELECT id INTO v_ops_id           FROM users WHERE email = 'ops1@surplusflow.com';
    SELECT id INTO v_compliance_id    FROM users WHERE email = 'compliance@surplusflow.com';
    SELECT id INTO v_attorney_id      FROM users WHERE email = 'attorney@lawfirm.com';
    SELECT id INTO v_claimant_user_id FROM users WHERE email = 'john.doe@email.com';

    IF v_admin_id IS NULL OR v_ops_id IS NULL THEN
        RAISE EXCEPTION 'Seed users not found. Run infra/scripts/seed.js first.';
    END IF;

    -- ============================================================
    -- 1. JURISDICTION RULES (5 rules)
    -- ============================================================

    INSERT INTO jurisdiction_rules (
        jurisdiction_key, state, source_type, effective_date, max_fee_percent,
        cooling_off_days, notarization_required, assignment_allowed, license_required,
        bond_required, solicitation_restricted, solicitation_window_days,
        required_disclosures, judicial_filing_required, statute_reference,
        verification_status, verified_by, verified_at, notes
    ) VALUES
    -- Florida unclaimed property
    (
        'FL_unclaimed', 'FL', 'unclaimed_property', '2025-01-01', 20.00,
        10, TRUE, FALSE, FALSE,
        FALSE, TRUE, 45,
        '["free_filing_disclosure","fee_disclosure","rescission_disclosure","notarization_notice"]'::jsonb,
        FALSE, 'FL Stat. 717.1400',
        'VERIFIED', v_compliance_id, '2026-01-15T10:00:00Z',
        'Max 20% fee. 10-day cooling-off. Notarization required on all assignment contracts.'
    ),
    -- California unclaimed property
    (
        'CA_unclaimed', 'CA', 'unclaimed_property', '2025-01-01', 10.00,
        30, FALSE, FALSE, FALSE,
        FALSE, TRUE, 30,
        '["free_filing_disclosure","fee_disclosure","rescission_disclosure"]'::jsonb,
        FALSE, 'CA CCP 1501-1599',
        'VERIFIED', v_compliance_id, '2026-01-15T10:30:00Z',
        'Max 10% fee. 30-day cooling-off period. No notarization required.'
    ),
    -- Texas tax sale surplus
    (
        'TX_taxsale', 'TX', 'tax_sale_surplus', '2025-01-01', 33.00,
        0, FALSE, TRUE, FALSE,
        FALSE, FALSE, NULL,
        '["fee_disclosure"]'::jsonb,
        FALSE, 'TX Tax Code 34.04',
        'VERIFIED', v_compliance_id, '2026-01-16T09:00:00Z',
        'Max 33% fee. No cooling-off period. Assignment of claims allowed.'
    ),
    -- New York foreclosure surplus
    (
        'NY_foreclosure', 'NY', 'foreclosure_surplus', '2025-01-01', 15.00,
        0, FALSE, FALSE, TRUE,
        TRUE, TRUE, 60,
        '["free_filing_disclosure","fee_disclosure","attorney_disclosure","judicial_notice"]'::jsonb,
        TRUE, 'NY RPAPL 1361',
        'VERIFIED', v_compliance_id, '2026-01-16T11:00:00Z',
        'Max 15% fee. Attorney required. Judicial filing mandatory. Bond required ($10,000).'
    ),
    -- Ohio unclaimed property
    (
        'OH_unclaimed', 'OH', 'unclaimed_property', '2025-01-01', 10.00,
        15, FALSE, FALSE, FALSE,
        FALSE, TRUE, 30,
        '["free_filing_disclosure","fee_disclosure","rescission_disclosure"]'::jsonb,
        FALSE, 'OH Rev. Code 169.01-169.10',
        'PENDING_REVIEW', NULL, NULL,
        'Max 10% fee. 15-day cooling-off period. Pending legal team verification.'
    )
    ON CONFLICT (jurisdiction_key, source_type, effective_date) DO NOTHING;

    -- Update bond_amount for NY rule
    UPDATE jurisdiction_rules
       SET bond_amount = 10000.00
     WHERE jurisdiction_key = 'NY_foreclosure' AND source_type = 'foreclosure_surplus'
       AND bond_amount IS NULL;

    -- ============================================================
    -- 2. CLAIMANTS (8 claimants)
    -- ============================================================

    -- Claimant 1: existing John Doe from seed.js — look up
    SELECT id INTO v_cl1 FROM claimants WHERE email = 'john.doe@email.com' LIMIT 1;

    IF v_cl1 IS NULL THEN
        INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, user_id, identity_verified, verification_method)
        VALUES ('John', 'Doe', 'john.doe@email.com', '+15551234567', '123 Main St', 'Los Angeles', 'CA', '90001', v_claimant_user_id, TRUE, 'id_upload')
        RETURNING id INTO v_cl1;
    END IF;

    -- Claimant 2
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, ssn_last4, date_of_birth, identity_verified, verification_method)
    VALUES ('Maria', 'Garcia', 'maria.garcia@gmail.com', '+13055559012', '4500 Biscayne Blvd Apt 12', 'Miami', 'FL', '33137', '4821', '1978-03-15', TRUE, 'id_upload')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl2;
    IF v_cl2 IS NULL THEN SELECT id INTO v_cl2 FROM claimants WHERE email = 'maria.garcia@gmail.com'; END IF;

    -- Claimant 3
    INSERT INTO claimants (first_name, last_name, middle_name, email, phone, address_line1, city, state, zip, ssn_last4, date_of_birth, identity_verified, verification_method)
    VALUES ('Robert', 'Johnson', 'Lee', 'rjohnson@yahoo.com', '+12145558765', '789 Elm St', 'Dallas', 'TX', '75201', '3347', '1965-11-22', TRUE, 'notarized_affidavit')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl3;
    IF v_cl3 IS NULL THEN SELECT id INTO v_cl3 FROM claimants WHERE email = 'rjohnson@yahoo.com'; END IF;

    -- Claimant 4
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, identity_verified, do_not_contact, suppression_reason)
    VALUES ('Patricia', 'Williams', 'pwilliams@hotmail.com', '+17185553421', '220 E 42nd St Apt 8B', 'New York', 'NY', '10017', FALSE, TRUE, 'Requested no further contact on 2026-01-20')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl4;
    IF v_cl4 IS NULL THEN SELECT id INTO v_cl4 FROM claimants WHERE email = 'pwilliams@hotmail.com'; END IF;

    -- Claimant 5
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, ssn_last4, date_of_birth, identity_verified, verification_method)
    VALUES ('James', 'Brown', 'jbrown.surplus@gmail.com', '+12165557890', '1100 Euclid Ave', 'Cleveland', 'OH', '44115', '9954', '1982-07-04', TRUE, 'id_upload')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl5;
    IF v_cl5 IS NULL THEN SELECT id INTO v_cl5 FROM claimants WHERE email = 'jbrown.surplus@gmail.com'; END IF;

    -- Claimant 6
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, identity_verified)
    VALUES ('Linda', 'Martinez', 'linda.m@outlook.com', '+19165554321', '2200 J Street', 'Sacramento', 'CA', '95816', FALSE)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl6;
    IF v_cl6 IS NULL THEN SELECT id INTO v_cl6 FROM claimants WHERE email = 'linda.m@outlook.com'; END IF;

    -- Claimant 7
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, city, state, zip, ssn_last4, date_of_birth, identity_verified, verification_method)
    VALUES ('David', 'Chen', 'dchen@proton.me', '+17185559876', '88-10 Justice Ave Apt 4F', 'Queens', 'NY', '11373', '6102', '1990-09-18', TRUE, 'id_upload')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl7;
    IF v_cl7 IS NULL THEN SELECT id INTO v_cl7 FROM claimants WHERE email = 'dchen@proton.me'; END IF;

    -- Claimant 8
    INSERT INTO claimants (first_name, last_name, email, phone, address_line1, address_line2, city, state, zip, identity_verified, do_not_contact, suppression_reason)
    VALUES ('Susan', 'Taylor', 'staylor99@aol.com', '+18325556543', '3300 Smith St', 'Suite 200', 'Houston', 'TX', '77006', FALSE, TRUE, 'Represented by own attorney — cease outreach')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_cl8;
    IF v_cl8 IS NULL THEN SELECT id INTO v_cl8 FROM claimants WHERE email = 'staylor99@aol.com'; END IF;

    -- ============================================================
    -- 3. OPPORTUNITIES (12 opportunities)
    -- ============================================================

    -- Op 1: FL unclaimed property - $4,200 - new
    v_op1 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op1, 'unclaimed_property', 'FL-UP-2026-00441', 'FL', 'FL_unclaimed', 4200.00,
        'Maria Garcia', 'Bank of America', 'Dormant savings account', 'matched',
        'FL_UP_2026_Q1', '2026-01-10T08:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 2: CA unclaimed property - $8,750 - qualified
    v_op2 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op2, 'unclaimed_property', 'CA-UP-2026-10234', 'CA', 'CA_unclaimed', 8750.00,
        'John Doe', 'Wells Fargo Bank', 'Unclaimed checking account and safe deposit contents', 'qualified',
        'CA_UP_2026_Q1', '2026-01-05T12:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 3: TX tax sale surplus - $22,500 - matched
    v_op3 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, county, jurisdiction_key, reported_amount, owner_name, property_description, parcel_number, sale_date, surplus_date, status, ingestion_batch, created_at)
    VALUES (v_op3, 'tax_sale_surplus', 'TX-TS-2025-78543', 'TX', 'Dallas', 'TX_taxsale', 22500.00,
        'Robert Johnson', 'Residential property tax sale surplus — 789 Elm St', 'R000078543',
        '2025-09-15', '2025-10-01', 'matched',
        'TX_TS_2025_Q4', '2025-12-20T14:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 4: NY foreclosure surplus - $47,300 - qualified
    v_op4 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, county, jurisdiction_key, reported_amount, owner_name, property_description, parcel_number, sale_date, surplus_date, deadline_date, status, created_at)
    VALUES (v_op4, 'foreclosure_surplus', 'NY-FS-2025-30102', 'NY', 'Queens', 'NY_foreclosure', 47300.00,
        'David Chen', 'Foreclosure surplus from condo unit 4F sale', '04-0088-0010',
        '2025-08-20', '2025-09-10', '2026-09-10', 'qualified',
        '2025-11-15T09:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 5: OH unclaimed property - $1,250 - new
    v_op5 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op5, 'unclaimed_property', 'OH-UP-2026-05511', 'OH', 'OH_unclaimed', 1250.00,
        'James Brown', 'Nationwide Insurance', 'Unclaimed insurance refund', 'new',
        'OH_UP_2026_Q1', '2026-02-01T10:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 6: FL unclaimed property - $500 - new (small amount)
    v_op6 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op6, 'unclaimed_property', 'FL-UP-2026-00887', 'FL', 'FL_unclaimed', 500.00,
        'Patricia Williams', 'Comcast Cable', 'Utility deposit refund', 'new',
        'FL_UP_2026_Q1', '2026-01-10T08:15:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 7: CA unclaimed property - $3,200 - new
    v_op7 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op7, 'unclaimed_property', 'CA-UP-2026-10801', 'CA', 'CA_unclaimed', 3200.00,
        'Linda Martinez', 'State Farm Insurance', 'Unclaimed insurance payout', 'new',
        'CA_UP_2026_Q1', '2026-01-05T12:30:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 8: TX tax sale surplus - $15,800 - claimed
    v_op8 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, county, jurisdiction_key, reported_amount, owner_name, property_description, parcel_number, sale_date, surplus_date, status, created_at)
    VALUES (v_op8, 'tax_sale_surplus', 'TX-TS-2025-65210', 'TX', 'Harris', 'TX_taxsale', 15800.00,
        'Susan Taylor', 'Tax sale surplus — 3300 Smith St commercial unit', 'H000065210',
        '2025-07-01', '2025-07-20', 'claimed',
        '2025-10-01T16:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 9: NY foreclosure surplus - $31,000 - matched
    v_op9 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, county, jurisdiction_key, reported_amount, owner_name, property_description, parcel_number, sale_date, surplus_date, deadline_date, status, created_at)
    VALUES (v_op9, 'foreclosure_surplus', 'NY-FS-2026-00215', 'NY', 'Brooklyn', 'NY_foreclosure', 31000.00,
        'Patricia Williams', 'Foreclosure surplus from brownstone sale', '03-0220-0045',
        '2025-11-05', '2025-12-01', '2026-12-01', 'matched',
        '2026-01-20T11:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 10: OH unclaimed property - $6,400 - qualified
    v_op10 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op10, 'unclaimed_property', 'OH-UP-2026-05899', 'OH', 'OH_unclaimed', 6400.00,
        'James Brown', 'KeyBank', 'Dormant CD maturity proceeds', 'qualified',
        'OH_UP_2026_Q1', '2026-02-01T10:30:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 11: FL unclaimed property - $12,000 - qualified
    v_op11 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, ingestion_batch, created_at)
    VALUES (v_op11, 'unclaimed_property', 'FL-UP-2026-01203', 'FL', 'FL_unclaimed', 12000.00,
        'Maria Garcia', 'Merrill Lynch', 'Unclaimed brokerage account liquidation', 'qualified',
        'FL_UP_2026_Q1', '2026-01-10T08:45:00Z')
    ON CONFLICT DO NOTHING;

    -- Op 12: TX tax sale surplus - $50,000 - new (high value)
    v_op12 := gen_random_uuid();
    INSERT INTO opportunities (id, source_type, source_id, state, county, jurisdiction_key, reported_amount, owner_name, property_description, parcel_number, sale_date, surplus_date, deadline_date, status, created_at)
    VALUES (v_op12, 'tax_sale_surplus', 'TX-TS-2026-00102', 'TX', 'Travis', 'TX_taxsale', 50000.00,
        'Unknown Estate of Henderson', 'Tax sale surplus — large commercial parcel', 'T000100200',
        '2025-12-01', '2025-12-15', '2026-12-15', 'new',
        '2026-02-15T13:00:00Z')
    ON CONFLICT DO NOTHING;

    -- ============================================================
    -- 4. CLAIM CASES (8 cases)
    -- ============================================================

    -- Case 1: PROSPECT — FL unclaimed, Maria Garcia
    v_cs1 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, source_type, jurisdiction_key, state, claimed_amount, created_at, updated_at)
    VALUES (v_cs1, 'SF-2026-0001', v_op1, v_cl2, v_ops_id, 'PROSPECT',
        'unclaimed_property', 'FL_unclaimed', 'FL', 4200.00,
        '2026-01-15T09:00:00Z', '2026-01-15T09:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs1 FROM claim_cases WHERE case_number = 'SF-2026-0001'; END IF;

    -- Case 2: ENROLLED — CA unclaimed, John Doe
    v_cs2 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, previous_status, source_type, jurisdiction_key, state, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, rescission_deadline, cooling_off_days, created_at, updated_at)
    VALUES (v_cs2, 'SF-2026-0002', v_op2, v_cl1, v_ops_id, 'ENROLLED', 'PROSPECT',
        'unclaimed_property', 'CA_unclaimed', 'CA', 8750.00, 10.00,
        'v2.1', '2026-01-20T14:00:00Z', '2026-02-19T14:00:00Z', 30,
        '2026-01-12T10:00:00Z', '2026-01-20T14:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs2 FROM claim_cases WHERE case_number = 'SF-2026-0002'; END IF;

    -- Case 3: PACKET_ASSEMBLY — TX tax sale, Robert Johnson
    v_cs3 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, previous_status, source_type, jurisdiction_key, state, county, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, cooling_off_days, assignment_enabled, created_at, updated_at)
    VALUES (v_cs3, 'SF-2026-0003', v_op3, v_cl3, v_ops_id, 'PACKET_ASSEMBLY', 'ENROLLED',
        'tax_sale_surplus', 'TX_taxsale', 'TX', 'Dallas', 22500.00, 25.00,
        'v1.8', '2026-01-05T11:00:00Z', NULL, 0, TRUE,
        '2025-12-28T15:00:00Z', '2026-01-10T16:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs3 FROM claim_cases WHERE case_number = 'SF-2026-0003'; END IF;

    -- Case 4: SUBMITTED — NY foreclosure, David Chen (attorney required)
    v_cs4 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, attorney_id, status, previous_status, source_type, jurisdiction_key, state, county, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, attorney_required, notarization_required, submitted_at, created_at, updated_at)
    VALUES (v_cs4, 'SF-2026-0004', v_op4, v_cl7, v_ops_id, v_attorney_id, 'SUBMITTED', 'PACKET_ASSEMBLY',
        'foreclosure_surplus', 'NY_foreclosure', 'NY', 'Queens', 47300.00, 15.00,
        'v3.0', '2025-12-10T10:00:00Z', TRUE, FALSE,
        '2026-02-01T09:30:00Z',
        '2025-11-20T08:00:00Z', '2026-02-01T09:30:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs4 FROM claim_cases WHERE case_number = 'SF-2026-0004'; END IF;

    -- Case 5: AWAITING_PAYOUT — OH unclaimed, James Brown
    v_cs5 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, previous_status, source_type, jurisdiction_key, state, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, rescission_deadline, cooling_off_days, submitted_at, created_at, updated_at)
    VALUES (v_cs5, 'SF-2026-0005', v_op10, v_cl5, v_ops_id, 'AWAITING_PAYOUT', 'SUBMITTED',
        'unclaimed_property', 'OH_unclaimed', 'OH', 6400.00, 10.00,
        'v2.1', '2026-02-10T13:00:00Z', '2026-02-25T13:00:00Z', 15,
        '2026-02-18T10:00:00Z',
        '2026-02-05T11:00:00Z', '2026-02-25T16:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs5 FROM claim_cases WHERE case_number = 'SF-2026-0005'; END IF;

    -- Case 6: INVOICED — FL unclaimed, Maria Garcia (second case)
    v_cs6 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, previous_status, source_type, jurisdiction_key, state, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, rescission_deadline, cooling_off_days, notarization_required, submitted_at, payout_amount, payout_date, payout_confirmed_at, fee_amount, fee_invoiced_at, created_at, updated_at)
    VALUES (v_cs6, 'SF-2026-0006', v_op11, v_cl2, v_ops_id, 'INVOICED', 'AWAITING_PAYOUT',
        'unclaimed_property', 'FL_unclaimed', 'FL', 12000.00, 18.00,
        'v2.0', '2026-01-18T09:00:00Z', '2026-01-28T09:00:00Z', 10, TRUE,
        '2026-01-25T14:00:00Z', 11850.00, '2026-02-20', '2026-02-20T15:00:00Z',
        2133.00, '2026-02-22T10:00:00Z',
        '2026-01-14T08:00:00Z', '2026-02-22T10:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs6 FROM claim_cases WHERE case_number = 'SF-2026-0006'; END IF;

    -- Case 7: CLOSED — TX tax sale, Susan Taylor
    v_cs7 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, status, previous_status, source_type, jurisdiction_key, state, county, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, cooling_off_days, assignment_enabled, submitted_at, payout_amount, payout_date, payout_confirmed_at, fee_amount, fee_invoiced_at, fee_collected_at, closed_at, closed_reason, created_at, updated_at)
    VALUES (v_cs7, 'SF-2026-0007', v_op8, v_cl8, v_ops_id, 'CLOSED', 'INVOICED',
        'tax_sale_surplus', 'TX_taxsale', 'TX', 'Harris', 15800.00, 30.00,
        'v1.8', '2025-10-20T11:00:00Z', NULL, 0, TRUE,
        '2025-11-05T09:00:00Z', 15800.00, '2026-01-10', '2026-01-10T14:00:00Z',
        4740.00, '2026-01-12T10:00:00Z', '2026-01-25T16:30:00Z',
        '2026-01-30T09:00:00Z', 'Fee collected — case complete',
        '2025-10-10T07:00:00Z', '2026-01-30T09:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs7 FROM claim_cases WHERE case_number = 'SF-2026-0007'; END IF;

    -- Case 8: ENROLLED — NY foreclosure, Patricia Williams (attorney required)
    v_cs8 := gen_random_uuid();
    INSERT INTO claim_cases (id, case_number, opportunity_id, claimant_id, assigned_to, attorney_id, status, previous_status, source_type, jurisdiction_key, state, county, claimed_amount, agreed_fee_pct, contract_version, contract_signed_at, attorney_required, created_at, updated_at)
    VALUES (v_cs8, 'SF-2026-0008', v_op9, v_cl4, v_ops_id, v_attorney_id, 'ENROLLED', 'PROSPECT',
        'foreclosure_surplus', 'NY_foreclosure', 'NY', 'Brooklyn', 31000.00, 15.00,
        'v3.0', '2026-02-05T10:00:00Z', TRUE,
        '2026-01-25T13:00:00Z', '2026-02-05T10:00:00Z')
    ON CONFLICT (case_number) DO NOTHING;
    IF NOT FOUND THEN SELECT id INTO v_cs8 FROM claim_cases WHERE case_number = 'SF-2026-0008'; END IF;

    -- ============================================================
    -- 5. INVOICES (3 invoices)
    -- ============================================================

    -- Invoice 1: Case 6 (INVOICED) — FL unclaimed, Maria Garcia
    -- Payout $11,850 x 18% = $2,133.00
    INSERT INTO invoices (invoice_number, case_id, claimant_id, payout_amount, fee_percent, fee_cap, calculated_fee, final_fee, status, issued_at, due_date)
    VALUES ('INV-2026-0001', v_cs6, v_cl2, 11850.00, 18.00, NULL, 2133.00, 2133.00, 'sent', '2026-02-22T10:00:00Z', '2026-03-22')
    ON CONFLICT (invoice_number) DO NOTHING;

    -- Invoice 2: Case 7 (CLOSED) — TX tax sale, Susan Taylor
    -- Payout $15,800 x 30% = $4,740.00
    INSERT INTO invoices (invoice_number, case_id, claimant_id, payout_amount, fee_percent, fee_cap, calculated_fee, final_fee, status, issued_at, due_date, paid_at, payment_method, payment_reference)
    VALUES ('INV-2026-0002', v_cs7, v_cl8, 15800.00, 30.00, NULL, 4740.00, 4740.00, 'paid', '2026-01-12T10:00:00Z', '2026-02-11', '2026-01-25T16:30:00Z', 'ach_transfer', 'ACH-REF-20260125-4740')
    ON CONFLICT (invoice_number) DO NOTHING;

    -- Invoice 3: Case 7 draft (waived small adjustment)
    -- Additional $200 admin fee — waived as goodwill
    INSERT INTO invoices (invoice_number, case_id, claimant_id, payout_amount, fee_percent, fee_cap, calculated_fee, final_fee, status, notes)
    VALUES ('INV-2026-0003', v_cs7, v_cl8, 15800.00, 30.00, NULL, 200.00, 0.00, 'waived', 'Administrative adjustment waived as client goodwill')
    ON CONFLICT (invoice_number) DO NOTHING;

    -- ============================================================
    -- 6. OUTREACH CAMPAIGNS (2 campaigns, 7 records total)
    -- ============================================================

    -- Campaign 1: Direct mail — FL unclaimed property
    v_camp1 := gen_random_uuid();
    INSERT INTO outreach_campaigns (id, name, source_type, jurisdiction_key, template_key, channel, status, approved_by, approved_at, total_recipients, sent_count, created_by, created_at)
    VALUES (v_camp1, 'FL Unclaimed Property Q1 2026 — Direct Mail', 'unclaimed_property', 'FL_unclaimed',
        'fl_unclaimed_initial_mail_v2', 'mail', 'sent', v_compliance_id, '2026-01-12T16:00:00Z',
        3, 3, v_ops_id, '2026-01-11T09:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Campaign 1 outreach records (3 mail pieces)
    INSERT INTO outreach_records (campaign_id, claimant_id, channel, template_key, template_version, touch_number, status, sent_at, delivered_at, responded_at, merge_data)
    VALUES
    (v_camp1, v_cl2, 'mail', 'fl_unclaimed_initial_mail_v2', 'v2.0', 1, 'delivered',
        '2026-01-14T08:00:00Z', '2026-01-18T12:00:00Z', '2026-01-20T09:00:00Z',
        '{"claimant_name":"Maria Garcia","amount":"$4,200.00","state":"Florida"}'::jsonb),
    (v_camp1, v_cl2, 'mail', 'fl_unclaimed_initial_mail_v2', 'v2.0', 1, 'delivered',
        '2026-01-14T08:00:00Z', '2026-01-19T14:00:00Z', NULL,
        '{"claimant_name":"Maria Garcia","amount":"$12,000.00","state":"Florida"}'::jsonb),
    (v_camp1, v_cl6, 'mail', 'fl_unclaimed_initial_mail_v2', 'v2.0', 1, 'bounced',
        '2026-01-14T08:00:00Z', NULL, NULL,
        '{"claimant_name":"Linda Martinez","amount":"$500.00","state":"Florida"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- Campaign 2: Email — OH unclaimed property
    v_camp2 := gen_random_uuid();
    INSERT INTO outreach_campaigns (id, name, source_type, jurisdiction_key, template_key, channel, status, approved_by, approved_at, total_recipients, sent_count, created_by, created_at)
    VALUES (v_camp2, 'OH Unclaimed Property Q1 2026 — Email', 'unclaimed_property', 'OH_unclaimed',
        'oh_unclaimed_initial_email_v1', 'email', 'sent', v_compliance_id, '2026-02-03T11:00:00Z',
        4, 4, v_ops_id, '2026-02-02T14:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Campaign 2 outreach records (4 emails)
    INSERT INTO outreach_records (campaign_id, claimant_id, channel, template_key, template_version, touch_number, status, sent_at, delivered_at, opened_at, responded_at, merge_data)
    VALUES
    (v_camp2, v_cl5, 'email', 'oh_unclaimed_initial_email_v1', 'v1.0', 1, 'delivered',
        '2026-02-04T08:00:00Z', '2026-02-04T08:01:00Z', '2026-02-04T12:15:00Z', '2026-02-05T09:30:00Z',
        '{"claimant_name":"James Brown","amount":"$6,400.00","state":"Ohio"}'::jsonb),
    (v_camp2, v_cl5, 'email', 'oh_unclaimed_initial_email_v1', 'v1.0', 1, 'delivered',
        '2026-02-04T08:00:00Z', '2026-02-04T08:01:00Z', '2026-02-04T18:00:00Z', NULL,
        '{"claimant_name":"James Brown","amount":"$1,250.00","state":"Ohio"}'::jsonb),
    (v_camp2, v_cl1, 'email', 'oh_unclaimed_initial_email_v1', 'v1.0', 1, 'sent',
        '2026-02-04T08:00:00Z', NULL, NULL, NULL,
        '{"claimant_name":"John Doe","amount":"$8,750.00","state":"Ohio"}'::jsonb),
    (v_camp2, v_cl4, 'email', 'oh_unclaimed_initial_email_v1', 'v1.0', 1, 'opted_out',
        '2026-02-04T08:00:00Z', '2026-02-04T08:01:00Z', NULL, NULL,
        '{"claimant_name":"Patricia Williams","amount":"$500.00","state":"Ohio"}'::jsonb)
    ON CONFLICT DO NOTHING;

    -- ============================================================
    -- 7. ATTORNEY ASSIGNMENTS (2 assignments for NY cases)
    -- ============================================================

    -- Assignment 1: Case 4 (SUBMITTED) — filed with court
    INSERT INTO attorney_assignments (case_id, attorney_id, status, routing_reason, accepted_at, filed_at, notes, created_at, updated_at)
    VALUES (v_cs4, v_attorney_id, 'filed',
        'NY foreclosure surplus requires judicial filing per NY RPAPL 1361',
        '2025-12-12T10:00:00Z', '2026-01-28T14:00:00Z',
        'Petition filed with Queens County Supreme Court. Index No. pending.',
        '2025-12-10T16:00:00Z', '2026-01-28T14:00:00Z')
    ON CONFLICT DO NOTHING;

    -- Assignment 2: Case 8 (ENROLLED) — pending acceptance
    INSERT INTO attorney_assignments (case_id, attorney_id, status, routing_reason, notes, created_at, updated_at)
    VALUES (v_cs8, v_attorney_id, 'pending',
        'NY foreclosure surplus requires judicial filing per NY RPAPL 1361',
        'Awaiting attorney review of case dossier.',
        '2026-02-06T09:00:00Z', '2026-02-06T09:00:00Z')
    ON CONFLICT DO NOTHING;

    -- ============================================================
    -- 8. AUDIT LOG ENTRIES (10 entries)
    -- ============================================================

    INSERT INTO audit_log (timestamp, actor_id, actor_role, actor_ip, action, resource_type, resource_id, case_id, details) VALUES
    -- Admin login
    ('2026-01-15T08:00:00Z', v_admin_id, 'super_admin', '10.0.1.50', 'user.login', 'user', v_admin_id, NULL,
        '{"method":"password","user_agent":"Mozilla/5.0"}'::jsonb),
    -- Ops login
    ('2026-01-15T08:30:00Z', v_ops_id, 'ops', '10.0.1.51', 'user.login', 'user', v_ops_id, NULL,
        '{"method":"password","user_agent":"Mozilla/5.0"}'::jsonb),
    -- Case 1 created
    ('2026-01-15T09:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'case.created', 'claim_case', v_cs1, v_cs1,
        '{"case_number":"SF-2026-0001","source_type":"unclaimed_property"}'::jsonb),
    -- Case 2 status transition PROSPECT -> ENROLLED
    ('2026-01-20T14:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'case.status_changed', 'claim_case', v_cs2, v_cs2,
        '{"case_number":"SF-2026-0002"}'::jsonb),
    -- Case 3 status transition ENROLLED -> PACKET_ASSEMBLY
    ('2026-01-10T16:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'case.status_changed', 'claim_case', v_cs3, v_cs3,
        '{"case_number":"SF-2026-0003"}'::jsonb),
    -- Document uploaded for case 4
    ('2026-01-25T11:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'document.uploaded', 'document', gen_random_uuid(), v_cs4,
        '{"doc_type":"claim_petition","filename":"chen_petition_queens.pdf","file_size":245000}'::jsonb),
    -- Attorney accepted case 4
    ('2025-12-12T10:00:00Z', v_attorney_id, 'attorney', '10.0.2.10', 'attorney.accepted', 'attorney_assignment', gen_random_uuid(), v_cs4,
        '{"case_number":"SF-2026-0004","attorney":"Sarah Attorney"}'::jsonb),
    -- Compliance approved outreach campaign
    ('2026-01-12T16:00:00Z', v_compliance_id, 'compliance', '10.0.1.52', 'campaign.approved', 'outreach_campaign', v_camp1, NULL,
        '{"campaign_name":"FL Unclaimed Property Q1 2026 — Direct Mail","channel":"mail","recipients":3}'::jsonb),
    -- Invoice sent for case 6
    ('2026-02-22T10:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'invoice.sent', 'invoice', gen_random_uuid(), v_cs6,
        '{"invoice_number":"INV-2026-0001","final_fee":2133.00}'::jsonb),
    -- Case 7 closed
    ('2026-01-30T09:00:00Z', v_ops_id, 'ops', '10.0.1.51', 'case.closed', 'claim_case', v_cs7, v_cs7,
        '{"case_number":"SF-2026-0007","reason":"Fee collected — case complete","fee_collected":4740.00}'::jsonb);

    -- ============================================================
    -- 9. CASE STATUS HISTORY (for the cases with transitions)
    -- ============================================================

    INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason, created_at) VALUES
    -- Case 2: PROSPECT -> ENROLLED
    (v_cs2, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed by claimant', '2026-01-20T14:00:00Z'),
    -- Case 3: PROSPECT -> ENROLLED -> PACKET_ASSEMBLY
    (v_cs3, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed by claimant', '2026-01-05T11:00:00Z'),
    (v_cs3, 'ENROLLED', 'PACKET_ASSEMBLY', v_ops_id, 'All required documents identified, beginning assembly', '2026-01-10T16:00:00Z'),
    -- Case 4: PROSPECT -> ENROLLED -> PACKET_ASSEMBLY -> SUBMITTED
    (v_cs4, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed, attorney assigned', '2025-12-10T10:00:00Z'),
    (v_cs4, 'ENROLLED', 'PACKET_ASSEMBLY', v_ops_id, 'Attorney accepted, assembling court filings', '2025-12-15T09:00:00Z'),
    (v_cs4, 'PACKET_ASSEMBLY', 'SUBMITTED', v_ops_id, 'Petition filed with Queens County Supreme Court', '2026-02-01T09:30:00Z'),
    -- Case 5: PROSPECT -> ENROLLED -> SUBMITTED -> AWAITING_PAYOUT
    (v_cs5, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed by claimant', '2026-02-10T13:00:00Z'),
    (v_cs5, 'ENROLLED', 'SUBMITTED', v_ops_id, 'Claim form submitted to Ohio COM', '2026-02-18T10:00:00Z'),
    (v_cs5, 'SUBMITTED', 'AWAITING_PAYOUT', v_ops_id, 'Claim approved by state, awaiting check', '2026-02-25T16:00:00Z'),
    -- Case 6: full lifecycle to INVOICED
    (v_cs6, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed, notarized', '2026-01-18T09:00:00Z'),
    (v_cs6, 'ENROLLED', 'SUBMITTED', v_ops_id, 'Claim submitted to FL DFS', '2026-01-25T14:00:00Z'),
    (v_cs6, 'SUBMITTED', 'AWAITING_PAYOUT', v_ops_id, 'Claim approved by FL', '2026-02-15T10:00:00Z'),
    (v_cs6, 'AWAITING_PAYOUT', 'INVOICED', v_ops_id, 'Payout confirmed, invoice sent', '2026-02-22T10:00:00Z'),
    -- Case 7: full lifecycle to CLOSED
    (v_cs7, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed by claimant', '2025-10-20T11:00:00Z'),
    (v_cs7, 'ENROLLED', 'PACKET_ASSEMBLY', v_ops_id, 'Assembling tax sale documentation', '2025-10-25T09:00:00Z'),
    (v_cs7, 'PACKET_ASSEMBLY', 'SUBMITTED', v_ops_id, 'Claim filed with Harris County', '2025-11-05T09:00:00Z'),
    (v_cs7, 'SUBMITTED', 'AWAITING_PAYOUT', v_ops_id, 'Claim approved by county', '2025-12-20T14:00:00Z'),
    (v_cs7, 'AWAITING_PAYOUT', 'INVOICED', v_ops_id, 'Payout received, invoice issued', '2026-01-12T10:00:00Z'),
    (v_cs7, 'INVOICED', 'CLOSED', v_ops_id, 'Fee collected via ACH', '2026-01-30T09:00:00Z'),
    -- Case 8: PROSPECT -> ENROLLED
    (v_cs8, 'PROSPECT', 'ENROLLED', v_ops_id, 'Contract signed, attorney assignment pending', '2026-02-05T10:00:00Z');

    RAISE NOTICE 'Demo data seeded successfully.';
    RAISE NOTICE '  Jurisdiction rules: 5';
    RAISE NOTICE '  Claimants: 8';
    RAISE NOTICE '  Opportunities: 12';
    RAISE NOTICE '  Claim cases: 8';
    RAISE NOTICE '  Invoices: 3';
    RAISE NOTICE '  Outreach campaigns: 2 (7 records)';
    RAISE NOTICE '  Attorney assignments: 2';
    RAISE NOTICE '  Audit log entries: 10';
    RAISE NOTICE '  Case status history: 20';

END $$;

COMMIT;
