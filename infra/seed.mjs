#!/usr/bin/env node
// ============================================================
// SurplusFlow AI — Database Seed Script
// Seeds admin + ops users with bcrypt password hashes
// Usage: node infra/seed.mjs
// ============================================================

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sfuser:sfpass_local_dev@localhost:5432/surplusflow';

const USERS = [
  { email: 'admin@surplusflow.com', password: 'SurplusFlow2026!', role: 'super_admin', fullName: 'System Admin' },
  { email: 'ops@surplusflow.com', password: 'SurplusFlow2026!', role: 'ops', fullName: 'Ops Manager' },
  { email: 'ops1@surplusflow.com', password: 'SurplusFlow2026!', role: 'ops', fullName: 'Sarah Chen' },
  { email: 'compliance@surplusflow.com', password: 'SurplusFlow2026!', role: 'compliance', fullName: 'Michael Torres' },
  { email: 'attorney@lawfirm.com', password: 'SurplusFlow2026!', role: 'attorney', fullName: 'Rachel Greene, Esq.' },
  { email: 'john.doe@email.com', password: 'ClaimantDemo2026!', role: 'claimant', fullName: 'John Doe' },
];

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Run migrations first
    console.log('Running migrations...');
    const migrationSql = readFileSync(join(__dirname, 'migrations/001_core_schema.sql'), 'utf8');
    await client.query(migrationSql);
    console.log('Migrations complete.');

    // Seed users
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 12);
      await client.query(
        `INSERT INTO users (email, full_name, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           updated_at = NOW()`,
        [u.email, u.fullName, u.role, hash],
      );
      console.log(`Seeded user: ${u.email} (${u.role})`);
    }

    console.log('Seed complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
