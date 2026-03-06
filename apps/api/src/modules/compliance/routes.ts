// ============================================================
// SurplusFlow AI — Compliance / Rules Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { evaluateJurisdiction } from '@surplusflow/rules';
import type { RuleEvalInput, JurisdictionRule } from '@surplusflow/shared';
import { query } from '../../lib/db.js';

export async function complianceRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { state, sourceType, verificationStatus, page: rawPage, pageSize: rawPageSize } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (state) {
      conditions.push(`state = $${paramIdx++}`);
      params.push(state);
    }
    if (sourceType) {
      conditions.push(`source_type = $${paramIdx++}`);
      params.push(sourceType);
    }
    if (verificationStatus) {
      conditions.push(`verification_status = $${paramIdx++}`);
      params.push(verificationStatus);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM jurisdiction_rules ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM jurisdiction_rules ${where}
       ORDER BY state, source_type, effective_date DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSize, offset],
    );

    return reply.send({
      data: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(`SELECT * FROM jurisdiction_rules WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Jurisdiction rule not found' });
    }

    return reply.send(result.rows[0]);
  });

  app.post('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const result = await query(
      `INSERT INTO jurisdiction_rules (
        jurisdiction_key, state, county, source_type,
        effective_date, expiration_date, max_fee_percent, fee_cap_amount,
        cooling_off_days, notarization_required, assignment_allowed,
        license_required, bond_required, bond_amount,
        solicitation_restricted, solicitation_window_days,
        required_disclosures, prohibited_practices,
        contract_template_version, filing_requirements,
        judicial_filing_required, statute_reference, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) RETURNING *`,
      [
        body.jurisdictionKey, body.state, body.county ?? null, body.sourceType,
        body.effectiveDate, body.expirationDate ?? null, body.maxFeePercent, body.feeCapAmount ?? null,
        body.coolingOffDays ?? null, body.notarizationRequired ?? false, body.assignmentAllowed ?? true,
        body.licenseRequired ?? false, body.bondRequired ?? false, body.bondAmount ?? null,
        body.solicitationRestricted ?? false, body.solicitationWindowDays ?? null,
        body.requiredDisclosures ? JSON.stringify(body.requiredDisclosures) : null,
        body.prohibitedPractices ? JSON.stringify(body.prohibitedPractices) : null,
        body.contractTemplateVersion ?? null, body.filingRequirements ? JSON.stringify(body.filingRequirements) : null,
        body.judicialFilingRequired ?? false, body.statuteReference ?? null, body.notes ?? null,
      ],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_CREATED, resourceType: 'jurisdiction_rule',
      resourceId: result.rows[0].id, details: body,
    });

    return reply.status(201).send({ message: 'Rule created', rule: result.rows[0] });
  });

  app.patch('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    // Map camelCase body keys to snake_case columns
    const fieldMap: Record<string, string> = {
      jurisdictionKey: 'jurisdiction_key', state: 'state', county: 'county',
      sourceType: 'source_type', effectiveDate: 'effective_date',
      expirationDate: 'expiration_date', maxFeePercent: 'max_fee_percent',
      feeCapAmount: 'fee_cap_amount', coolingOffDays: 'cooling_off_days',
      notarizationRequired: 'notarization_required', assignmentAllowed: 'assignment_allowed',
      licenseRequired: 'license_required', bondRequired: 'bond_required',
      bondAmount: 'bond_amount', solicitationRestricted: 'solicitation_restricted',
      solicitationWindowDays: 'solicitation_window_days',
      requiredDisclosures: 'required_disclosures', prohibitedPractices: 'prohibited_practices',
      contractTemplateVersion: 'contract_template_version',
      filingRequirements: 'filing_requirements', judicialFilingRequired: 'judicial_filing_required',
      statuteReference: 'statute_reference', notes: 'notes',
    };

    const jsonFields = new Set(['required_disclosures', 'prohibited_practices', 'filing_requirements']);
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(body)) {
      const col = fieldMap[key];
      if (!col) continue;
      sets.push(`${col} = $${paramIdx++}`);
      params.push(jsonFields.has(col) && value !== null ? JSON.stringify(value) : value);
    }

    if (params.length === 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No valid fields to update' });
    }

    params.push(id);
    const result = await query(
      `UPDATE jurisdiction_rules SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Jurisdiction rule not found' });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_UPDATED, resourceType: 'jurisdiction_rule', resourceId: id, details: body,
    });

    return reply.send({ message: 'Rule updated', rule: result.rows[0] });
  });

  // POST /rules/evaluate — Evaluate rules for given inputs
  app.post('/evaluate', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const input = request.body as RuleEvalInput;

    // Fetch rules from DB for the given jurisdiction
    const rulesResult = await query(
      `SELECT * FROM jurisdiction_rules
       WHERE jurisdiction_key = $1
         AND (expiration_date IS NULL OR expiration_date > NOW())
       ORDER BY effective_date DESC`,
      [input.jurisdictionKey],
    );

    const allRules: JurisdictionRule[] = rulesResult.rows;
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

    const result = await query(
      `UPDATE jurisdiction_rules
       SET verification_status = 'VERIFIED',
           verified_by = $1,
           verified_at = NOW(),
           verification_evidence = $2,
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [request.user!.sub, evidence, notes ?? null, id],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Jurisdiction rule not found' });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.RULE_VERIFIED, resourceType: 'jurisdiction_rule', resourceId: id,
      details: { evidence, notes, verifiedBy: request.user!.sub },
    });
    return reply.send({ message: 'Rule verified', rule: result.rows[0] });
  });

  // POST /rules/import — Bulk import from CSV (keep as stub)
  app.post('/import', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    // Parse CSV and upsert rules — requires BullMQ job
    return reply.send({ message: 'Import queued', jobId: 'job-placeholder' });
  });
}
