// ============================================================
// SurplusFlow AI — Validation Schemas (Zod-compatible patterns)
// Using simple runtime validation to avoid external dependency
// ============================================================

import { UserRoles, SourceTypes, CaseStatuses, OutreachChannels, VerificationStatuses } from '../types/index.js';

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\+?1?\d{10,15}$/.test(phone.replace(/[\s\-()]/g, ''));
}

export function validateStateCode(state: string): boolean {
  return /^[A-Z]{2}$/.test(state);
}

export function validateJurisdictionKey(key: string): boolean {
  // "CA" or "CA-LOS_ANGELES"
  return /^[A-Z]{2}(-[A-Z0-9_]+)?$/.test(key);
}

export function validateFeePercent(fee: number): boolean {
  return fee >= 0 && fee <= 100;
}

export function validateCaseNumber(num: string): boolean {
  return /^SF-\d{4}-\d{5,}$/.test(num);
}

export function validateUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// --- Input Validators ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateCase(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!input.opportunityId || !validateUUID(input.opportunityId as string)) {
    errors.push('Valid opportunityId (UUID) is required');
  }
  if (!input.claimantId || !validateUUID(input.claimantId as string)) {
    errors.push('Valid claimantId (UUID) is required');
  }
  if (!input.sourceType || !SourceTypes.includes(input.sourceType as any)) {
    errors.push(`sourceType must be one of: ${SourceTypes.join(', ')}`);
  }
  if (!input.jurisdictionKey || !validateJurisdictionKey(input.jurisdictionKey as string)) {
    errors.push('Valid jurisdictionKey is required (e.g., "CA" or "FL-MIAMI_DADE")');
  }
  if (!input.state || !validateStateCode(input.state as string)) {
    errors.push('Valid 2-letter state code is required');
  }

  return { valid: errors.length === 0, errors };
}

export function validateCreateClaimant(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!input.firstName || typeof input.firstName !== 'string' || input.firstName.length < 1) {
    errors.push('firstName is required');
  }
  if (!input.lastName || typeof input.lastName !== 'string' || input.lastName.length < 1) {
    errors.push('lastName is required');
  }
  if (input.email && !validateEmail(input.email as string)) {
    errors.push('Invalid email format');
  }
  if (input.phone && !validatePhone(input.phone as string)) {
    errors.push('Invalid phone format');
  }
  if (input.state && !validateStateCode(input.state as string)) {
    errors.push('Invalid state code');
  }

  return { valid: errors.length === 0, errors };
}

export function validateRuleEvalInput(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!input.sourceType || !SourceTypes.includes(input.sourceType as any)) {
    errors.push(`sourceType must be one of: ${SourceTypes.join(', ')}`);
  }
  if (!input.jurisdictionKey || !validateJurisdictionKey(input.jurisdictionKey as string)) {
    errors.push('Valid jurisdictionKey is required');
  }
  if (!input.state || !validateStateCode(input.state as string)) {
    errors.push('Valid state code is required');
  }
  if (input.configuredFeePercent == null || !validateFeePercent(input.configuredFeePercent as number)) {
    errors.push('configuredFeePercent must be between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

export function validateOutreachCampaign(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!input.name || typeof input.name !== 'string') {
    errors.push('Campaign name is required');
  }
  if (!input.sourceType || !SourceTypes.includes(input.sourceType as any)) {
    errors.push(`sourceType must be one of: ${SourceTypes.join(', ')}`);
  }
  if (!input.channel || !OutreachChannels.includes(input.channel as any)) {
    errors.push(`channel must be one of: ${OutreachChannels.join(', ')}`);
  }
  if (!input.templateKey || typeof input.templateKey !== 'string') {
    errors.push('templateKey is required');
  }

  return { valid: errors.length === 0, errors };
}
