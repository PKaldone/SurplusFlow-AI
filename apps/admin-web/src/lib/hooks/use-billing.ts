import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'waived',
  'disputed',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface Invoice {
  id: string;
  invoiceNumber: string;
  caseId: string;
  claimantId?: string;
  payoutAmount: number;
  feePercent: number;
  feeAmount: number;
  feeCapApplied?: boolean;
  status: string;
  dueDate?: string;
  sentAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  stripeInvoiceId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface InvoiceFilters {
  status?: string;
  page?: number;
  limit?: number;
}

interface InvoiceListResponse {
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
}

export function useInvoices(filters: InvoiceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<InvoiceListResponse>(
    `/api/v1/billing?${params}`,
  );

  return {
    invoices: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export function useInvoice(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Invoice>(
    id ? `/api/v1/billing/${id}` : null,
  );

  return {
    invoice: data || null,
    error,
    isLoading,
    mutate,
  };
}

export async function generateInvoice(caseId: string): Promise<Invoice> {
  return apiFetch<Invoice>(`/api/v1/billing/cases/${caseId}/generate`, {
    method: 'POST',
  });
}

export async function sendInvoice(invoiceId: string): Promise<void> {
  await apiFetch(`/api/v1/billing/${invoiceId}/send`, {
    method: 'POST',
  });
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentReference: string,
  paymentMethod: string,
): Promise<void> {
  await apiFetch(`/api/v1/billing/${invoiceId}/mark-paid`, {
    method: 'PATCH',
    body: JSON.stringify({ paymentReference, paymentMethod }),
  });
}

export async function waiveInvoice(
  invoiceId: string,
  reason: string,
): Promise<void> {
  await apiFetch(`/api/v1/billing/${invoiceId}/waive`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}
