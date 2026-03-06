"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  FolderOpen,
  Send,
  FileText,
  Shield,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Search },
  { href: "/cases", label: "Cases", icon: FolderOpen },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/compliance", label: "Compliance", icon: Shield },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/attorneys", label: "Attorneys", icon: Scale },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
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

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-slate-800 text-white font-medium"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        {user && (
          <div className="mb-3">
            <div className="text-xs text-slate-400">Logged in as</div>
            <div className="text-sm font-medium truncate">{user.email}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role}</div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
