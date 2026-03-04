// ============================================================
// SurplusFlow AI — Shared Types
// ============================================================

// --- Enums ---

export const UserRoles = ['super_admin', 'admin', 'ops', 'compliance', 'attorney', 'claimant'] as const;
export type UserRole = typeof UserRoles[number];

export const SourceTypes = ['unclaimed_property', 'foreclosure_surplus', 'tax_sale_surplus'] as const;
export type SourceType = typeof SourceTypes[number];

export const CaseStatuses = [
  'PROSPECT', 'OUTREACH', 'CONTACTED', 'ENROLLED',
  'PACKET_ASSEMBLY', 'ATTORNEY_REVIEW', 'SUBMITTED',
  'AWAITING_PAYOUT', 'INVOICED', 'CLOSED',
  'RESCINDED', 'WITHDRAWN', 'BLOCKED', 'ON_HOLD', 'DENIED'
] as const;
export type CaseStatus = typeof CaseStatuses[number];

export const OpportunityStatuses = ['new', 'matched', 'qualified', 'disqualified', 'claimed', 'expired'] as const;
export type OpportunityStatus = typeof OpportunityStatuses[number];

export const OutreachChannels = ['mail', 'email', 'sms'] as const;
export type OutreachChannel = typeof OutreachChannels[number];

export const InvoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'disputed', 'waived', 'cancelled'] as const;
export type InvoiceStatus = typeof InvoiceStatuses[number];

export const VerificationStatuses = ['UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'EXPIRED', 'REQUIRES_UPDATE'] as const;
export type VerificationStatus = typeof VerificationStatuses[number];

export const AttorneyAssignmentStatuses = ['pending', 'accepted', 'in_progress', 'filed', 'completed', 'declined'] as const;
export type AttorneyAssignmentStatus = typeof AttorneyAssignmentStatuses[number];

export const AttorneyRoutingReasons = ['judicial_motion', 'contested_heirs', 'lien_dispute', 'complex_title', 'statutory_requirement'] as const;
export type AttorneyRoutingReason = typeof AttorneyRoutingReasons[number];

// --- State Machine ---

export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  PROSPECT:         ['OUTREACH', 'BLOCKED', 'WITHDRAWN'],
  OUTREACH:         ['CONTACTED', 'WITHDRAWN', 'BLOCKED'],
  CONTACTED:        ['ENROLLED', 'WITHDRAWN', 'BLOCKED'],
  ENROLLED:         ['PACKET_ASSEMBLY', 'RESCINDED', 'WITHDRAWN', 'BLOCKED', 'ON_HOLD'],
  PACKET_ASSEMBLY:  ['ATTORNEY_REVIEW', 'SUBMITTED', 'ON_HOLD', 'BLOCKED'],
  ATTORNEY_REVIEW:  ['SUBMITTED', 'ON_HOLD', 'BLOCKED'],
  SUBMITTED:        ['AWAITING_PAYOUT', 'DENIED', 'ON_HOLD'],
  AWAITING_PAYOUT:  ['INVOICED', 'ON_HOLD'],
  INVOICED:         ['CLOSED', 'ON_HOLD'],
  CLOSED:           [],
  RESCINDED:        [],
  WITHDRAWN:        [],
  BLOCKED:          ['PROSPECT'],
  ON_HOLD:          ['ENROLLED', 'PACKET_ASSEMBLY', 'ATTORNEY_REVIEW', 'SUBMITTED', 'AWAITING_PAYOUT', 'INVOICED'],
  DENIED:           [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from]?.includes(to) ?? false;
}

// --- Models ---

