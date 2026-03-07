import useSWR from 'swr';

export const SOURCE_TYPES = [
  'unclaimed_property',
  'foreclosure_surplus',
  'tax_sale_surplus',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const OPPORTUNITY_STATUSES = [
  'new',
  'matched',
  'case_created',
  'duplicate',
  'expired',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export interface Opportunity {
  id: string;
  sourceType: string;
  jurisdictionState: string;
  jurisdictionCounty: string;
  ownerName: string;
  ownerAddress?: string;
  propertyDescription?: string;
  estimatedAmount: number;
  sourceUrl?: string;
  sourceRef?: string;
  holderName?: string;
  parcelNumber?: string;
  saleDate?: string;
  surplusDate?: string;
  deadlineDate?: string;
  status: string;
  ingestedAt: string;
  updatedAt?: string;
  rawData?: Record<string, unknown> | null;
  relatedCases?: RelatedCase[];
  outreachHistory?: OutreachRecord[];
  enrichmentHistory?: EnrichmentEntry[];
  [key: string]: unknown;
}

export interface RelatedCase {
  id: string;
  caseNumber: string;
  status: string;
  claimedAmount: number | null;
  createdAt: string;
  claimantName: string | null;
  claimantEmail: string | null;
  claimantPhone: string | null;
}

export interface OutreachRecord {
  id: string;
  channel: string;
  templateKey: string;
  touchNumber: number;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  respondedAt?: string;
  stopReason?: string;
}

export interface EnrichmentEntry {
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface RuleCheckSignal {
  type: string;
  label: string;
  detail: string;
  severity: 'ok' | 'info' | 'warning' | 'critical';
}

export interface RuleCheckResult {
  id: string;
  ruleCheck: {
    result: string;
    constraints: string[];
    warnings: string[];
  };
  signals: RuleCheckSignal[];
  duplicateCount: number;
}

interface OpportunityFilters {
  state?: string;
  sourceType?: string;
  status?: string;
  minAmount?: string;
  maxAmount?: string;
  page?: number;
  limit?: number;
}

interface OpportunitiesResponse {
  data: Opportunity[];
  total: number;
  page: number;
  limit: number;
}

export function useOpportunities(filters: OpportunityFilters = {}) {
  const params = new URLSearchParams();

  if (filters.state) params.set('state', filters.state);
  if (filters.sourceType) params.set('sourceType', filters.sourceType);
  if (filters.status) params.set('status', filters.status);
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<OpportunitiesResponse>(
    `/api/v1/opportunities?${params}`,
  );

  return {
    opportunities: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export function useOpportunity(id: string) {
  const { data, error, isLoading, mutate } = useSWR<Opportunity>(
    id ? `/api/v1/opportunities/${id}` : null,
  );
  return { opportunity: data, error, isLoading, mutate };
}

export function useRuleCheck(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<RuleCheckResult>(
    id ? `/api/v1/opportunities/${id}/rule-check` : null,
  );
  return { ruleCheck: data, error, isLoading, mutate };
}
