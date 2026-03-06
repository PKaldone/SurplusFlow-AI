import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // Case statuses (full lifecycle)
  OPPORTUNITY_IDENTIFIED: "bg-gray-100 text-gray-700 border-gray-200",
  OUTREACH_PENDING: "bg-blue-50 text-blue-700 border-blue-200",
  OUTREACH_SENT: "bg-blue-100 text-blue-700 border-blue-200",
  OUTREACH_RESPONDED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  CLAIMANT_ENROLLED: "bg-purple-100 text-purple-700 border-purple-200",
  DOCS_COLLECTING: "bg-yellow-100 text-yellow-700 border-yellow-200",
  COMPLIANCE_REVIEW: "bg-orange-100 text-orange-700 border-orange-200",
  NEEDS_LEGAL_REVIEW: "bg-orange-200 text-orange-800 border-orange-300",
  CLAIM_READY: "bg-cyan-50 text-cyan-700 border-cyan-200",
  CLAIM_FILED: "bg-cyan-100 text-cyan-700 border-cyan-200",
  CLAIM_PROCESSING: "bg-cyan-200 text-cyan-800 border-cyan-300",
  PAYOUT_RECEIVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CLAIM_DENIED: "bg-red-100 text-red-700 border-red-200",
  INVOICE_SENT: "bg-green-100 text-green-700 border-green-200",
  FEE_COLLECTED: "bg-green-200 text-green-800 border-green-300",
  CLOSED_COMPLETE: "bg-green-100 text-green-800 border-green-300",
  CLOSED_NO_RESPONSE: "bg-gray-200 text-gray-600 border-gray-300",
  CLOSED_DENIED: "bg-red-50 text-red-600 border-red-200",
  CLOSED_CLAIMANT_WITHDREW: "bg-amber-100 text-amber-700 border-amber-200",
  CLOSED_DUPLICATE: "bg-gray-100 text-gray-500 border-gray-200",
  CLOSED_INELIGIBLE: "bg-red-100 text-red-700 border-red-200",
  // Legacy statuses
  CONTACTED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ENROLLED: "bg-purple-100 text-purple-700 border-purple-200",
  PACKET_ASSEMBLY: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ATTORNEY_REVIEW: "bg-orange-100 text-orange-700 border-orange-200",
  SUBMITTED: "bg-cyan-100 text-cyan-700 border-cyan-200",
  AWAITING_PAYOUT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  RECOVERED: "bg-green-100 text-green-700 border-green-200",
  INVOICED: "bg-green-200 text-green-800 border-green-300",
  CLOSED_SUCCESSFUL: "bg-green-100 text-green-800 border-green-300",
  ON_HOLD: "bg-amber-100 text-amber-700 border-amber-200",
  BLOCKED: "bg-red-100 text-red-700 border-red-200",
  // Document types
  id_proof: "bg-blue-50 text-blue-700 border-blue-200",
  ssn_card: "bg-blue-100 text-blue-700 border-blue-200",
  deed: "bg-amber-100 text-amber-700 border-amber-200",
  contract: "bg-purple-100 text-purple-700 border-purple-200",
  disclosure: "bg-yellow-100 text-yellow-700 border-yellow-200",
  assignment: "bg-indigo-100 text-indigo-700 border-indigo-200",
  notary_page: "bg-orange-100 text-orange-700 border-orange-200",
  claim_form: "bg-cyan-100 text-cyan-700 border-cyan-200",
  correspondence: "bg-gray-100 text-gray-700 border-gray-200",
  attorney_dossier: "bg-rose-100 text-rose-700 border-rose-200",
  other: "bg-gray-100 text-gray-500 border-gray-200",

  // Invoice statuses
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  waived: "bg-gray-100 text-gray-500 border-gray-200",
  disputed: "bg-orange-100 text-orange-700 border-orange-200",

  // Verification statuses
  unverified: "bg-gray-100 text-gray-600 border-gray-200",
  in_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
  verified: "bg-green-100 text-green-700 border-green-200",
  requires_update: "bg-orange-100 text-orange-700 border-orange-200",

  // Evaluation results
  ALLOWED: "bg-green-100 text-green-700 border-green-200",
  ALLOWED_WITH_CONSTRAINTS: "bg-yellow-100 text-yellow-700 border-yellow-200",
  // BLOCKED already defined above in legacy statuses

  // Opportunity statuses
  new: "bg-blue-50 text-blue-700 border-blue-200",
  matched: "bg-purple-100 text-purple-700 border-purple-200",
  case_created: "bg-green-100 text-green-700 border-green-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",

  // Suppression reasons
  opt_out: "bg-amber-100 text-amber-700 border-amber-200",
  do_not_contact: "bg-red-100 text-red-700 border-red-200",
  complaint: "bg-orange-100 text-orange-700 border-orange-200",
  legal_hold: "bg-purple-100 text-purple-700 border-purple-200",
  duplicate: "bg-gray-100 text-gray-500 border-gray-200",
};

function formatLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {formatLabel(status)}
    </Badge>
  );
}
