# SurplusFlow AI

**Compliance-first surplus recovery platform** for unclaimed property and foreclosure/tax-sale surplus opportunities.

## Quick Start

```bash
# 1. Start infrastructure
npm run docker:up

# 2. Install dependencies
npm install

# 3. Run migrations
npm run db:migrate

# 4. Seed example data
npm run db:seed

# 5. Start services (in separate terminals)
npm run dev:api      # API on :3001
npm run dev:worker   # BullMQ worker
npm run dev:admin    # Admin dashboard on :3000
npm run dev:portal   # Claimant portal on :3002
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical specification.
See [SECURITY.md](./SECURITY.md) for threat model, security controls, and monitoring.

## Monorepo Structure

```
surplusflow-ai/
├── apps/
│   ├── api/            # Fastify REST API + JWT auth
│   ├── worker/         # BullMQ job processors
│   ├── admin-web/      # Next.js admin dashboard
│   └── portal-web/     # Next.js claimant portal
├── packages/
│   ├── shared/         # Types, validation, utils, constants
│   ├── rules/          # Jurisdiction rule engine + tests
│   ├── contracts/      # Template engine + contract/outreach templates
│   └── audit/          # Append-only audit writer
├── infra/
│   ├── docker/         # Docker Compose (Postgres, Redis, MinIO)
│   ├── migrations/     # SQL schema migrations
│   ├── scripts/        # Seed scripts
│   └── monitoring/     # Alert definitions
└── .github/workflows/  # CI pipeline
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Start Postgres, Redis, MinIO |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Insert example data |
| `npm run test:rules` | Run rule engine test suite |
| `npm run build` | Build all packages |
| `npm run typecheck` | TypeScript type checking |

## Non-Negotiables

- **Compliance-first**: Jurisdiction rules enforced by rule engine
- **No legal advice**: Attorney Review routed when needed
- **Data security**: SSN encrypted (AES-256-GCM), docs encrypted at rest, RBAC on all endpoints
- **Funds flow**: Claimant receives funds directly; platform invoices success fee after payout
- **Auditability**: Append-only audit log with tamper-detection chain
- **Versioning**: Contracts and disclosures versioned by jurisdiction

## License

Proprietary — All rights reserved.
