// ============================================================
// SurplusFlow AI — Outreach Policy & Workflow Types
// ============================================================

import type { OutreachChannel, OutreachMergeData } from '@surplusflow/shared';

// --- Outreach Policy Rules ---

export interface OutreachPolicy {
  /** Max touches before auto-stop */
  maxTouches: number;
  /** Days between touch 1 and touch 2 */
  touch1ToTouch2Days: number;
  /** Days between touch 2 and touch 3 */
  touch2ToTouch3Days: number;
  /** Channels allowed for each touch */
  touchChannels: Record<number, OutreachChannel[]>;
  /** Whether compliance approval is required before sending */
  requiresApproval: boolean;
}

export const DEFAULT_OUTREACH_POLICY: OutreachPolicy = {
  maxTouches: 3,
  touch1ToTouch2Days: 14,
  touch2ToTouch3Days: 21,
  touchChannels: {
    1: ['mail', 'email'],
    2: ['mail', 'email'],
    3: ['mail'],  // final touch is mail-only for formal record
  },
  requiresApproval: true,
};

// --- Stop Rules ---

export interface OutreachStopRule {
  code: string;
  description: string;
  check: (context: OutreachContext) => boolean;
}

export interface OutreachContext {
  claimantDoNotContact: boolean;
  claimantOptedOut: boolean;
  touchesSent: number;
  maxTouches: number;
  lastTouchDate?: Date;
  claimantResponded: boolean;
  caseStatus: string;
  suppressionListMatch: boolean;
  solicitationBlocked: boolean;
  jurisdictionRestricted: boolean;
}

export const STOP_RULES: OutreachStopRule[] = [
  {
    code: 'DO_NOT_CONTACT',
    description: 'Claimant is flagged as do-not-contact',
    check: (ctx) => ctx.claimantDoNotContact,
  },
  {
    code: 'OPTED_OUT',
    description: 'Claimant has opted out of communications',
    check: (ctx) => ctx.claimantOptedOut,
  },
  {
    code: 'MAX_TOUCHES_REACHED',
    description: 'Maximum number of outreach touches has been sent',
    check: (ctx) => ctx.touchesSent >= ctx.maxTouches,
  },
  {
    code: 'CLAIMANT_RESPONDED',
    description: 'Claimant has already responded — no further outreach needed',
    check: (ctx) => ctx.claimantResponded,
  },
  {
    code: 'CASE_NOT_ACTIVE',
    description: 'Case is in a terminal or non-outreach status',
    check: (ctx) => ['CLOSED', 'WITHDRAWN', 'BLOCKED', 'DENIED', 'RESCINDED'].includes(ctx.caseStatus),
  },
  {
    code: 'SUPPRESSION_LIST',
    description: 'Claimant identifier is on the suppression list',
    check: (ctx) => ctx.suppressionListMatch,
  },
  {
    code: 'SOLICITATION_BLOCKED',
    description: 'Solicitation is currently blocked by jurisdiction rule (within restricted window)',
    check: (ctx) => ctx.solicitationBlocked,
  },
  {
    code: 'JURISDICTION_RESTRICTED',
    description: 'Jurisdiction does not allow outreach for this source type',
    check: (ctx) => ctx.jurisdictionRestricted,
  },
];

/**
 * Evaluate all stop rules and return which ones triggered
 */
export function evaluateStopRules(context: OutreachContext): { canSend: boolean; triggeredRules: OutreachStopRule[] } {
  const triggered = STOP_RULES.filter(rule => rule.check(context));
  return {
    canSend: triggered.length === 0,
    triggeredRules: triggered,
  };
}

// --- Template Selection ---

export interface OutreachTemplateMap {
  channel: OutreachChannel;
  touchNumber: number;
  templateKey: string;
}

export const OUTREACH_TEMPLATE_MAP: OutreachTemplateMap[] = [
  // Mail
  { channel: 'mail', touchNumber: 1, templateKey: 'outreach_mail_v1' },
  { channel: 'mail', touchNumber: 2, templateKey: 'outreach_mail_followup2' },
  { channel: 'mail', touchNumber: 3, templateKey: 'outreach_mail_followup3' },
  // Email
  { channel: 'email', touchNumber: 1, templateKey: 'outreach_email_v1' },
  { channel: 'email', touchNumber: 2, templateKey: 'outreach_email_followup2' },
  { channel: 'email', touchNumber: 3, templateKey: 'outreach_email_followup3' },
  // SMS
  { channel: 'sms', touchNumber: 1, templateKey: 'outreach_sms_v1' },
  { channel: 'sms', touchNumber: 2, templateKey: 'outreach_sms_followup2' },
];

export function getOutreachTemplate(channel: OutreachChannel, touchNumber: number): string | null {
  const entry = OUTREACH_TEMPLATE_MAP.find(t => t.channel === channel && t.touchNumber === touchNumber);
  return entry?.templateKey ?? null;
}

// --- Merge Data Required Fields ---

export const OUTREACH_REQUIRED_FIELDS: Record<OutreachChannel, (keyof OutreachMergeData)[]> = {
  mail: [
    'claimantFirstName', 'claimantLastName', 'claimantFullName',
    'claimantAddress', 'claimantCity', 'claimantState', 'claimantZip',
    'propertyDescription', 'reportedAmount', 'caseNumber',
    'companyName', 'companyAddress', 'companyPhone', 'companyEmail',
    'optOutUrl', 'optOutPhone', 'todayDate', 'disclosures',
  ],
  email: [
    'claimantFirstName', 'claimantFullName', 'claimantEmail',
    'propertyDescription', 'reportedAmount', 'caseNumber',
    'companyName', 'companyPhone', 'companyEmail', 'companyWebsite',
    'optOutUrl', 'todayDate', 'disclosures',
  ],
  sms: [
    'claimantFirstName', 'reportedAmount', 'caseNumber',
    'companyName', 'companyPhone', 'optOutPhone',
  ],
};

// --- Admin Approval Fields ---

export interface OutreachApprovalPayload {
  campaignId: string;
  approvedBy: string;  // user ID of compliance/admin reviewer
  approvalNotes?: string;
  /** Reviewer confirms disclosures are correct for jurisdiction */
  disclosuresVerified: boolean;
  /** Reviewer confirms suppression list was checked */
  suppressionListChecked: boolean;
  /** Reviewer confirms solicitation window is clear */
  solicitationWindowClear: boolean;
  /** Reviewer confirms template content is compliant */
  templateContentApproved: boolean;
}

export function validateApproval(payload: OutreachApprovalPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.disclosuresVerified) {
    errors.push('Disclosure verification is required before approval');
  }
  if (!payload.suppressionListChecked) {
    errors.push('Suppression list check confirmation is required');
  }
  if (!payload.solicitationWindowClear) {
    errors.push('Solicitation window clearance confirmation is required');
  }
  if (!payload.templateContentApproved) {
    errors.push('Template content approval is required');
  }

  return { valid: errors.length === 0, errors };
}
