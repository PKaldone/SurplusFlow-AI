"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Upload, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMyCase } from "@/lib/hooks/use-portal";
import { apiFetch } from "@/lib/api";

const PROGRESS_STEPS = [
  { key: "CLAIMANT_ENROLLED", label: "Agreement Signed", description: "Your recovery agreement has been signed." },
  { key: "DOCS_COLLECTING", label: "Collecting Documents", description: "We are gathering the necessary documents for your claim." },
  { key: "COMPLIANCE_REVIEW", label: "Under Review", description: "Your claim documents are being reviewed for completeness." },
  { key: "CLAIM_FILED", label: "Claim Filed", description: "Your claim has been filed with the appropriate authority." },
  { key: "CLAIM_PROCESSING", label: "Processing", description: "The authority is reviewing your claim." },
  { key: "PAYOUT_RECEIVED", label: "Payment Received", description: "Funds have been received. Your payment is on the way." },
  { key: "CLOSED_COMPLETE", label: "Complete", description: "Your case is complete. Thank you!" },
];

const STATUS_TO_STEP: Record<string, number> = {
  CLAIMANT_ENROLLED: 0,
  ENROLLED: 0,
  DOCS_COLLECTING: 1,
  PACKET_ASSEMBLY: 1,
  COMPLIANCE_REVIEW: 2,
  NEEDS_LEGAL_REVIEW: 2,
  CLAIM_READY: 2,
  CLAIM_FILED: 3,
  SUBMITTED: 3,
  CLAIM_PROCESSING: 4,
  PAYOUT_RECEIVED: 5,
  AWAITING_PAYOUT: 5,
  INVOICE_SENT: 5,
  FEE_COLLECTED: 6,
  CLOSED_COMPLETE: 6,
  CLOSED: 6,
  RECOVERED: 6,
  INVOICED: 6,
};

