// ============================================================
// SurplusFlow AI — Compliance / Rules Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { evaluateJurisdiction } from '@surplusflow/rules';
import type { RuleEvalInput, JurisdictionRule } from '@surplusflow/shared';

export async function complianceRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { state: _state, sourceType: _sourceType, verificationStatus: _verificationStatus } = request.query as Record<string, string>;
    return reply.send({ data: [], total: 0 });
  });

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ id });
  });

  app.post('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_CREATED, resourceType: 'jurisdiction_rule', details: body,
    });
    return reply.status(201).send({ message: 'Rule created', id: 'rule-id' });
  });

  app.patch('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_UPDATED, resourceType: 'jurisdiction_rule', resourceId: id, details: body,
    });
    return reply.send({ message: 'Rule updated', id });
  });

  // POST /rules/evaluate — Evaluate rules for given inputs
  app.post('/evaluate', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const input = request.body as RuleEvalInput;
    // In production: fetch rules from DB
    const allRules: JurisdictionRule[] = []; // placeholder — load from DB
    const evaluation = evaluateJurisdiction(input, allRules);

    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_EVALUATED, resourceType: 'jurisdiction_rule',
      details: { input, result: evaluation.result },
    });
    return reply.send(evaluation);
  });

  // POST /rules/:id/verify — Mark rule as verified
  app.post('/:id/verify', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { evidence, notes } = request.body as { evidence: string; notes?: string };

    if (!evidence) {
      return reply.status(400).send({ message: 'Verification evidence (statute link or legal memo reference) is required' });
    }

    // In production:
    // 1. Update jurisdiction_rules SET verification_status='VERIFIED', verified_by, verified_at, verification_evidence
    // 2. Only compliance role can verify
    // 3. Audit log

    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_VERIFIED, resourceType: 'jurisdiction_rule', resourceId: id,
      details: { evidence, notes, verifiedBy: request.user!.sub },
    });
    return reply.send({ message: 'Rule verified', id, verificationStatus: 'VERIFIED' });
  });

  // POST /rules/import — Bulk import from CSV
  app.post('/import', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    // Parse CSV and upsert rules
    return reply.send({ message: 'Import queued', jobId: 'job-placeholder' });
  });
}
