# SurplusFlow-AI Frontend Build — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build complete admin dashboard and claimant portal UI for the SurplusFlow-AI surplus recovery platform.

**Architecture:** Next.js 14 App Router with client-side data fetching (SWR) against the Fastify API at `/api/v1/*`. JWT auth with refresh token rotation. shadcn/ui components on Tailwind CSS. Each page is a client component that calls the API via a shared fetch wrapper.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS 3.4, shadcn/ui, SWR, lucide-react, JWT

**Working Directory:** `/tmp/SurplusFlow-AI`

**API Base:** Routes mounted at `/api/v1/{module}` on Fastify (port 3001/3201). Login returns `{ accessToken, refreshToken, expiresIn }`. Auth via `Authorization: Bearer <token>` header.

---

## Phase 1: Foundation (Tasks 1-5)

### Task 1: Tailwind + shadcn/ui Setup for admin-web

**Files:**
- Create: `apps/admin-web/tailwind.config.ts`
- Create: `apps/admin-web/postcss.config.js`
- Create: `apps/admin-web/src/app/globals.css`
- Modify: `apps/admin-web/src/app/layout.tsx`
- Create: `apps/admin-web/components.json`

**Step 1: Install shadcn/ui + deps**

```bash
cd /tmp/SurplusFlow-AI/apps/admin-web
npx shadcn@latest init --defaults --style default --base-color slate --css-variables true
```

If interactive prompts block, create files manually:

`tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

`postcss.config.js`:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}
```

**Step 2: Install required npm deps**

```bash
cd /tmp/SurplusFlow-AI
npm install --workspace=@surplusflow/admin-web swr clsx tailwind-merge class-variance-authority tailwindcss-animate @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-separator @radix-ui/react-label @radix-ui/react-tooltip
```

**Step 3: Update layout.tsx to import globals.css**

Replace the entire `apps/admin-web/src/app/layout.tsx` with the new layout (done in Task 3).

**Step 4: Commit**

```bash
git add apps/admin-web/
git commit -m "feat(admin): initialize Tailwind + shadcn/ui foundation"
```

---

### Task 2: API Client + Auth Context

**Files:**
- Create: `apps/admin-web/src/lib/api.ts`
- Create: `apps/admin-web/src/lib/auth.tsx`
- Create: `apps/admin-web/src/lib/utils.ts`
- Create: `apps/admin-web/src/lib/swr.tsx`

**Step 1: Create utility function**

`apps/admin-web/src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2: Create API client**

`apps/admin-web/src/lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface TokenStore {
  accessToken: string | null;
  refreshToken: string | null;
}

const tokens: TokenStore = { accessToken: null, refreshToken: null };

export function setTokens(access: string, refresh: string) {
  tokens.accessToken = access;
  tokens.refreshToken = refresh;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sf_access_token', access);
    localStorage.setItem('sf_refresh_token', refresh);
  }
}

export function getAccessToken(): string | null {
  if (tokens.accessToken) return tokens.accessToken;
  if (typeof window !== 'undefined') {
    tokens.accessToken = localStorage.getItem('sf_access_token');
    return tokens.accessToken;
  }
  return null;
}

export function clearTokens() {
  tokens.accessToken = null;
  tokens.refreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sf_access_token');
    localStorage.removeItem('sf_refresh_token');
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refreshToken || localStorage.getItem('sf_refresh_token');
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refresh}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message || 'Request failed', body);
  }

  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return res as unknown as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

**Step 3: Create auth context**

