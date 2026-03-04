// ============================================================
// SurplusFlow AI — Shared Utilities
// ============================================================

import { createHash } from 'crypto';
import { CASE_NUMBER_PREFIX } from '../constants/index.js';

/**
 * Generate a case number: SF-YYYY-NNNNN
 */
export function generateCaseNumber(sequenceNum: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequenceNum).padStart(5, '0');
  return `${CASE_NUMBER_PREFIX}-${year}-${padded}`;
}

/**
 * Generate an invoice number: INV-YYYY-NNNNN
 */
export function generateInvoiceNumber(sequenceNum: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequenceNum).padStart(5, '0');
  return `INV-${year}-${padded}`;
}

/**
 * Build jurisdiction key from state and optional county
 */
export function buildJurisdictionKey(state: string, county?: string): string {
  if (!county) return state.toUpperCase();
  const normalizedCounty = county.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  return `${state.toUpperCase()}-${normalizedCounty}`;
}

/**
 * SHA-256 hash for audit log chain
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute audit log checksum: hash of previous checksum + current row data
 */
export function computeAuditChecksum(previousChecksum: string | null, rowData: Record<string, unknown>): string {
  const input = (previousChecksum || 'GENESIS') + '|' + JSON.stringify(rowData);
  return sha256(input);
}

/**
 * Mask SSN for display: ***-**-1234
 */
export function maskSSN(last4: string): string {
  return `***-**-${last4}`;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Calculate fee with cap enforcement
 */
export function calculateFee(payoutAmount: number, feePercent: number, feeCap?: number): number {
  const calculated = payoutAmount * (feePercent / 100);
  if (feeCap && calculated > feeCap) return feeCap;
  return Math.round(calculated * 100) / 100;
}

/**
 * Calculate rescission deadline
 */
export function calculateRescissionDeadline(contractDate: Date, coolingOffDays: number): Date {
  const deadline = new Date(contractDate);
  deadline.setDate(deadline.getDate() + coolingOffDays);
  return deadline;
}

/**
 * Check if within solicitation window
 */
export function isWithinSolicitationWindow(
  eventDate: Date,
  solicitationDate: Date,
  windowDays: number
): boolean {
  const windowEnd = new Date(eventDate);
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  return solicitationDate < windowEnd;
}

/**
 * Paginate array (for in-memory pagination in tests)
 */
export function paginate<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, total, page, pageSize, totalPages };
}

/**
 * Sleep utility for job retries
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize filename for storage
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
