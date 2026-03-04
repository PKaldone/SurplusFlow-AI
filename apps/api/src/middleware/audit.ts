// ============================================================
// SurplusFlow AI — Audit Middleware Plugin
// Provides audit logging capability to all routes
// ============================================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AuditWriter } from '@surplusflow/audit';
import type { AuditEntry } from '@surplusflow/shared';

async function auditPluginImpl(app: FastifyInstance) {
  // Initialize audit writer with database functions
  // In production, these would use the actual DB pool
  const auditWriter = new AuditWriter({
    insert: async (entry) => {
      // In production: INSERT INTO audit_log ... RETURNING id
      // For now, log to structured logger
      app.log.info({ audit: true, ...entry }, 'AUDIT_EVENT');
      return { id: Date.now() }; // placeholder
    },
    getLastChecksum: async () => {
      // In production: SELECT checksum FROM audit_log ORDER BY id DESC LIMIT 1
      return null;
    },
  });

  // Make audit writer available on all requests
  app.decorate('audit', auditWriter);

  // Convenience method to log from request context
  app.decorateRequest('logAudit', function (this: FastifyRequest, entry: Omit<AuditEntry, 'actorId' | 'actorRole' | 'actorIp'>) {
    return auditWriter.write({
      ...entry,
      actorId: this.user?.sub,
      actorRole: this.user?.role,
      actorIp: this.ip,
    });
  });
}

export const auditPlugin = fp(auditPluginImpl, {
  name: 'audit',
  dependencies: ['auth'],
});

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditWriter;
  }
  interface FastifyRequest {
    logAudit: (entry: Omit<AuditEntry, 'actorId' | 'actorRole' | 'actorIp'>) => Promise<{ id: number; checksum: string }>;
  }
}
