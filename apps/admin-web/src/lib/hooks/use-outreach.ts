import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

export const OUTREACH_CHANNELS = ['mail', 'email', 'sms'] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'opened',
  'clicked',
  'responded',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const IDENTIFIER_TYPES = ['email', 'phone', 'address_hash', 'name_hash'] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const SUPPRESSION_REASONS = [
  'opt_out',
  'do_not_contact',
  'complaint',
  'legal_hold',
  'duplicate',
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export interface OutreachTemplate {
  id: string;
  name: string;
  channel: string;
  description?: string;
  body?: string;
  subject?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface OutreachRecord {
  id: string;
  caseId: string;
  channel: string;
  templateId?: string;
  templateName?: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface SuppressionEntry {
  id: string;
  identifier: string;
  identifierType: string;
  reason: string;
  source: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface SuppressionResponse {
  data: SuppressionEntry[];
  total: number;
  page: number;
  limit: number;
}

export function useTemplates() {
  const { data, error, isLoading, mutate } = useSWR<OutreachTemplate[]>(
    '/api/v1/outreach/templates',
  );

  return {
    templates: Array.isArray(data) ? data : (data as unknown as { data: OutreachTemplate[] })?.data || [],
    error,
    isLoading,
    mutate,
  };
}

export function useOutreachHistory(caseId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<OutreachRecord[]>(
    caseId ? `/api/v1/outreach/cases/${caseId}/history` : null,
  );

  return {
    history: Array.isArray(data) ? data : (data as unknown as { data: OutreachRecord[] })?.data || [],
    error,
    isLoading,
    mutate,
  };
}

export function useSuppression(filters: { page?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<SuppressionResponse>(
    `/api/v1/outreach/suppression?${params}`,
  );

  return {
    entries: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export async function queueOutreach(
  caseId: string,
  channel: string,
  templateId: string,
): Promise<void> {
  await apiFetch(`/api/v1/outreach/cases/${caseId}/queue`, {
    method: 'POST',
    body: JSON.stringify({ channel, templateId }),
  });
}

export async function approveOutreach(recordId: string): Promise<void> {
  await apiFetch(`/api/v1/outreach/cases/${recordId}/approve`, {
    method: 'PATCH',
  });
}

export async function addSuppression(entry: {
  identifier: string;
  identifierType: string;
  reason: string;
  source: string;
}): Promise<void> {
  await apiFetch('/api/v1/outreach/suppression', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}
