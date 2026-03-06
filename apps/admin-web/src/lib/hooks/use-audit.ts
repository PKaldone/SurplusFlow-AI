import useSWR from 'swr';
import { getAccessToken } from '@/lib/api';

export const AUDIT_EVENT_TYPES = [
  'CASE_CREATED',
  'STATUS_CHANGED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_ACCESSED',
  'DOCUMENT_DELETED',
  'CONTRACT_SIGNED',
  'CONTRACT_RESCINDED',
  'OUTREACH_SENT',
  'OUTREACH_DELIVERED',
  'RULE_EVALUATED',
  'RULE_VERIFIED',
  'RULE_UPDATED',
  'INVOICE_GENERATED',
  'INVOICE_SENT',
  'INVOICE_PAID',
  'PAYOUT_CONFIRMED',
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_CREATED',
  'PERMISSION_CHANGED',
  'EXPORT_REQUESTED',
  'SUPPRESSION_ADDED',
  'ATTORNEY_ASSIGNED',
  'ATTORNEY_STATUS_UPDATE',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditLogEntry {
  id: string;
  prevHash: string;
  eventHash: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  eventType: string;
  entityType: string;
  entityId: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

interface AuditFilters {
  eventType?: string;
  entityType?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

interface AuditListResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface ChainVerifyResult {
  valid: boolean;
  totalEntries: number;
  compromisedEntries?: string[];
  message?: string;
}

export function useAuditLog(filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<AuditListResponse>(
    `/api/v1/audit?${params}`,
  );

  return {
    entries: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function verifyChain(): Promise<ChainVerifyResult> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/api/v1/audit/verify-chain`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Failed to verify chain integrity');
  }
  return res.json();
}

export async function exportAuditLog(): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/api/v1/audit/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Failed to export audit log');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