`apps/admin-web/src/lib/auth.tsx`:
```typescript
'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, setTokens, getAccessToken, clearTokens } from './api';

interface User {
  sub: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ sub: payload.sub, email: payload.email, role: payload.role });
      } catch {
        clearTokens();
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    setUser({ sub: payload.sub, email: payload.email, role: payload.role });
  }, []);

  const logout = useCallback(() => {
    apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    clearTokens();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

**Step 4: Create SWR provider**

`apps/admin-web/src/lib/swr.tsx`:
```typescript
'use client';
import React from 'react';
import { SWRConfig } from 'swr';
import { apiFetch } from './api';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: (url: string) => apiFetch(url),
      revalidateOnFocus: false,
      errorRetryCount: 2,
    }}>
      {children}
    </SWRConfig>
  );
}
```

**Step 5: Commit**

```bash
git add apps/admin-web/src/lib/
git commit -m "feat(admin): add API client, auth context, and SWR provider"
```

---

### Task 3: Shared UI Components

**Files:**
- Create: `apps/admin-web/src/components/ui/button.tsx`
- Create: `apps/admin-web/src/components/ui/badge.tsx`
- Create: `apps/admin-web/src/components/ui/input.tsx`
- Create: `apps/admin-web/src/components/ui/label.tsx`
- Create: `apps/admin-web/src/components/ui/select.tsx`
- Create: `apps/admin-web/src/components/ui/dialog.tsx`
- Create: `apps/admin-web/src/components/ui/table.tsx`
- Create: `apps/admin-web/src/components/ui/card.tsx`
- Create: `apps/admin-web/src/components/ui/tabs.tsx`
- Create: `apps/admin-web/src/components/ui/separator.tsx`
- Create: `apps/admin-web/src/components/ui/textarea.tsx`
- Create: `apps/admin-web/src/components/ui/dropdown-menu.tsx`
- Create: `apps/admin-web/src/components/ui/tooltip.tsx`

**Step 1: Install shadcn components via CLI or manually copy**

Preferred method:
```bash
cd /tmp/SurplusFlow-AI/apps/admin-web
npx shadcn@latest add button badge input label select dialog table card tabs separator textarea dropdown-menu tooltip --yes
```

If CLI fails, create each file manually with standard shadcn/ui component code.

**Step 2: Create shared layout components**

Create: `apps/admin-web/src/components/page-header.tsx`:
```typescript
import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // action buttons
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

Create: `apps/admin-web/src/components/status-badge.tsx`:
```typescript
import React from 'react';
import { Badge } from './ui/badge';

const STATUS_VARIANTS: Record<string, string> = {
  // Case statuses
  OPPORTUNITY_IDENTIFIED: 'bg-gray-100 text-gray-700 border-gray-200',
  OUTREACH_PENDING: 'bg-blue-50 text-blue-700 border-blue-200',
  OUTREACH_SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  OUTREACH_RESPONDED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  CLAIMANT_ENROLLED: 'bg-purple-100 text-purple-700 border-purple-200',
  DOCS_COLLECTING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  COMPLIANCE_REVIEW: 'bg-orange-50 text-orange-700 border-orange-200',
  NEEDS_LEGAL_REVIEW: 'bg-orange-100 text-orange-700 border-orange-200',
  CLAIM_READY: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  CLAIM_FILED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  CLAIM_PROCESSING: 'bg-teal-100 text-teal-700 border-teal-200',
  PAYOUT_RECEIVED: 'bg-green-100 text-green-700 border-green-200',
  FEE_COLLECTED: 'bg-green-200 text-green-800 border-green-300',
  CLOSED_COMPLETE: 'bg-green-50 text-green-700 border-green-200',
  CLOSED_NO_RESPONSE: 'bg-gray-100 text-gray-500 border-gray-200',
  CLOSED_DENIED: 'bg-red-100 text-red-700 border-red-200',
  CLAIM_DENIED: 'bg-red-100 text-red-700 border-red-200',
  CLOSED_CLAIMANT_WITHDREW: 'bg-amber-100 text-amber-700 border-amber-200',
  CLOSED_DUPLICATE: 'bg-gray-100 text-gray-500 border-gray-200',
  CLOSED_INELIGIBLE: 'bg-red-50 text-red-600 border-red-200',
  // Invoice statuses
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  paid: 'bg-green-100 text-green-700 border-green-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  waived: 'bg-gray-100 text-gray-500 border-gray-200',
  // Opportunity statuses
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  matched: 'bg-purple-100 text-purple-700 border-purple-200',
  case_created: 'bg-green-100 text-green-700 border-green-200',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <Badge variant="outline" className={`${variant} text-xs font-medium border`}>
      {label}
    </Badge>
  );
}
```

