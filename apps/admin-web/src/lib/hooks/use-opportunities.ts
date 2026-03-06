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
  status: string;
  ingestedAt: string;
  expiresAt?: string;
  [key: string]: unknown;
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
  const { data, error, isLoading } = useSWR<Opportunity>(
    id ? `/api/v1/opportunities/${id}` : null,
  );
  return { opportunity: data, error, isLoading };
}