export interface User {
  id: string;
  email: string;
  phone?: string;
  fullName: string;
  role: UserRole;
  mfaEnabled: boolean;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceUrl?: string;
  state: string;
  county?: string;
  jurisdictionKey: string;
  propertyDescription?: string;
  reportedAmount?: number;
  holderName?: string;
  ownerName?: string;
  ownerAddress?: string;
  parcelNumber?: string;
  saleDate?: string;
  surplusDate?: string;
  deadlineDate?: string;
  status: OpportunityStatus;
  ingestionBatch?: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Claimant {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  ssnLast4?: string;
  dateOfBirth?: string;
  identityVerified: boolean;
  verificationMethod?: string;
  doNotContact: boolean;
  suppressionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimCase {
  id: string;
  caseNumber: string;
  opportunityId: string;
  claimantId: string;
  assignedTo?: string;
  attorneyId?: string;
  status: CaseStatus;
  previousStatus?: CaseStatus;
  sourceType: SourceType;
  jurisdictionKey: string;
  state: string;
  county?: string;
  claimedAmount?: number;
  agreedFeePct?: number;
  agreedFeeCap?: number;
  contractVersion?: string;
  contractSignedAt?: string;
  rescissionDeadline?: string;
  coolingOffDays?: number;
  attorneyRequired: boolean;
  notarizationRequired: boolean;
  assignmentEnabled: boolean;
  submittedAt?: string;
  payoutAmount?: number;
  payoutDate?: string;
  payoutConfirmedAt?: string;
  feeAmount?: number;
  feeInvoicedAt?: string;
  feeCollectedAt?: string;
  closedAt?: string;
  closedReason?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JurisdictionRule {
  id: string;
  jurisdictionKey: string;
  state: string;
  county?: string;
  sourceType: SourceType;
  effectiveDate: string;
  expirationDate?: string;
  maxFeePercent?: number;
  feeCapAmount?: number;
  coolingOffDays: number;
  notarizationRequired: boolean;
  assignmentAllowed: boolean;
  licenseRequired: boolean;
  bondRequired: boolean;
  bondAmount?: number;
  solicitationRestricted: boolean;
  solicitationWindowDays?: number;
  requiredDisclosures: string[];
  prohibitedPractices: string[];
  contractTemplateVersion?: string;
  filingRequirements: Record<string, unknown>;
  judicialFilingRequired: boolean;
  statuteReference?: string;
  notes?: string;
  verificationStatus: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationEvidence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  caseId?: string;
  claimantId?: string;
  docType: string;
  docCategory: string;
  filename: string;
  mimeType: string;
  fileSize?: number;
  storageKey: string;
  storageBucket: string;
  encryptionKeyId?: string;
  checksumSha256?: string;
  isSensitive: boolean;
  retentionUntil?: string;
  uploadedBy?: string;
  version: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  caseId: string;
  claimantId: string;
  payoutAmount: number;
  feePercent: number;
  feeCap?: number;
  calculatedFee: number;
  finalFee: number;
  status: InvoiceStatus;
  issuedAt?: string;
  dueDate?: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  documentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  caseId?: string;
  details?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

export interface AttorneyAssignment {
  id: string;
  caseId: string;
  attorneyId: string;
  status: AttorneyAssignmentStatus;
  routingReason: AttorneyRoutingReason;
  dossierDocId?: string;
  acceptedAt?: string;
  filedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Rule Evaluation ---

export type RuleEvalResult = 'ALLOWED' | 'ALLOWED_WITH_CONSTRAINTS' | 'BLOCKED';

export interface RuleConstraint {
  field: string;
  constraint: string;
  enforcedValue?: string | number | boolean;
  reason: string;
}

export interface RuleEvaluation {
  result: RuleEvalResult;
  jurisdictionKey: string;
  sourceType: SourceType;
  rule?: JurisdictionRule;
  constraints: RuleConstraint[];
  warnings: string[];
  blockedReasons: string[];
  verificationStatus: VerificationStatus;
}

export interface RuleEvalInput {
  sourceType: SourceType;
  jurisdictionKey: string;
  state: string;
  county?: string;
  configuredFeePercent: number;
  solicitationDate?: string;
  contractDate?: string;
  opportunitySurplusDate?: string;
}

// --- Outreach ---

export interface OutreachMergeData {
  claimantFirstName: string;
  claimantLastName: string;
  claimantFullName: string;
  claimantAddress?: string;
  claimantCity?: string;
  claimantState?: string;
  claimantZip?: string;
  claimantEmail?: string;
  propertyDescription?: string;
  reportedAmount?: string;
  holderName?: string;
  jurisdictionState: string;
  jurisdictionCounty?: string;
  caseNumber: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  optOutUrl: string;
  optOutPhone: string;
  freeFilingUrl?: string;
  feePercent?: string;
  todayDate: string;
  // Jurisdiction-specific disclosure flags
  disclosures: {
    freeFilingDisclosure: boolean;
    feeDisclosure: boolean;
    noLegalAdviceDisclosure: boolean;
    rescissionDisclosure: boolean;
    stateSpecificDisclosures: string[];
  };
}

// --- Contract Merge ---

export interface ContractMergeData {
  caseNumber: string;
  effectiveDate: string;
  // Company
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  // Claimant
  claimantFullName: string;
  claimantAddress: string;
  claimantCity: string;
  claimantState: string;
  claimantZip: string;
  claimantEmail?: string;
  claimantPhone?: string;
  // Claim details
  sourceType: SourceType;
  jurisdictionState: string;
  jurisdictionCounty?: string;
  propertyDescription: string;
  reportedAmount: string;
  holderName?: string;
  // Fee
  feePercent: string;
  feeCap?: string;
  // Jurisdiction flags (from rule engine)
  coolingOffDays: number;
  rescissionDeadline: string;
  notarizationRequired: boolean;
  assignmentAllowed: boolean;
  requiredDisclosures: string[];
  // Conditional sections
  showAssignmentAddendum: boolean;
  showNotaryPage: boolean;
  showAttorneyConsent: boolean;
  freeFilingUrl?: string;
}

// --- API Responses ---

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// --- Auth ---

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
