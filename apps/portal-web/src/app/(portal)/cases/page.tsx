"use client";

import Link from "next/link";
import { FolderOpen, ArrowRight, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading";
import { useMyCases } from "@/lib/hooks/use-portal";

function formatCurrency(amount: unknown): string {
  if (amount == null) return "TBD";
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return "TBD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function MyCasesPage() {
  const { cases, isLoading, error } = useMyCases();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Cases</h1>
        <p className="text-muted-foreground mt-1">
          Track the progress of your surplus recovery claims.
        </p>
      </div>

      {isLoading && (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive">
              Something went wrong loading your cases. Please try again later.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && cases.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <FolderOpen className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-lg">No active cases</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  You don't have any active cases. If you've been contacted about a
                  surplus recovery, please check your email for a login link.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && cases.length > 0 && (
        <div className="grid gap-4">
          {cases.map((c: Record<string, unknown>) => (
            <Card key={String(c.id)} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {String(c.caseNumber ?? c.case_number ?? "Case")}
                      </h3>
                      <StatusBadge status={String(c.status ?? "")} />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {String(c.propertyDescription ?? c.property_description ?? c.surplusType ?? c.surplus_type ?? "Surplus recovery claim")}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {(c.jurisdictionState || c.jurisdiction_state) && (
                        <span>State: {String(c.jurisdictionState ?? c.jurisdiction_state)}</span>
                      )}
                      {(c.updatedAt || c.updated_at) && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Updated {formatDate(String(c.updatedAt ?? c.updated_at))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-600">
                        {formatCurrency(c.reportedAmount ?? c.reported_amount ?? c.estimatedAmount ?? c.estimated_amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">Estimated amount</div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/cases/${String(c.id)}`}>
                        View Details
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
