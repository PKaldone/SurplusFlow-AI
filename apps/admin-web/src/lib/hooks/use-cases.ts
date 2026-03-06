import useSWR from 'swr';

export const CASE_STATUSES = [
  'OPPORTUNITY_IDENTIFIED',
  'OUTREACH_PENDING',
  'OUTREACH_SENT',
  'OUTREACH_RESPONDED',
  'CLAIMANT_ENROLLED',
  'DOCS_COLLECTING',
  'COMPLIANCE_REVIEW',
  'NEEDS_LEGAL_REVIEW',
  'CLAIM_READY',
  'CLAIM_FILED',
  'CLAIM_PROCESSING',
  'PAYOUT_RECEIVED',
  'CLAIM_DENIED',
  'INVOICE_SENT',
  'FEE_COLLECTED',
  'CLOSED_COMPLETE',
  'CLOSED_NO_RESPONSE',
  'CLOSED_DENIED',
  'CLOSED_CLAIMANT_WITHDREW',
  'CLOSED_DUPLICATE',
  'CLOSED_INELIGIBLE',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const DOC_TYPES = [
  'id_proof',
  'ssn_card',
  'deed',
  'contract',
  'disclosure',
  'assignment',
  'notary_page',
  'claim_form',
  'correspondence',
  'invoice',
  'attorney_dossier',
  'other',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

interface CaseFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export function useCases(filters: CaseFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR(`/api/v1/cases?${params}`);

  return {
    cases: data?.data || data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export function useCase(id: string) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/v1/cases/${id}` : null);
  return { caseData: data, error, isLoading, mutate };
}

export function useCaseTimeline(id: string) {
  const { data, error, isLoading } = useSWR(id ? `/api/v1/cases/${id}/timeline` : null);
  return { timeline: data || [], error, isLoading };
}

export function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatSourceType(type: string | undefined | null): string {
  if (!type) return '-';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
