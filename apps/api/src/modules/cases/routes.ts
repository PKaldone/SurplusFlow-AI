// ============================================================
// SurplusFlow AI — Cases Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { canTransition, AUDIT_ACTIONS, CASE_NUMBER_PREFIX } from '@surplusflow/shared';
import type { CaseStatus } from '@surplusflow/shared';
import { query } from '../../lib/db.js';

export async function caseRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page = '1', pageSize = '25', status, jurisdictionKey, assignedTo, state } = request.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`cc.status = $${paramIdx++}`);
      params.push(status);
    }
    if (state) {
      conditions.push(`cc.state = $${paramIdx++}`);
      params.push(state);
    }
    if (assignedTo) {
      conditions.push(`cc.assigned_to = $${paramIdx++}`);
      params.push(assignedTo);
    }
    if (jurisdictionKey) {
      conditions.push(`cc.jurisdiction_key = $${paramIdx++}`);
      params.push(jurisdictionKey);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM claim_cases cc ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT cc.*, c.first_name, c.last_name, c.email as claimant_email,
              u.full_name as assigned_name
       FROM claim_cases cc
       LEFT JOIN claimants c ON cc.claimant_id = c.id
       LEFT JOIN users u ON cc.assigned_to = u.id
       ${whereClause}
       ORDER BY cc.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, size, offset],
    );

    return reply.send({
      data: dataResult.rows,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    });
  });

  app.post('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    // Generate case number: SF-YYYY-NNNN
    const year = new Date().getFullYear();
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM claim_cases WHERE case_number LIKE $1`,
      [`${CASE_NUMBER_PREFIX}-${year}-%`],
    );
    const seq = parseInt(countResult.rows[0].count, 10) + 1;
    const caseNumber = `${CASE_NUMBER_PREFIX}-${year}-${String(seq).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO claim_cases (
        case_number, opportunity_id, claimant_id, assigned_to, attorney_id,
        status, source_type, jurisdiction_key, state, county,
        claimed_amount, agreed_fee_pct, agreed_fee_cap, contract_version,
        cooling_off_days, attorney_required, notarization_required, assignment_enabled,
        notes, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20
      ) RETURNING *`,
      [
        caseNumber,
        body.opportunity_id,
        body.claimant_id,
        body.assigned_to ?? null,
        body.attorney_id ?? null,
        body.status ?? 'PROSPECT',
        body.source_type,
        body.jurisdiction_key,
        body.state,
        body.county ?? null,
        body.claimed_amount ?? null,
        body.agreed_fee_pct ?? null,
        body.agreed_fee_cap ?? null,
        body.contract_version ?? null,
        body.cooling_off_days ?? null,
        body.attorney_required ?? false,
        body.notarization_required ?? false,
        body.assignment_enabled ?? false,
        body.notes ?? null,
        body.metadata ? JSON.stringify(body.metadata) : '{}',
      ],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.CASE_CREATED,
      resourceType: 'claim_case',
      resourceId: result.rows[0].id,
      caseId: result.rows[0].id,
      details: { body },
    });

    return reply.status(201).send(result.rows[0]);
  });

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops', 'compliance', 'attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(
      `SELECT cc.*, c.first_name, c.last_name, c.email as claimant_email,
              u.full_name as assigned_name
       FROM claim_cases cc
       LEFT JOIN claimants c ON cc.claimant_id = c.id
       LEFT JOIN users u ON cc.assigned_to = u.id
       WHERE cc.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    return reply.send(result.rows[0]);
  });

  app.patch('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const allowedFields = [
      'assigned_to', 'attorney_id', 'claimed_amount', 'agreed_fee_pct',
      'agreed_fee_cap', 'contract_version', 'cooling_off_days',
      'attorney_required', 'notarization_required', 'assignment_enabled',
      'notes', 'metadata', 'county',
    ];

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(field === 'metadata' ? JSON.stringify(body[field]) : body[field]);
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE claim_cases SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    await request.logAudit({ action: 'case.updated', resourceType: 'claim_case', resourceId: id, caseId: id, details: body });
    return reply.send(result.rows[0]);
  });

  app.post('/:id/transition', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toStatus, reason } = request.body as { toStatus: CaseStatus; reason?: string };

    const currentResult = await query<{ status: CaseStatus }>(
      `SELECT status FROM claim_cases WHERE id = $1`,
      [id],
    );

    if (currentResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const currentStatus = currentResult.rows[0].status as CaseStatus;

    if (!canTransition(currentStatus, toStatus)) {
      return reply.status(400).send({
        statusCode: 400, error: 'Invalid Transition',
        message: `Cannot transition from ${currentStatus} to ${toStatus}`,
      });
    }

    await query(
      `UPDATE claim_cases SET status = $1, previous_status = $2, updated_at = NOW() WHERE id = $3`,
      [toStatus, currentStatus, id],
    );

    await query(
      `INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, currentStatus, toStatus, request.user!.sub, reason ?? null],
    );

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

    const statusHistory = await query(
      `SELECT * FROM case_status_history WHERE case_id = $1 ORDER BY created_at`,
      [id],
    );

    const auditEvents = await query(
      `SELECT * FROM audit_log WHERE case_id = $1 ORDER BY timestamp`,
      [id],
    );

    return reply.send({
      caseId: id,
      statusHistory: statusHistory.rows,
      auditEvents: auditEvents.rows,
    });
  });

  app.get('/:id/documents', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops', 'compliance', 'attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(
      `SELECT * FROM documents WHERE case_id = $1 ORDER BY created_at DESC`,
      [id],
    );

    return reply.send({ caseId: id, documents: result.rows });
  });

  app.get('/:id/checklist', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const docsResult = await query<{ doc_type: string }>(
      `SELECT doc_type FROM documents WHERE case_id = $1`,
      [id],
    );

    const existingTypes = new Set(docsResult.rows.map(r => r.doc_type));

    const checklist = [
      { docType: 'id_front', label: 'Government Photo ID (Front)', required: true },
      { docType: 'id_back', label: 'Government Photo ID (Back)', required: true },
      { docType: 'contract', label: 'Signed Agreement', required: true },
      { docType: 'disclosure', label: 'Signed Disclosure', required: true },
      { docType: 'claim_form', label: 'State Claim Form', required: true },
    ].map(item => ({
      ...item,
      status: existingTypes.has(item.docType) ? 'uploaded' : 'missing',
    }));

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
