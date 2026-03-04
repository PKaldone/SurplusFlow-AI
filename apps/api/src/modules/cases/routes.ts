// ============================================================
// SurplusFlow AI — Cases Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { canTransition, AUDIT_ACTIONS } from '@surplusflow/shared';
import type { CaseStatus } from '@surplusflow/shared';

export async function caseRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page = 1, pageSize = 25, status, jurisdictionKey, assignedTo, state } = request.query as Record<string, string>;
    return reply.send({ data: [], total: 0, page: Number(page), pageSize: Number(pageSize), totalPages: 0 });
  });

  app.post('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    await request.logAudit({ action: AUDIT_ACTIONS.CASE_CREATED, resourceType: 'claim_case', details: { body } });
    return reply.status(201).send({ message: 'Case created', id: 'new-case-id' });
  });

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops', 'compliance', 'attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ id, status: 'PROSPECT' });
  });

  app.patch('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    await request.logAudit({ action: 'case.updated', resourceType: 'claim_case', resourceId: id, caseId: id, details: body });
    return reply.send({ message: 'Case updated', id });
  });

  app.post('/:id/transition', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toStatus, reason } = request.body as { toStatus: CaseStatus; reason?: string };
    const currentStatus: CaseStatus = 'PROSPECT';

    if (!canTransition(currentStatus, toStatus)) {
      return reply.status(400).send({
        statusCode: 400, error: 'Invalid Transition',
        message: `Cannot transition from ${currentStatus} to ${toStatus}`,
      });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.CASE_STATUS_CHANGED, resourceType: 'claim_case', resourceId: id, caseId: id,
      previousState: { status: currentStatus }, newState: { status: toStatus }, details: { reason },
    });
    return reply.send({ message: `Case transitioned to ${toStatus}`, previousStatus: currentStatus, newStatus: toStatus });
  });

  app.get('/:id/timeline', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ caseId: id, events: [] });
  });

  app.get('/:id/documents', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops', 'compliance', 'attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ caseId: id, documents: [] });
  });

  app.get('/:id/checklist', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const checklist = [
      { docType: 'id_front', label: 'Government Photo ID (Front)', status: 'missing', required: true },
      { docType: 'id_back', label: 'Government Photo ID (Back)', status: 'missing', required: true },
      { docType: 'contract', label: 'Signed Agreement', status: 'missing', required: true },
      { docType: 'disclosure', label: 'Signed Disclosure', status: 'missing', required: true },
      { docType: 'claim_form', label: 'State Claim Form', status: 'missing', required: true },
    ];
    return reply.send({ caseId: id, checklist });
  });

  app.post('/:id/assign-attorney', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { attorneyId, routingReason } = request.body as { attorneyId: string; routingReason: string };
    await request.logAudit({
      action: AUDIT_ACTIONS.CASE_ATTORNEY_ROUTED, resourceType: 'claim_case', resourceId: id, caseId: id,
      details: { attorneyId, routingReason },
    });
    return reply.send({ message: 'Attorney assigned', caseId: id, attorneyId });
  });

  app.post('/:id/generate-packet', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Enqueue docgen job on BullMQ
    return reply.send({ message: 'Packet generation queued', caseId: id, jobId: 'job-placeholder' });
  });

  app.post('/:id/generate-dossier', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ message: 'Dossier generation queued', caseId: id, jobId: 'job-placeholder' });
  });
}