Create: `apps/admin-web/src/components/data-table.tsx`:
```typescript
'use client';
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  totalCount?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, totalCount, page = 1, limit = 25,
  onPageChange, onRowClick, loading, emptyMessage = 'No data found',
}: DataTableProps<T>) {
  const totalPages = totalCount ? Math.ceil(totalCount / limit) : 1;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map(col => (
              <TableHead key={col.key} className={col.className}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={(row as Record<string, unknown>).id as string || i}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalCount && totalCount > limit && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Create: `apps/admin-web/src/components/loading.tsx`:
```typescript
import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/admin-web/src/components/
git commit -m "feat(admin): add shadcn/ui components and shared DataTable, StatusBadge, PageHeader"
```

---

### Task 4: App Layout + Navigation

**Files:**
- Rewrite: `apps/admin-web/src/app/layout.tsx`
- Create: `apps/admin-web/src/components/sidebar.tsx`
- Create: `apps/admin-web/src/components/top-bar.tsx`
- Modify: `apps/admin-web/src/app/page.tsx`

**Step 1: Create sidebar**

`apps/admin-web/src/components/sidebar.tsx`:
```typescript
'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Search, FolderOpen, Send, FileText,
  Shield, Receipt, Scale, ScrollText, Settings, LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/opportunities', label: 'Opportunities', icon: Search },
  { href: '/cases', label: 'Cases', icon: FolderOpen },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/compliance', label: 'Compliance', icon: Shield },
  { href: '/billing', label: 'Billing', icon: Receipt },
  { href: '/attorneys', label: 'Attorneys', icon: Scale },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">SurplusFlow</h1>
        <p className="text-xs text-slate-400 mt-1">Recovery Management</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                active ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-400 truncate">{user?.email || 'Not logged in'}</div>
        <div className="text-xs text-slate-500 capitalize">{user?.role}</div>
        <button
          onClick={logout}
          className="flex items-center gap-2 mt-2 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </aside>
  );
}
```

**Step 2: Create top bar**

`apps/admin-web/src/components/top-bar.tsx`:
```typescript
'use client';
import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';

