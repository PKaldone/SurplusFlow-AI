// ============================================================
// SurplusFlow AI — Outreach Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { validateApproval } from '@surplusflow/contracts/src/outreach.js';

export async function outreachRoutes(app: FastifyInstance) {
  app.get('/campaigns', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    return reply.send({ data: [], total: 0 });
  });

  app.post('/campaigns', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_CREATED, resourceType: 'outreach_campaign', details: body,
    });
    return reply.status(201).send({ message: 'Campaign created', id: 'campaign-id' });
  });

  app.post('/campaigns/:id/approve', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const payload = { ...body, campaignId: id, approvedBy: request.user!.sub };

    const validation = validateApproval(payload as Parameters<typeof validateApproval>[0]);
    if (!validation.valid) {
      return reply.status(400).send({ statusCode: 400, error: 'Approval Incomplete', message: 'All approval checkboxes must be confirmed', details: validation.errors });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_APPROVED, resourceType: 'outreach_campaign', resourceId: id, details: payload,
    });
    return reply.send({ message: 'Campaign approved', id });
  });

  app.post('/campaigns/:id/send', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Enqueue outreach send jobs
    return reply.send({ message: 'Campaign send initiated', id });
  });

  app.get('/records', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    return reply.send({ data: [], total: 0 });
  });

  // Public opt-out endpoint
  app.post('/opt-out', async (request, reply) => {
    const { identifier, identifierType, caseNumber } = request.body as { identifier: string; identifierType: string; caseNumber?: string };

    // In production:
    // 1. Add to suppression_list
    // 2. Update claimant do_not_contact
    // 3. Cancel any pending outreach
    // 4. Audit log

    await app.audit.write({
      action: AUDIT_ACTIONS.OUTREACH_OPTED_OUT,
      resourceType: 'suppression_list',
      details: { identifier: identifier.substring(0, 3) + '***', identifierType, caseNumber },
    });

    return reply.send({ message: 'You have been removed from our contact list. You will not receive further communications.' });
  });
}
