// ============================================================
// SurplusFlow AI — Admin Routes (Users, Audit, System)
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';

export async function adminRoutes(app: FastifyInstance) {
  // --- User Management ---
  app.get('/users', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    return reply.send({ data: [], total: 0 });
  });

  app.post('/users', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    await request.logAudit({ action: AUDIT_ACTIONS.USER_CREATED, resourceType: 'user', details: body });
    return reply.status(201).send({ message: 'User created' });
  });

  app.patch('/users/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    await request.logAudit({ action: AUDIT_ACTIONS.USER_UPDATED, resourceType: 'user', resourceId: id, details: body });
    return reply.send({ message: 'User updated', id });
  });

  app.delete('/users/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await request.logAudit({ action: AUDIT_ACTIONS.USER_DEACTIVATED, resourceType: 'user', resourceId: id });
    return reply.send({ message: 'User deactivated', id });
  });

  // --- Audit Log ---
  app.get('/audit', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { page: _page, pageSize: _pageSize, action: _action, resourceType: _resourceType, actorId: _actorId, startDate: _startDate, endDate: _endDate } = request.query as Record<string, string>;
    return reply.send({ data: [], total: 0 });
  });

  app.get('/audit/case/:caseId', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'compliance'])],
  }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    return reply.send({ caseId, events: [] });
  });

  app.get('/audit/export', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    await request.logAudit({
      action: AUDIT_ACTIONS.SYSTEM_EXPORT_REQUESTED, resourceType: 'audit_log',
      details: { exportType: 'audit_log', requestedBy: request.user!.sub },
    });
    return reply.send({ message: 'Export queued', jobId: 'export-job-placeholder' });
  });

  // --- Claimant Management ---
  app.get('/claimants', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    return reply.send({ data: [], total: 0 });
  });

  app.post('/claimants', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    return reply.status(201).send({ message: 'Claimant created', id: 'claimant-id' });
  });
}
