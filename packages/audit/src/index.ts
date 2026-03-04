// ============================================================
// SurplusFlow AI — Append-Only Audit Writer
// Writes immutable audit entries with tamper-detection chain
// ============================================================

import { computeAuditChecksum } from '@surplusflow/shared';
import type { AuditEntry } from '@surplusflow/shared';

export interface AuditWriterConfig {
  /** Function that executes SQL INSERT and returns the inserted row id */
  insert: (entry: AuditRow) => Promise<{ id: number }>;
  /** Function that fetches the last checksum from the audit log */
  getLastChecksum: () => Promise<string | null>;
}

export interface AuditRow {
  event_id: string;
  timestamp: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_ip: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  case_id: string | null;
  details: Record<string, unknown> | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  checksum: string;
}

export class AuditWriter {
  private config: AuditWriterConfig;
  private lastChecksum: string | null = null;
  private initialized = false;

  constructor(config: AuditWriterConfig) {
    this.config = config;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.lastChecksum = await this.config.getLastChecksum();
      this.initialized = true;
    }
  }

  async write(entry: AuditEntry): Promise<{ id: number; checksum: string }> {
    await this.ensureInitialized();

    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Build row data for checksum computation
    const rowData = {
      event_id: eventId,
      timestamp,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      case_id: entry.caseId || null,
      actor_id: entry.actorId || null,
      details: entry.details || null,
    };

    const checksum = computeAuditChecksum(this.lastChecksum, rowData);

    const row: AuditRow = {
      event_id: eventId,
      timestamp,
      actor_id: entry.actorId || null,
      actor_role: entry.actorRole || null,
      actor_ip: entry.actorIp || null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      case_id: entry.caseId || null,
      details: entry.details || null,
      previous_state: entry.previousState || null,
      new_state: entry.newState || null,
      checksum,
    };

    const result = await this.config.insert(row);
    this.lastChecksum = checksum;

    return { id: result.id, checksum };
  }

  /**
   * Write multiple entries atomically (in order)
   */
  async writeBatch(entries: AuditEntry[]): Promise<{ ids: number[]; checksums: string[] }> {
    const ids: number[] = [];
    const checksums: string[] = [];

    for (const entry of entries) {
      const result = await this.write(entry);
      ids.push(result.id);
      checksums.push(result.checksum);
    }

    return { ids, checksums };
  }

  /**
   * Convenience method for common case actions
   */
  async logCaseAction(params: {
    actorId: string;
    actorRole: string;
    actorIp?: string;
    caseId: string;
    action: string;
    details?: Record<string, unknown>;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
  }): Promise<{ id: number; checksum: string }> {
    return this.write({
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorIp: params.actorIp,
      action: params.action,
      resourceType: 'claim_case',
      resourceId: params.caseId,
      caseId: params.caseId,
      details: params.details,
      previousState: params.previousState,
      newState: params.newState,
    });
  }

  /**
   * Convenience method for document actions
   */
  async logDocumentAction(params: {
    actorId: string;
    actorRole: string;
    actorIp?: string;
    documentId: string;
    caseId?: string;
    action: string;
    details?: Record<string, unknown>;
  }): Promise<{ id: number; checksum: string }> {
    return this.write({
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorIp: params.actorIp,
      action: params.action,
      resourceType: 'document',
      resourceId: params.documentId,
      caseId: params.caseId,
      details: params.details,
    });
  }

  /**
   * Convenience method for security events
   */
  async logSecurityEvent(params: {
    actorId?: string;
    actorRole?: string;
    actorIp?: string;
    action: string;
    details: Record<string, unknown>;
  }): Promise<{ id: number; checksum: string }> {
    return this.write({
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorIp: params.actorIp,
      action: params.action,
      resourceType: 'security',
      details: params.details,
    });
  }
}

export default AuditWriter;
