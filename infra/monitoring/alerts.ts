// ============================================================
// SurplusFlow AI — Monitoring Configuration
// Alert definitions and metric thresholds
// ============================================================

export interface AlertRule {
  name: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  metric: string;
  condition: string;
  threshold: number | string;
  window: string;
  notify: string[];
  description: string;
}

export const ALERT_RULES: AlertRule[] = [
  // P1 — Critical
  {
    name: 'audit_chain_integrity_failure',
    severity: 'P1',
    metric: 'audit.chain_integrity_check',
    condition: 'equals',
    threshold: 'FAILED',
    window: 'immediate',
    notify: ['security-oncall', 'cto'],
    description: 'Audit log chain integrity verification failed — possible tampering',
  },
  {
    name: 'high_5xx_rate',
    severity: 'P1',
    metric: 'http.5xx_rate',
    condition: 'greater_than',
    threshold: 0.05,
    window: '5m',
    notify: ['engineering-oncall'],
    description: 'API 5xx error rate exceeded 5% over 5 minutes',
  },
  {
    name: 'sensitive_access_by_unauthorized_role',
    severity: 'P1',
    metric: 'audit.sensitive_access_unauthorized',
    condition: 'greater_than',
    threshold: 0,
    window: 'immediate',
    notify: ['security-oncall', 'compliance'],
    description: 'Sensitive document accessed by user without compliance/super_admin role',
  },

  // P2 — High
  {
    name: 'failed_login_spike',
    severity: 'P2',
    metric: 'auth.failed_logins_per_ip',
    condition: 'greater_than',
    threshold: 10,
    window: '15m',
    notify: ['security-oncall'],
    description: 'More than 10 failed login attempts from single IP in 15 minutes',
  },
  {
    name: 'job_queue_stalled',
    severity: 'P2',
    metric: 'queue.stalled_jobs',
    condition: 'greater_than',
    threshold: 5,
    window: '30m',
    notify: ['engineering-oncall'],
    description: 'More than 5 stalled jobs detected in worker queues',
  },
  {
    name: 'magic_link_brute_force',
    severity: 'P2',
    metric: 'auth.magic_link_requests_per_email',
    condition: 'greater_than',
    threshold: 20,
    window: '1h',
    notify: ['security-oncall'],
    description: 'Excessive magic link requests for single email — possible brute force',
  },

  // P3 — Medium
  {
    name: 'high_response_time',
    severity: 'P3',
    metric: 'http.p95_response_time_ms',
    condition: 'greater_than',
    threshold: 2000,
    window: '10m',
    notify: ['engineering-oncall'],
    description: 'API p95 response time exceeded 2 seconds',
  },
  {
    name: 'queue_depth_high',
    severity: 'P3',
    metric: 'queue.depth',
    condition: 'greater_than',
    threshold: 1000,
    window: '15m',
    notify: ['engineering-oncall'],
    description: 'Queue depth exceeded 1000 jobs',
  },
  {
    name: 'db_pool_utilization',
    severity: 'P3',
    metric: 'db.pool_utilization_pct',
    condition: 'greater_than',
    threshold: 80,
    window: '5m',
    notify: ['engineering-oncall'],
    description: 'Database connection pool utilization above 80%',
  },
  {
    name: 'job_failure_rate',
    severity: 'P3',
    metric: 'queue.failure_rate',
    condition: 'greater_than',
    threshold: 0.05,
    window: '1h',
    notify: ['engineering-oncall'],
    description: 'Job failure rate exceeded 5% over 1 hour',
  },

  // P4 — Low
  {
    name: 'audit_export_requested',
    severity: 'P4',
    metric: 'audit.export_requested',
    condition: 'greater_than',
    threshold: 0,
    window: 'immediate',
    notify: ['compliance', 'security-oncall'],
    description: 'Audit log export requested — informational alert',
  },
  {
    name: 'unusual_document_upload_volume',
    severity: 'P4',
    metric: 'documents.uploads_per_hour',
    condition: 'greater_than',
    threshold: 100,
    window: '1h',
    notify: ['engineering-oncall'],
    description: 'Unusual document upload volume detected',
  },
  {
    name: 'blocked_case_transition_attempted',
    severity: 'P4',
    metric: 'case.blocked_transition_attempts',
    condition: 'greater_than',
    threshold: 5,
    window: '1h',
    notify: ['engineering-oncall'],
    description: 'Multiple blocked case transition attempts — possible UI/integration issue',
  },
];

// --- Health Check Endpoints ---

export const HEALTH_CHECKS = {
  api: '/health',
  database: '/health/db',
  redis: '/health/redis',
  minio: '/health/storage',
  queues: '/health/queues',
};

// --- Log Retention ---

export const LOG_RETENTION = {
  application_logs: '90 days in hot storage, 2 years in warm, 7 years cold',
  audit_logs: '7 years minimum, never deleted',
  access_logs: '2 years',
  error_logs: '1 year in hot storage',
};
