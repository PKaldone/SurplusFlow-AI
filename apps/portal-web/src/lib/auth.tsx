"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch, setTokens, clearTokens, getAccessToken } from "@/lib/api";

interface User {
  sub: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  requestMagicLink: (email: string) => Promise<{ message: string }>;
  verifyMagicLink: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseJwtPayload(token: string): User | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return { sub: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      const parsed = parseJwtPayload(token);
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setTokens(data.accessToken, data.refreshToken);
    const parsed = parseJwtPayload(data.accessToken);
    setUser(parsed);
  }, []);

  const requestMagicLink = useCallback(async (email: string) => {
    const data = await apiFetch<{ message: string }>(
      "/api/v1/auth/magic-link",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    );
    return data;
  }, []);

  const verifyMagicLink = useCallback(async (token: string) => {
    const data = await apiFetch<{ accessToken: string; refreshToken: string }>(
      "/api/v1/auth/magic-link/verify",
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
    );
    setTokens(data.accessToken, data.refreshToken);
    const parsed = parseJwtPayload(data.accessToken);
    setUser(parsed);
  }, []);

  const logout = useCallback(() => {
    apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    clearTokens();
    setUser(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        loginWithPassword,
        requestMagicLink,
        verifyMagicLink,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
