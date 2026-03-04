// ============================================================
// SurplusFlow AI — Seed Script
// Run: node infra/scripts/seed.js (after migrations)
// ============================================================

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sfuser:sfpass_local_dev@localhost:5432/surplusflow',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Users ---
    const users = [
      { email: 'admin@surplusflow.com', name: 'System Admin', role: 'super_admin', password_hash: '$2a$10$placeholder' },
      { email: 'ops1@surplusflow.com', name: 'Jane Operations', role: 'ops', password_hash: '$2a$10$placeholder' },
      { email: 'compliance@surplusflow.com', name: 'Carlos Compliance', role: 'compliance', password_hash: '$2a$10$placeholder' },
      { email: 'attorney@lawfirm.com', name: 'Sarah Attorney', role: 'attorney', password_hash: '$2a$10$placeholder' },
      { email: 'john.doe@email.com', name: 'John Doe', role: 'claimant', password_hash: null },
    ];

    const userIds = [];
    for (const u of users) {
      const res = await client.query(
        `INSERT INTO users (email, full_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
        [u.email, u.name, u.role, u.password_hash]
      );
      userIds.push(res.rows[0].id);
    }

    // --- Jurisdiction Rules ---
    const rules = [
      {
        jurisdiction_key: 'CA', state: 'CA', source_type: 'unclaimed_property',
        effective_date: '2024-01-01', max_fee_percent: 10, cooling_off_days: 3,
        notarization_required: false, assignment_allowed: false, license_required: false,
        bond_required: false, solicitation_restricted: true, solicitation_window_days: 30,
        required_disclosures: JSON.stringify(['free_filing_disclosure', 'fee_disclosure', 'rescission_disclosure']),
        judicial_filing_required: false, statute_reference: 'CA CCP §1501-1599',
        verification_status: 'UNVERIFIED', notes: 'REQUIRES LEGAL VERIFICATION',
      },
      {
        jurisdiction_key: 'FL', state: 'FL', source_type: 'foreclosure_surplus',
        effective_date: '2024-01-01', max_fee_percent: 10, cooling_off_days: 3,
        notarization_required: true, assignment_allowed: false, license_required: false,
        bond_required: false, solicitation_restricted: true, solicitation_window_days: 45,
        required_disclosures: JSON.stringify(['free_filing_disclosure', 'fee_disclosure', 'rescission_disclosure', 'no_legal_advice']),
        judicial_filing_required: true, statute_reference: 'FL Stat §45.033',
        verification_status: 'UNVERIFIED', notes: 'REQUIRES LEGAL VERIFICATION',
      },
      {
        jurisdiction_key: 'TX', state: 'TX', source_type: 'tax_sale_surplus',
        effective_date: '2024-01-01', max_fee_percent: 33, cooling_off_days: 0,
        notarization_required: false, assignment_allowed: true, license_required: false,
        bond_required: false, solicitation_restricted: false, solicitation_window_days: null,
        required_disclosures: JSON.stringify(['fee_disclosure']),
        judicial_filing_required: false, statute_reference: 'TX Tax Code §34.04',
        verification_status: 'UNVERIFIED', notes: 'REQUIRES LEGAL VERIFICATION',
      },
    ];

    for (const r of rules) {
      await client.query(
        `INSERT INTO jurisdiction_rules (jurisdiction_key, state, source_type, effective_date, max_fee_percent, cooling_off_days, notarization_required, assignment_allowed, license_required, bond_required, solicitation_restricted, solicitation_window_days, required_disclosures, judicial_filing_required, statute_reference, verification_status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [r.jurisdiction_key, r.state, r.source_type, r.effective_date, r.max_fee_percent, r.cooling_off_days, r.notarization_required, r.assignment_allowed, r.license_required, r.bond_required, r.solicitation_restricted, r.solicitation_window_days, r.required_disclosures, r.judicial_filing_required, r.statute_reference, r.verification_status, r.notes]
      );
    }

    // --- Sample Opportunities ---
    const opps = [
      {
        source_type: 'unclaimed_property', state: 'CA', jurisdiction_key: 'CA',
        reported_amount: 4500.00, owner_name: 'John Doe', holder_name: 'State of California',
        property_description: 'Unclaimed bank account funds', status: 'new',
      },
      {
        source_type: 'foreclosure_surplus', state: 'FL', jurisdiction_key: 'FL',
        reported_amount: 28000.00, owner_name: 'Jane Smith', county: 'MIAMI_DADE',
        property_description: 'Foreclosure surplus from property sale', status: 'new',
        parcel_number: '30-2121-001-0100',
      },
      {
        source_type: 'tax_sale_surplus', state: 'TX', jurisdiction_key: 'TX',
        reported_amount: 12000.00, owner_name: 'Robert Johnson',
        property_description: 'Tax sale surplus - residential property', status: 'new',
        parcel_number: 'R000012345',
      },
    ];

    for (const o of opps) {
      await client.query(
        `INSERT INTO opportunities (source_type, state, jurisdiction_key, reported_amount, owner_name, holder_name, property_description, status, county, parcel_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.source_type, o.state, o.jurisdiction_key, o.reported_amount, o.owner_name, (o as any).holder_name || null, o.property_description, o.status, (o as any).county || null, (o as any).parcel_number || null]
      );
    }

    // --- Sample Claimant ---
    await client.query(
      `INSERT INTO claimants (user_id, first_name, last_name, email, phone, address_line1, city, state, zip)
       VALUES ($1, 'John', 'Doe', 'john.doe@email.com', '+15551234567', '123 Main St', 'Los Angeles', 'CA', '90001')`,
      [userIds[4]]
    );

    await client.query('COMMIT');
    console.log('Seed data inserted successfully!');
    console.log(`  Users: ${users.length}`);
    console.log(`  Rules: ${rules.length}`);
    console.log(`  Opportunities: ${opps.length}`);
    console.log(`  Claimants: 1`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
