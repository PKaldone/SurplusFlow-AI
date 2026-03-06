import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  // Case statuses
  OPPORTUNITY_IDENTIFIED: "bg-gray-100 text-gray-700 border-gray-200",
  OUTREACH_PENDING: "bg-blue-50 text-blue-700 border-blue-200",
  OUTREACH_SENT: "bg-blue-100 text-blue-700 border-blue-200",
  CONTACTED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ENROLLED: "bg-purple-100 text-purple-700 border-purple-200",
  PACKET_ASSEMBLY: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ATTORNEY_REVIEW: "bg-orange-100 text-orange-700 border-orange-200",
  SUBMITTED: "bg-cyan-100 text-cyan-700 border-cyan-200",
  AWAITING_PAYOUT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  RECOVERED: "bg-green-100 text-green-700 border-green-200",
  INVOICED: "bg-green-200 text-green-800 border-green-300",
  CLOSED_SUCCESSFUL: "bg-green-100 text-green-800 border-green-300",
  CLOSED_INELIGIBLE: "bg-red-100 text-red-700 border-red-200",
  ON_HOLD: "bg-amber-100 text-amber-700 border-amber-200",
  BLOCKED: "bg-red-100 text-red-700 border-red-200",

  // Invoice statuses
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  waived: "bg-gray-100 text-gray-500 border-gray-200",

  // Opportunity statuses
  new: "bg-blue-50 text-blue-700 border-blue-200",
  matched: "bg-purple-100 text-purple-700 border-purple-200",
  case_created: "bg-green-100 text-green-700 border-green-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
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
