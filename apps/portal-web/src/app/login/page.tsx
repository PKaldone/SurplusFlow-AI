"use client";

import { Suspense, useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Mail, CheckCircle } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);

  const { loginWithPassword, requestMagicLink, verifyMagicLink, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-verify magic link token from URL
  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setVerifyingToken(true);
      setError("");
      verifyMagicLink(token)
        .then(() => {
          router.push("/cases");
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Invalid or expired link. Please request a new one.";
          setError(message);
          setVerifyingToken(false);
        });
    }
  }, [searchParams, verifyMagicLink, router]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/cases");
    }
  }, [isAuthenticated, router]);

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginWithPassword(email, password);
      router.push("/cases");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed. Please check your credentials.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await requestMagicLink(magicEmail);
      setMagicLinkSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not send login link. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (verifyingToken) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your login link...</p>
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive w-full text-center">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold">SurplusFlow</CardTitle>
        <CardDescription className="text-base">
          Welcome to the Claimant Portal
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-4">
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
            {error}
          </div>
        )}

        <Tabs defaultValue="magic-link" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magic-link">Email Link</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>

          {/* Magic Link Tab */}
          <TabsContent value="magic-link">
            {magicLinkSent ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Check your email</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We sent a login link to <strong>{magicEmail}</strong>.
                    Click the link in the email to sign in.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMagicLinkSent(false);
                    setMagicEmail("");
                  }}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email">Email address</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We will send a secure login link to your email. No password needed.
                </p>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Send Login Link
                </Button>
              </form>
            )}
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password">
            <form onSubmit={handlePasswordLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex-col gap-2 text-center">
        <p className="text-xs text-muted-foreground">
          Need help? Contact us at{" "}
          <a href="mailto:claims@surplusflow.com" className="text-primary hover:underline">
            claims@surplusflow.com
          </a>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
