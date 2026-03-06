# SurplusFlow-AI Frontend Build Design

## Overview
Build full admin dashboard and claimant portal UI for the SurplusFlow-AI surplus recovery platform. The Fastify API (40+ endpoints, 11 modules) is complete and deployed. Both Next.js 14 apps are empty shells.

## Stack
- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS 3.4 + shadcn/ui components
- SWR for client-side data fetching
- lucide-react for icons
- JWT auth with refresh token rotation

## Admin Dashboard Pages
1. `/login` — Email + password, redirect to `/dashboard`
2. `/dashboard` — Stats cards (total cases, active, pending outreach, recovered, revenue), recent cases table, alerts
3. `/cases` — Filterable/paginated table, status badges, create dialog -> `/cases/[id]` detail (timeline, notes, documents, status transitions, assign)
4. `/opportunities` — Search/filter table, CSV import, trigger scrape, convert to case
5. `/documents` — Browse by case, upload (base64), download via presigned URL
6. `/outreach` — Templates list, queue outreach per case, history, suppression list management
7. `/billing` — Invoices table, generate from case, send, mark paid/waive
8. `/compliance` — Rules list with state filter, evaluate rule, verify, import CSV, export matrix
9. `/attorneys` — Attorney user list, case assignment
10. `/audit` — Filterable log (event type, actor, date range), chain verification, JSON export
11. `/settings` — User management CRUD (admin only)

## Portal Pages
1. `/login` — Claimant login
2. `/cases` — My cases list -> `/cases/[id]` detail with status timeline
3. `/cases/[id]/documents` — Upload documents
4. `/invoices` — View invoices

## API Integration
- Base URL: `/api/v1` (proxied via Next.js rewrites to Fastify)
- Auth: JWT in localStorage, refresh via `/auth/refresh`
- API client: thin fetch wrapper with token injection + SWR hooks

## Shared Components
- DataTable (sortable, filterable, paginated)
- StatusBadge (color-coded by case/invoice/opportunity status)
- PageHeader (title + action buttons)
- EmptyState, LoadingSpinner, ErrorBoundary
- Dialog, Sheet for create/edit forms

## Implementation Phases
1. Foundation (shadcn, auth, API client, layout)
2. Cases (list + detail + create)
3. Dashboard (stats overview)
4. Opportunities (list + import)
5. Documents + Outreach
6. Billing + Compliance
7. Attorneys + Audit + Settings
8. Portal (all pages)
