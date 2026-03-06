"use client";

import { AuthProvider } from "@/lib/auth";
import { SWRProvider } from "@/lib/swr";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SWRProvider>{children}</SWRProvider>
    </AuthProvider>
  );
}