export function TopBar() {
  return (
    <header className="h-14 bg-white border-b px-6 flex items-center justify-between shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
```

**Step 3: Rewrite root layout**

Replace `apps/admin-web/src/app/layout.tsx` entirely:
```typescript
import React from 'react';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { SWRProvider } from '@/lib/swr';

export const metadata = {
  title: 'SurplusFlow Admin',
  description: 'Surplus Recovery Management Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">
        <AuthProvider>
          <SWRProvider>
            {children}
          </SWRProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

**Step 4: Create authenticated layout wrapper**

Create: `apps/admin-web/src/app/(dashboard)/layout.tsx`:
```typescript
'use client';
import React from 'react';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LoadingPage } from '@/components/loading';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  if (loading) return <LoadingPage />;
  if (!isAuthenticated) {
    router.push('/login');
    return <LoadingPage />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Step 5: Move pages into (dashboard) group**

- Move `apps/admin-web/src/app/cases/` → `apps/admin-web/src/app/(dashboard)/cases/`
- Update `apps/admin-web/src/app/page.tsx` to redirect to `/dashboard`

**Step 6: Commit**

```bash
git add apps/admin-web/
git commit -m "feat(admin): add sidebar navigation, auth-protected layout, and top bar"
```

---

### Task 5: Login Page

**Files:**
- Create: `apps/admin-web/src/app/login/page.tsx`

**Step 1: Create login page**

`apps/admin-web/src/app/login/page.tsx`:
```typescript
'use client';
import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">SurplusFlow</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@surplusflow.com" required autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password" required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/admin-web/src/app/login/
git commit -m "feat(admin): add login page"
```

---

## Phase 2: Cases Module (Tasks 6-8)

### Task 6: Cases List Page (Wired to API)

**Files:**
- Rewrite: `apps/admin-web/src/app/(dashboard)/cases/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-cases.ts`

**Step 1: Create SWR hook**

`apps/admin-web/src/lib/hooks/use-cases.ts`:
```typescript
import useSWR from 'swr';

interface CaseFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export function useCases(filters: CaseFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR(`/api/v1/cases?${params}`);
  return { cases: data?.data || [], total: data?.total || 0, error, isLoading, mutate };
}

export function useCase(id: string) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/v1/cases/${id}` : null);
  return { caseData: data, error, isLoading, mutate };
}

export function useCaseTimeline(id: string) {
  const { data, error, isLoading } = useSWR(id ? `/api/v1/cases/${id}/timeline` : null);
  return { timeline: data || [], error, isLoading };
}
```

**Step 2: Rewrite cases list page**

Replace `apps/admin-web/src/app/(dashboard)/cases/page.tsx` with a full implementation using `DataTable`, `StatusBadge`, `PageHeader`, `useCases` hook, status filter select, search input, "New Case" button (dialog placeholder), pagination via `onPageChange`, and router.push to `/cases/[id]` on row click.

The columns should be: Case #, Claimant, State, Type, Amount (formatted), Status (StatusBadge), Assigned, and a View link.

**Step 3: Commit**

```bash
git commit -m "feat(admin): wire cases list page to API with filters and pagination"
```

---

### Task 7: Case Detail Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/cases/[id]/page.tsx`

**Step 1: Build case detail page**

This page should show:
- Case header (case number, status badge, amount)
- Info grid (claimant, state, source type, assigned ops, attorney, fee %)
- Action buttons: Transition status (`PATCH /cases/:id/status`), Assign (`PATCH /cases/:id/assign`), Flag legal review (`POST /cases/:id/flag-legal-review`)
- Tabs: Timeline, Notes, Documents
  - Timeline tab: Chronological list from `GET /cases/:id/timeline`
  - Notes tab: List + add note form (`POST /cases/:id/notes`)
  - Documents tab: Upload form + list (`POST /cases/:id/documents`, uses base64 encoding)

Uses `useCase(id)` and `useCaseTimeline(id)` hooks.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add case detail page with timeline, notes, and documents"
```

---

### Task 8: Create Case Dialog

**Files:**
- Create: `apps/admin-web/src/components/create-case-dialog.tsx`
- Modify: `apps/admin-web/src/app/(dashboard)/cases/page.tsx` (wire dialog to "New Case" button)

**Step 1: Build create case dialog**

Form fields: opportunityId (text/search), assignedOpsId (select), feePercent (number 0-100), feeCap (number), notes (textarea).
Submit: `POST /api/v1/cases` with body, then `mutate()` on success.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add create case dialog"
```

---

## Phase 3: Dashboard Overview (Task 9)

### Task 9: Dashboard Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-dashboard.ts`

**Step 1: Create dashboard hook**

```typescript
import useSWR from 'swr';

export function useDashboard() {
  const { data, error, isLoading } = useSWR('/api/v1/admin/dashboard');
  return { stats: data, error, isLoading };
}
```

**Step 2: Build dashboard page**

- Stats cards row: Total Cases, Active Cases, Pending Outreach, Filed Claims, Total Recovered ($), Revenue ($)
- Each card: icon, label, large number, colored background
- Recent cases table (reuse DataTable, limit 5)
- Quick action buttons (New Case, Import Opportunities, View Compliance)

**Step 3: Commit**

```bash
git commit -m "feat(admin): add dashboard overview with stats cards"
```

---

## Phase 4: Opportunities (Tasks 10-11)

### Task 10: Opportunities List Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/opportunities/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-opportunities.ts`

SWR hook with filters (state, sourceType, status, minAmount, maxAmount, page, limit).
DataTable with columns: Owner, State, County, Type, Amount, Status, Ingested date, Actions.
Action buttons: Import CSV, Trigger Scrape.
Row click → detail view or "Convert to Case" action.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add opportunities list with filters and import"
```

---

### Task 11: Opportunity Import + Convert to Case

**Files:**
- Create: `apps/admin-web/src/components/import-csv-dialog.tsx`
- Create: `apps/admin-web/src/components/convert-to-case-dialog.tsx`

Import CSV dialog: textarea for CSV paste or file input, `POST /api/v1/opportunities/import`.
Convert dialog: Select opportunity, set fee %, assign ops, `POST /api/v1/cases` with opportunityId.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add CSV import and convert-to-case dialogs"
```

---

## Phase 5: Documents + Outreach (Tasks 12-14)

### Task 12: Documents Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/documents/page.tsx`

Browse documents by case. File upload (convert to base64 via FileReader, POST to `/api/v1/cases/:id/documents`). Download link via `/api/v1/documents/:id/download`. Delete button (admin only).

**Step 2: Commit**

```bash
git commit -m "feat(admin): add documents management page"
```

---

### Task 13: Outreach Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/outreach/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-outreach.ts`

Tabs: Templates | Queue Outreach | Suppression List.
- Templates tab: List from `GET /api/v1/outreach/templates`
- Queue tab: Select case + channel + template, `POST /api/v1/outreach/cases/:id/queue`. Show history via `GET /api/v1/outreach/cases/:id/history`.
- Suppression tab: List `GET /api/v1/outreach/suppression`, add form `POST /api/v1/outreach/suppression`.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add outreach page with templates, queue, and suppression"
```

---

### Task 14: Outreach Approve + History

Enhance outreach page with:
- Approve button on pending records: `PATCH /api/v1/outreach/cases/:id/approve`
- History view per case with delivery status badges

**Step 2: Commit**

```bash
git commit -m "feat(admin): add outreach approval and history views"
```

---

## Phase 6: Billing + Compliance (Tasks 15-17)

### Task 15: Billing Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/billing/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-billing.ts`

Invoices table with status filter. Actions: Generate from case (`POST /api/v1/billing/cases/:id/generate`), Send (`POST /api/v1/billing/:id/send`), Mark Paid (`PATCH /api/v1/billing/:id/mark-paid`), Waive (`PATCH /api/v1/billing/:id/waive`).

**Step 2: Commit**

```bash
git commit -m "feat(admin): add billing/invoices management page"
```

---

### Task 16: Compliance / Rules Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/compliance/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-compliance.ts`

Tabs: Rules Matrix | Evaluate | Import.
- Rules list with state filter, verification status badge
- Evaluate form: state, county, sourceType, feePercent, amount → `POST /api/v1/rules/evaluate` → show result (ALLOWED/BLOCKED/CONSTRAINED)
- Import CSV: `POST /api/v1/rules/import`
- Export: `GET /api/v1/rules/matrix/export` (download CSV)
- Verify rule: `PATCH /api/v1/rules/:id/verify` with evidence text

**Step 2: Commit**

```bash
git commit -m "feat(admin): add compliance rules page with evaluate and import"
```

---

### Task 17: Rule Detail + Edit

**Files:**
- Create: `apps/admin-web/src/components/rule-detail-dialog.tsx`

View rule details, edit rule (`PATCH /api/v1/rules/:id`), verify with evidence.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add rule detail and edit dialog"
```

---

## Phase 7: Attorneys + Audit + Settings (Tasks 18-20)

### Task 18: Attorneys Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/attorneys/page.tsx`

Attorney user list (filtered from `GET /api/v1/admin/users?role=attorney`). Case assignment view.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add attorneys management page"
```

---

### Task 19: Audit Log Page

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/audit/page.tsx`
- Create: `apps/admin-web/src/lib/hooks/use-audit.ts`

Filterable log: eventType select, actorId, dateFrom/dateTo pickers, paginated table.
Chain verification button: `GET /api/v1/audit/verify-chain` → show integrity status.
Export button: `GET /api/v1/audit/export` → download JSON.

**Step 2: Commit**

```bash
git commit -m "feat(admin): add audit log viewer with filters and chain verification"
```

---

### Task 20: Settings / User Management

**Files:**
- Create: `apps/admin-web/src/app/(dashboard)/settings/page.tsx`
- Create: `apps/admin-web/src/components/create-user-dialog.tsx`

User list (`GET /api/v1/admin/users`), role filter, create user (`POST /api/v1/admin/users`), toggle active (`PATCH /api/v1/admin/users/:id`).

**Step 2: Commit**

```bash
git commit -m "feat(admin): add settings page with user management"
```

---

## Phase 8: Claimant Portal (Tasks 21-24)

### Task 21: Portal Foundation

**Files:**
- Setup Tailwind + shadcn/ui for `apps/portal-web/` (same as Task 1)
- Create: `apps/portal-web/src/lib/api.ts` (copy from admin, change API_URL)
- Create: `apps/portal-web/src/lib/auth.tsx`
- Create: `apps/portal-web/src/lib/swr.tsx`
- Create: `apps/portal-web/src/lib/utils.ts`
- Rewrite: `apps/portal-web/src/app/layout.tsx`
- Create: `apps/portal-web/src/app/login/page.tsx` (magic link login)
- Create: `apps/portal-web/src/components/portal-nav.tsx`

Portal nav: simpler than admin — My Cases, My Documents, Invoices, Sign Out.
Login uses magic link flow: `POST /api/v1/auth/magic-link` → `POST /api/v1/auth/magic-link/verify`.

**Step 2: Commit**

```bash
git commit -m "feat(portal): initialize portal foundation with auth and layout"
```

---

### Task 22: Portal — My Cases

**Files:**
- Create: `apps/portal-web/src/app/(portal)/cases/page.tsx`
- Create: `apps/portal-web/src/app/(portal)/cases/[id]/page.tsx`
- Create: `apps/portal-web/src/app/(portal)/layout.tsx`

List: `GET /api/v1/portal/my-cases` — simple card-based layout showing case number, status, amount.
Detail: `GET /api/v1/portal/my-cases/:id` — status timeline, sign contract button (`POST /api/v1/portal/my-cases/:id/sign-contract`), rescind button (`POST /api/v1/portal/my-cases/:id/rescind`).

**Step 2: Commit**

```bash
git commit -m "feat(portal): add my cases list and detail pages"
```

---

### Task 23: Portal — Document Upload

**Files:**
- Create: `apps/portal-web/src/app/(portal)/cases/[id]/documents/page.tsx`

Upload form (docType select, file input → base64 → `POST /api/v1/portal/my-cases/:id/documents`). List existing documents with download links.

**Step 2: Commit**

```bash
git commit -m "feat(portal): add document upload page"
```

---

### Task 24: Portal — Invoices

**Files:**
- Create: `apps/portal-web/src/app/(portal)/invoices/page.tsx`

Simple list: `GET /api/v1/portal/my-invoices` — card or table with invoice number, amount, due date, status badge.

**Step 2: Commit**

```bash
git commit -m "feat(portal): add invoices page"
```

---

## Phase 9: Next.js Rewrites + Build Verification (Task 25)

### Task 25: API Proxy + Build + Deploy

**Files:**
- Modify: `apps/admin-web/next.config.js` (add rewrites)
- Modify: `apps/portal-web/next.config.js` (add rewrites)
- Verify: `npm run build --workspace=@surplusflow/admin-web`
- Verify: `npm run build --workspace=@surplusflow/portal-web`

Add to both `next.config.js`:
```js
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: `${process.env.API_URL || 'http://localhost:3001'}/api/:path*`,
    },
  ];
},
```

Run builds, fix any TypeScript/build errors, commit, push.

**Step 2: Commit**

```bash
git commit -m "feat: add API proxy rewrites and verify production builds"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1. Foundation | 1-5 | Tailwind, shadcn, auth, layout, login |
| 2. Cases | 6-8 | Cases CRUD with API integration |
| 3. Dashboard | 9 | Stats overview page |
| 4. Opportunities | 10-11 | List, import CSV, convert to case |
| 5. Docs + Outreach | 12-14 | Upload/download, templates, suppression |
| 6. Billing + Compliance | 15-17 | Invoices, rules matrix, evaluate |
| 7. Admin | 18-20 | Attorneys, audit log, user management |
| 8. Portal | 21-24 | Claimant cases, docs, invoices |
| 9. Build | 25 | API proxy, build verification |

**Total: 25 tasks across 9 phases.**
