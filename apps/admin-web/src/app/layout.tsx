// ============================================================
// SurplusFlow AI — Admin Dashboard Layout
// /apps/admin-web/src/app/layout.tsx
// ============================================================

import React from 'react';

export const metadata = {
  title: 'SurplusFlow Admin',
  description: 'Surplus Recovery Management Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar Navigation */}
          <aside className="w-64 bg-slate-900 text-white flex flex-col">
            <div className="p-6 border-b border-slate-700">
              <h1 className="text-xl font-bold tracking-tight">SurplusFlow</h1>
              <p className="text-xs text-slate-400 mt-1">Recovery Management</p>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              <NavLink href="/dashboard" icon="📊">Dashboard</NavLink>
              <NavLink href="/opportunities" icon="🔍">Opportunities</NavLink>
              <NavLink href="/cases" icon="📁">Cases</NavLink>
              <NavLink href="/outreach" icon="📬">Outreach</NavLink>
              <NavLink href="/documents" icon="📄">Documents</NavLink>
              <NavLink href="/compliance" icon="⚖️">Compliance</NavLink>
              <NavLink href="/billing" icon="💰">Billing</NavLink>
              <NavLink href="/attorneys" icon="👨‍⚖️">Attorneys</NavLink>
              <NavLink href="/audit" icon="🔒">Audit Log</NavLink>
              <NavLink href="/settings" icon="⚙️">Settings</NavLink>
            </nav>
            <div className="p-4 border-t border-slate-700">
              <div className="text-sm text-slate-400">Logged in as</div>
              <div className="text-sm font-medium">admin@surplusflow.com</div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
              <div></div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">🔴 3 items need attention</span>
                <button className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded">Notifications</button>
              </div>
            </header>
            <div className="p-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  return (
    <a href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-sm">
      <span>{icon}</span>
      <span>{children}</span>
    </a>
  );
}
