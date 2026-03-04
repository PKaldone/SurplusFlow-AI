// ============================================================
// SurplusFlow AI — Shared Constants
// ============================================================

export const COMPANY = {
  name: 'SurplusFlow Recovery Services, LLC',
  address: '{{COMPANY_ADDRESS}}',
  phone: '{{COMPANY_PHONE}}',
  email: 'claims@surplusflow.com',
  website: 'https://www.surplusflow.com',
  optOutUrl: 'https://www.surplusflow.com/opt-out',
  optOutPhone: '{{COMPANY_OPT_OUT_PHONE}}',
} as const;

export const CASE_NUMBER_PREFIX = 'SF';

export const MAX_OUTREACH_TOUCHES = 3;

export const OUTREACH_INTERVALS_DAYS = {
  touch1_to_touch2: 14,
  touch2_to_touch3: 21,
} as const;

export const DEFAULT_FEE_PERCENT = 33;

export const DOCUMENT_TYPES = {
  // Identity
  ID_FRONT: 'id_front',
  ID_BACK: 'id_back',
  SSN_CARD: 'ssn_card',
  // Legal
  DEATH_CERTIFICATE: 'death_cert',
  PROBATE_LETTER: 'probate_letter',
  POWER_OF_ATTORNEY: 'power_of_attorney',
  DEED: 'deed',
  // Contracts
  CONTRACT: 'contract',
  DISCLOSURE: 'disclosure',
  ASSIGNMENT: 'assignment',
  NOTARY_PAGE: 'notary_page',
  ATTORNEY_CONSENT: 'attorney_consent',
  // Generated
  CLAIM_PACKET: 'claim_packet',
  DOSSIER: 'dossier',
  INVOICE: 'invoice',
  OUTREACH_LETTER: 'outreach_letter',
  // Financial
  PAYOUT_CONFIRMATION: 'payout_confirmation',
} as const;

export const DOCUMENT_CATEGORIES = {
  IDENTITY: 'identity',
  LEGAL: 'legal',
  FINANCIAL: 'financial',
  CORRESPONDENCE: 'correspondence',
  GENERATED: 'generated',
} as const;

export const SENSITIVE_DOC_TYPES = [
  'id_front', 'id_back', 'ssn_card',
] as const;

export const STORAGE_BUCKETS = {
  DOCUMENTS: 'surplusflow-documents',
  SENSITIVE: 'surplusflow-sensitive',
  GENERATED: 'surplusflow-generated',
} as const;

export const RETENTION_YEARS = {
  identity: 7,
  contracts: 99,   // effectively permanent
  generated: 7,
  correspondence: 3,
} as const;

export const QUEUES = {
  INGESTION: 'ingestion',
  MATCHING: 'matching',
  OUTREACH: 'outreach',
  DOCGEN: 'docgen',
  COMPLIANCE: 'compliance',
  NOTIFICATIONS: 'notifications',
  FOLLOWUPS: 'followups',
} as const;

export const AUDIT_ACTIONS = {
  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_MAGIC_LINK_SENT: 'auth.magic_link_sent',
  AUTH_MFA_VERIFIED: 'auth.mfa_verified',
  AUTH_FAILED_LOGIN: 'auth.failed_login',
  // User
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ROLE_CHANGED: 'user.role_changed',
  // Case
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  CASE_ASSIGNED: 'case.assigned',
  CASE_ATTORNEY_ROUTED: 'case.attorney_routed',
  CASE_NOTE_ADDED: 'case.note_added',
  // Document
  DOC_UPLOADED: 'doc.uploaded',
  DOC_DOWNLOADED: 'doc.downloaded',
  DOC_DELETED: 'doc.deleted',
  DOC_VIEWED: 'doc.viewed',
  // Contract
  CONTRACT_GENERATED: 'contract.generated',
  CONTRACT_SIGNED: 'contract.signed',
  CONTRACT_RESCINDED: 'contract.rescinded',
  // Outreach
  OUTREACH_CREATED: 'outreach.created',
  OUTREACH_APPROVED: 'outreach.approved',
  OUTREACH_SENT: 'outreach.sent',
  OUTREACH_OPTED_OUT: 'outreach.opted_out',
  // Rule
  RULE_CREATED: 'rule.created',
  RULE_UPDATED: 'rule.updated',
  RULE_VERIFIED: 'rule.verified',
  RULE_EVALUATED: 'rule.evaluated',
  // Billing
  INVOICE_CREATED: 'invoice.created',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAID: 'invoice.paid',
  PAYOUT_CONFIRMED: 'payout.confirmed',
  // Compliance
  COMPLIANCE_HOLD_PLACED: 'compliance.hold_placed',
  COMPLIANCE_HOLD_RELEASED: 'compliance.hold_released',
  COMPLIANCE_RULE_BLOCKED: 'compliance.rule_blocked',
  // Attorney
  ATTORNEY_ASSIGNED: 'attorney.assigned',
  ATTORNEY_ACCEPTED: 'attorney.accepted',
  ATTORNEY_FILED: 'attorney.filed',
  ATTORNEY_COMPLETED: 'attorney.completed',
  // System
  SYSTEM_JOB_STARTED: 'system.job_started',
  SYSTEM_JOB_COMPLETED: 'system.job_completed',
  SYSTEM_JOB_FAILED: 'system.job_failed',
  SYSTEM_EXPORT_REQUESTED: 'system.export_requested',
  // Security
  SECURITY_SENSITIVE_ACCESS: 'security.sensitive_access',
  SECURITY_PERMISSION_DENIED: 'security.permission_denied',
  SECURITY_UNUSUAL_ACTIVITY: 'security.unusual_activity',
} as const;
