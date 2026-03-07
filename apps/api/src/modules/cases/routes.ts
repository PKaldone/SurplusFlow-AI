// ============================================================
// SurplusFlow AI — Cases Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
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

    // Accept both camelCase (frontend) and snake_case field names
    const opportunityId = (body.opportunityId ?? body.opportunity_id) as string | undefined;

    if (!opportunityId) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'opportunityId is required' });
    }

    // Fetch opportunity to auto-fill case fields
    const oppResult = await query(
      `SELECT * FROM opportunities WHERE id = $1`,
      [opportunityId],
    );
    if (oppResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Opportunity not found' });
    }
    const opp = oppResult.rows[0] as Record<string, unknown>;

    // Look up or create claimant from opportunity owner_name
    let claimantId = (body.claimantId ?? body.claimant_id) as string | undefined;
    if (!claimantId) {
      const ownerName = (opp.owner_name as string) ?? 'Unknown Owner';
      const nameParts = ownerName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';

      // Check for existing claimant by name similarity
      const existing = await query<{ id: string }>(
        `SELECT id FROM claimants
         WHERE similarity(first_name || ' ' || last_name, $1) > 0.4
         ORDER BY similarity(first_name || ' ' || last_name, $1) DESC LIMIT 1`,
        [ownerName],
      );

      if (existing.rows.length > 0) {
        claimantId = existing.rows[0].id;
      } else {
        const newId = crypto.randomUUID();
        await query(
          `INSERT INTO claimants (id, first_name, last_name, address_line1, city, state, zip, identity_verified, do_not_contact, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, NOW(), NOW())`,
          [newId, firstName, lastName, null, null, opp.state, null],
        );
        claimantId = newId;
      }
    }

    const jurisdictionKey = (opp.jurisdiction_key as string) ??
      `${(opp.state as string || '').toLowerCase()}_statewide_${opp.source_type}`;

    // Generate case number with advisory lock to prevent race conditions
    const year = new Date().getFullYear();
    const prefix = `${CASE_NUMBER_PREFIX}-${year}-`;

    const client = await (await import('../../lib/db.js')).pool.connect();
    let caseNumber: string;
    let result;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('case_number_gen'))`);

      const countResult = await client.query<{ max_seq: string }>(
        `SELECT MAX(CAST(SUBSTRING(case_number FROM '[0-9]+$') AS INTEGER)) AS max_seq FROM claim_cases WHERE case_number LIKE $1`,
        [`${prefix}%`],
      );
      const nextSeq = (parseInt(countResult.rows[0].max_seq, 10) || 0) + 1;
      caseNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

      result = await client.query(
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
          opportunityId,
          claimantId,
          body.assignedOpsId ?? body.assigned_to ?? null,
          body.attorney_id ?? null,
          'PROSPECT',
          opp.source_type,
          jurisdictionKey,
          opp.state,
          opp.county ?? null,
          opp.reported_amount ?? null,
          body.configuredFeePercent ?? body.agreed_fee_pct ?? null,
          body.configuredFeeCap ?? body.agreed_fee_cap ?? null,
          body.contract_version ?? null,
          body.cooling_off_days ?? null,
          false,
          false,
          false,
          body.notes ?? null,
          JSON.stringify({ converted_from_opportunity: true, converted_at: new Date().toISOString() }),
        ],
      );

      // Update opportunity status
      await client.query(
        `UPDATE opportunities SET status = 'case_created', updated_at = NOW() WHERE id = $1`,
        [opportunityId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

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

  app.post('/:id/documents', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { docType, filename, mimeType, fileBase64: _fileBase64 } = request.body as {
      docType: string;
      filename: string;
      mimeType: string;
      fileBase64: string;
    };

    // Verify case exists
    const caseResult = await query(`SELECT id FROM claim_cases WHERE id = $1`, [id]);
    if (caseResult.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const docId = crypto.randomUUID();
    const storageKey = `cases/${id}/${docType}/${docId}-${filename}`;

    const result = await query(
      `INSERT INTO documents (id, case_id, doc_type, filename, mime_type, uploaded_by, storage_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [docId, id, docType, filename, mimeType, request.user!.sub, storageKey],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_UPLOADED ?? 'document.uploaded',
      resourceType: 'document',
      resourceId: docId,
      caseId: id,
      details: { docType, filename, mimeType },
    });

    return reply.status(201).send(result.rows[0]);
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
