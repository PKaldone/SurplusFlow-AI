"use client";

import { Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading";
import { useMyInvoices } from "@/lib/hooks/use-portal";

function formatCurrency(amount: unknown): string {
  if (amount == null) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
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

export default function InvoicesPage() {
  const { invoices, isLoading, error } = useMyInvoices();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Invoices</h1>
        <p className="text-muted-foreground mt-1">
          View invoices related to your surplus recovery cases.
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
              Something went wrong loading your invoices. Please try again later.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && invoices.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <Receipt className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-lg">No invoices yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  You will see invoices here once your case reaches the payout stage.
                  Our fees are success-based, so you only pay when funds are recovered.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && invoices.length > 0 && (
        <div className="grid gap-4">
          {invoices.map((inv: Record<string, unknown>) => (
            <Card key={String(inv.id)} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">
                        Invoice #{String(inv.invoiceNumber ?? inv.invoice_number ?? inv.id)}
                      </h3>
                      <StatusBadge status={String(inv.status ?? "draft")} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Case: {String(inv.caseNumber ?? inv.case_number ?? "N/A")}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {formatCurrency(inv.totalAmount ?? inv.total_amount ?? inv.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Amount</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-muted-foreground">
                        {formatCurrency(inv.feeAmount ?? inv.fee_amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">Fee</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {formatDate(String(inv.dueDate ?? inv.due_date ?? ""))}
                      </div>
                      <div className="text-xs text-muted-foreground">Due Date</div>
                    </div>
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
