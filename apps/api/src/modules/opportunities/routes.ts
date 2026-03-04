// ============================================================
// SurplusFlow AI — Opportunities Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';

export async function opportunityRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    return reply.send({ data: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
  });

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ id });
  });

  app.post('/import', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    // Enqueue ingestion job
    return reply.send({ message: 'Import job queued', jobId: 'job-placeholder' });
  });

  app.patch('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ message: 'Opportunity updated', id });
  });

  app.post('/:id/qualify', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ id, qualified: true });
  });

  app.get('/:id/rule-check', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Run evaluateJurisdiction from rules engine
    return reply.send({ id, ruleCheck: { result: 'ALLOWED_WITH_CONSTRAINTS', constraints: [], warnings: [] } });
  });
}
