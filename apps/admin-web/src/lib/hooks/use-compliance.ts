import useSWR from 'swr';
import { apiFetch, getAccessToken } from '@/lib/api';

export const VERIFICATION_STATUSES = [
  'unverified',
  'in_review',
  'verified',
  'requires_update',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SOURCE_TYPES = [
  'unclaimed_property',
  'tax_sale',
  'foreclosure',
  'escheatment',
  'insurance',
  'utility',
  'other',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export interface ComplianceRule {
  id: string;
  state: string;
  county?: string;
  sourceType: string;
  maxFeePercent?: number;
  feeCapAmount?: number;
  coolingOffDays?: number;
  notarizationRequired?: boolean;
  assignmentAllowed?: boolean;
  licenseRequired?: boolean;
  bondRequired?: boolean;
  bondAmount?: number;
  solicitationRestrictions?: unknown;
  requiredDisclosures?: string[];
  contractTemplateVersion?: string;
  effectiveDate?: string;
  expiryDate?: string;
  verificationStatus: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationEvidence?: string;
  notes?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface EvaluationRequest {
  state: string;
  county?: string;
  sourceType: string;
  configuredFeePercent: number;
  estimatedAmount: number;
  solicitationDate?: string;
  saleDate?: string;
  hasLicense?: boolean;
  hasBond?: boolean;
}

export interface EvaluationResult {
  result: 'ALLOWED' | 'ALLOWED_WITH_CONSTRAINTS' | 'BLOCKED';
  constraints?: string[];
  reasons?: string[];
  maxFeePercent?: number;
  feeCapAmount?: number;
  [key: string]: unknown;
}

interface RuleFilters {
  state?: string;
  verificationStatus?: string;
  page?: number;
  limit?: number;
}

interface RuleListResponse {
  data: ComplianceRule[];
  total: number;
  page: number;
  limit: number;
}

export function useRules(filters: RuleFilters = {}) {
  const params = new URLSearchParams();
  if (filters.state) params.set('state', filters.state);
  if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<RuleListResponse>(
    `/api/v1/rules?${params}`,
  );

  return {
    rules: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export function useRule(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ComplianceRule>(
    id ? `/api/v1/rules/${id}` : null,
  );

  return {
    rule: data || null,
    error,
    isLoading,
    mutate,
  };
}

export async function createRule(
  rule: Partial<ComplianceRule>,
): Promise<ComplianceRule> {
  return apiFetch<ComplianceRule>('/api/v1/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function updateRule(
  id: string,
  updates: Partial<ComplianceRule>,
): Promise<ComplianceRule> {
  return apiFetch<ComplianceRule>(`/api/v1/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function verifyRule(
  id: string,
  evidence: string,
): Promise<void> {
  await apiFetch(`/api/v1/rules/${id}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ evidence }),
  });
}

export async function evaluateCompliance(
  request: EvaluationRequest,
): Promise<EvaluationResult> {
  return apiFetch<EvaluationResult>('/api/v1/rules/evaluate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function importRulesCsv(csv: string): Promise<void> {
  await apiFetch('/api/v1/rules/import', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export async function exportRulesCsv(): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  const token = getAccessToken();

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api/v1/rules/matrix/export`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'compliance-rules-matrix.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
