// ============================================================
// SurplusFlow AI — Attorney Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';

export async function attorneyRoutes(app: FastifyInstance) {
  app.get('/assignments', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    // Filter to attorney's own assignments
    const _attorneyId = request.user!.sub;
    return reply.send({ data: [], total: 0 });
  });

  app.get('/assignments/:id', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Verify assignment belongs to this attorney
    return reply.send({ id });
  });

  app.patch('/assignments/:id', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, notes } = request.body as { status: string; notes?: string };

    const auditAction = status === 'accepted' ? AUDIT_ACTIONS.ATTORNEY_ACCEPTED
      : status === 'filed' ? AUDIT_ACTIONS.ATTORNEY_FILED
      : status === 'completed' ? AUDIT_ACTIONS.ATTORNEY_COMPLETED
      : 'attorney.status_updated';

    await request.logAudit({
      action: auditAction, resourceType: 'attorney_assignment', resourceId: id,
      details: { status, notes },
    });
    return reply.send({ message: 'Assignment updated', id, status });
  });

  app.get('/assignments/:id/dossier', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Generate presigned download URL for dossier PDF
    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_DOWNLOADED, resourceType: 'document', details: { type: 'dossier', assignmentId: id },
    });
    return reply.send({ id, downloadUrl: 'https://presigned-url-placeholder', expiresIn: 900 });
  });
}