function formatCurrency(amount: unknown): string {
  if (amount == null) return "TBD";
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return "TBD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function CaseDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { caseData, isLoading, error, mutate } = useMyCase(id);

  const [signMethod, setSignMethod] = useState<string>("");
  const [signLoading, setSignLoading] = useState(false);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [rescindDialogOpen, setRescindDialogOpen] = useState(false);
  const [rescindLoading, setRescindLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div>
        <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to My Cases
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive">
              We could not load this case. It may not exist or you may not have access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = String(caseData.status ?? "");
  const currentStepIndex = STATUS_TO_STEP[status] ?? -1;

  const canSign = [
    "CLAIMANT_ENROLLED", "ENROLLED", "OUTREACH_RESPONDED",
  ].includes(status) && !caseData.contractSignedAt && !caseData.contract_signed_at;

  const rescissionDeadline = caseData.rescissionDeadline ?? caseData.rescission_deadline;
  const canRescind = rescissionDeadline && new Date(rescissionDeadline) > new Date();

  const documents = caseData.documents ?? [];

  async function handleSign() {
    if (!signMethod) return;
    setSignLoading(true);
    setActionError("");
    setActionSuccess("");
    try {
      await apiFetch(`/api/v1/portal/my-cases/${id}/sign-contract`, {
        method: "POST",
        body: JSON.stringify({ signatureMethod: signMethod }),
      });
      setActionSuccess("Contract signed successfully!");
      setSignDialogOpen(false);
      mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign contract.";
      setActionError(msg);
    } finally {
      setSignLoading(false);
    }
  }

  async function handleRescind() {
    setRescindLoading(true);
    setActionError("");
    setActionSuccess("");
    try {
      await apiFetch(`/api/v1/portal/my-cases/${id}/rescind`, {
        method: "POST",
      });
      setActionSuccess("Contract rescinded successfully.");
      setRescindDialogOpen(false);
      mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to rescind contract.";
      setActionError(msg);
    } finally {
      setRescindLoading(false);
    }
  }

  return (
    <div>
      <Link href="/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to My Cases
      </Link>

      {/* Feedback messages */}
      {actionSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700 mb-4">
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
          {actionError}
        </div>
      )}

      {/* Case Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">
                  Case {String(caseData.caseNumber ?? caseData.case_number ?? id)}
                </h1>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {String(caseData.propertyDescription ?? caseData.property_description ?? caseData.surplusType ?? caseData.surplus_type ?? "Surplus recovery")}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(caseData.reportedAmount ?? caseData.reported_amount ?? caseData.estimatedAmount ?? caseData.estimated_amount)}
              </div>
              <div className="text-xs text-muted-foreground">Estimated amount</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">State</span>
              <p className="font-medium">{String(caseData.jurisdictionState ?? caseData.jurisdiction_state ?? "N/A")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fee</span>
              <p className="font-medium">
                {caseData.feePercent ?? caseData.fee_percent ? `${caseData.feePercent ?? caseData.fee_percent}%` : "N/A"} (success-based)
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Agreement Date</span>
              <p className="font-medium">{formatDate(caseData.contractSignedAt ?? caseData.contract_signed_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cancellation Deadline</span>
              <p className="font-medium">{formatDate(rescissionDeadline)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {(canSign || canRescind) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {canSign && (
            <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FileText className="mr-2 h-4 w-4" />
                  Sign Contract
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sign Your Recovery Agreement</DialogTitle>
                  <DialogDescription>
                    Choose how you would like to sign the agreement. You can sign electronically for
                    the fastest processing.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  <Label>Signature Method</Label>
                  <Select value={signMethod} onValueChange={setSignMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a method..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="e_sign">Electronic Signature (fastest)</SelectItem>
                      <SelectItem value="wet_ink">Wet Ink (mail signed copy)</SelectItem>
                      <SelectItem value="notarized">Notarized (requires notary)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSignDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSign} disabled={!signMethod || signLoading}>
                    {signLoading ? "Signing..." : "Confirm & Sign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canRescind && (
            <Dialog open={rescindDialogOpen} onOpenChange={setRescindDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Rescind Contract
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rescind Your Agreement</DialogTitle>
                  <DialogDescription>
                    You are within the rescission period and may cancel your agreement. This action cannot be undone.
                    Your cancellation deadline is {formatDate(rescissionDeadline)}.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRescindDialogOpen(false)}>
                    Keep Agreement
                  </Button>
                  <Button variant="destructive" onClick={handleRescind} disabled={rescindLoading}>
                    {rescindLoading ? "Processing..." : "Yes, Rescind Agreement"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* Progress Timeline */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Claim Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {PROGRESS_STEPS.map((step, i) => {
              const isComplete = i < currentStepIndex;
              const isCurrent = i === currentStepIndex;
              const isFuture = i > currentStepIndex;

              return (
                <div key={step.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                        isComplete
                          ? "bg-green-500 border-green-500 text-white"
                          : isCurrent
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-muted border-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i < PROGRESS_STEPS.length - 1 && (
                      <div
                        className={`w-0.5 h-12 ${isComplete ? "bg-green-400" : "bg-border"}`}
                      />
                    )}
                  </div>
                  <div className="pb-6">
                    <div
                      className={`font-medium ${
                        isFuture ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {step.label}
                      {isCurrent && (
                        <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Current Step
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-sm mt-1 ${
                        isFuture ? "text-muted-foreground/50" : "text-muted-foreground"
                      }`}
                    >
                      {step.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Documents</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href={`/cases/${id}/documents`}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Documents
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No documents uploaded yet. Click "Upload Documents" to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc: Record<string, unknown>, i: number) => (
                <div
                  key={String(doc.id ?? i)}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {String(doc.filename ?? doc.name ?? `Document ${i + 1}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {String(doc.docType ?? doc.doc_type ?? "")}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={String(doc.verificationStatus ?? doc.verification_status ?? doc.status ?? "uploaded")} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          Questions about your case? Contact us at{" "}
          <a href="mailto:claims@surplusflow.com" className="text-primary hover:underline">
            claims@surplusflow.com
          </a>{" "}
          or call (555) 123-4567
        </p>
        <p className="mt-1">
          Reference your case number:{" "}
          <strong>{String(caseData.caseNumber ?? caseData.case_number ?? id)}</strong>
        </p>
      </div>
    </div>
  );
}
