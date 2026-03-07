// ============================================================
// SurplusFlow AI — Portal Routes (Claimant-facing)
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../lib/db.js';

/**
 * Resolve the internal claimant ID for the authenticated user.
 * Returns null if no claimant record is linked.
 */
async function resolveClaimantId(userSub: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id FROM claimants WHERE user_id = $1`,
    [userSub],
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Guard that verifies the caller is a claimant and injects `claimantId`
 * onto the request. Returns 403 for non-claimants and 404 if the user
 * has no claimant record.
 */
async function requireClaimant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.user?.role !== 'claimant') {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'This endpoint is restricted to claimants',
    });
  }
  const claimantId = await resolveClaimantId(request.user.sub);
  if (!claimantId) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Claimant profile not found',
    });
  }
  // Stash for downstream handlers
  (request as unknown as { claimantId: string }).claimantId = claimantId;
}

export async function portalRoutes(app: FastifyInstance) {
  // -------------------------------------------------------
  // GET /my-cases — list cases for the logged-in claimant
  // -------------------------------------------------------
  app.get('/my-cases', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { page: rawPage, pageSize: rawPageSize, status } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['cc.claimant_id = $1'];
    const params: unknown[] = [claimantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`cc.status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM claim_cases cc ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT cc.id, cc.case_number, cc.status, cc.source_type,
              cc.jurisdiction_key, cc.state, cc.county,
              cc.claimed_amount,               cc.agreed_fee_pct, cc.agreed_fee_cap,
              cc.cooling_off_days, cc.contract_version,
              cc.created_at, cc.updated_at
       FROM claim_cases cc
       ${whereClause}
       ORDER BY cc.created_at DESC
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

  // -------------------------------------------------------
  // GET /my-cases/:id — single case detail
  // -------------------------------------------------------
  app.get('/my-cases/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { id } = request.params as { id: string };

    const result = await query(
      `SELECT cc.id, cc.case_number, cc.status, cc.previous_status,
              cc.source_type, cc.jurisdiction_key, cc.state, cc.county,
              cc.claimed_amount,               cc.agreed_fee_pct, cc.agreed_fee_cap,
              cc.cooling_off_days, cc.contract_version,
              cc.attorney_required, cc.notarization_required,
              cc.payout_amount, cc.payout_date,
              cc.created_at, cc.updated_at,
              u.full_name AS assigned_name
       FROM claim_cases cc
       LEFT JOIN users u ON cc.assigned_to = u.id
       WHERE cc.id = $1 AND cc.claimant_id = $2`,
      [id, claimantId],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    return reply.send(result.rows[0]);
  });

  // -------------------------------------------------------
  // GET /my-cases/:id/status — case status timeline
  // -------------------------------------------------------
  app.get('/my-cases/:id/status', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { id } = request.params as { id: string };

    // Verify case belongs to this claimant
    const caseResult = await query<{ status: string }>(
      `SELECT status FROM claim_cases WHERE id = $1 AND claimant_id = $2`,
      [id, claimantId],
    );

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const timeline = await query(
      `SELECT csh.id, csh.from_status, csh.to_status, csh.reason,
              csh.created_at AS timestamp
       FROM case_status_history csh
       WHERE csh.case_id = $1
       ORDER BY csh.created_at ASC`,
      [id],
    );

    return reply.send({
      caseId: id,
      currentStatus: caseResult.rows[0].status,
      timeline: timeline.rows,
    });
  });

  // -------------------------------------------------------
  // GET /my-invoices — invoices for the claimant
  // -------------------------------------------------------
  app.get('/my-invoices', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { page: rawPage, pageSize: rawPageSize, status } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['i.claimant_id = $1'];
    const params: unknown[] = [claimantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`i.status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoices i ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT i.id, i.invoice_number, i.case_id, i.payout_amount,
              i.final_fee, i.status, i.issued_at, i.paid_at, i.due_date,
              i.payment_method, i.notes,
              cc.case_number
       FROM invoices i
       LEFT JOIN claim_cases cc ON cc.id = i.case_id
       ${whereClause}
       ORDER BY i.created_at DESC
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

  // -------------------------------------------------------
  // POST /my-cases/:id/documents — upload document to a case
  // -------------------------------------------------------
  app.post('/my-cases/:id/documents', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { id } = request.params as { id: string };

    // Verify case belongs to this claimant
    const caseResult = await query(
      `SELECT id FROM claim_cases WHERE id = $1 AND claimant_id = $2`,
      [id, claimantId],
    );

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No file uploaded' });
    }

    const buffer = await file.toBuffer();
    const docType = (request.query as Record<string, string>).doc_type ?? 'general';

    const result = await query(
      `INSERT INTO documents (
        case_id, doc_type, filename, mime_type, file_size,
        uploaded_by, storage_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        docType,
        file.filename,
        file.mimetype,
        buffer.length,
        request.user!.sub,
        `uploads/${id}/${file.filename}`,
      ],
    );

    await request.logAudit({
      action: 'portal.document_uploaded',
      resourceType: 'document',
      resourceId: result.rows[0].id,
      caseId: id,
      details: { docType, filename: file.filename, mimeType: file.mimetype, fileSize: buffer.length },
    });

    return reply.status(201).send({
      message: 'Document uploaded',
      document: result.rows[0],
    });
  });

  // -------------------------------------------------------
  // POST /my-cases/:id/sign-contract — sign contract
  // -------------------------------------------------------
  app.post('/my-cases/:id/sign-contract', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { id } = request.params as { id: string };

    // Verify case belongs to this claimant
    const caseResult = await query<{ status: string; contract_version: string }>(
      `SELECT status, contract_version FROM claim_cases WHERE id = $1 AND claimant_id = $2`,
      [id, claimantId],
    );

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    // Check if already signed
    const existingContract = await query(
      `SELECT id FROM executed_contracts WHERE case_id = $1 AND signed_by = $2`,
      [id, request.user!.sub],
    );

    if (existingContract.rows.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Contract has already been signed for this case',
      });
    }

    const { signature, ip_address } = request.body as { signature?: string; ip_address?: string };

    const result = await query(
      `INSERT INTO executed_contracts (
        case_id, signed_by, signed_at, contract_version,
        signature_data, ip_address
      ) VALUES ($1, $2, NOW(), $3, $4, $5)
      RETURNING *`,
      [
        id,
        request.user!.sub,
        caseResult.rows[0].contract_version ?? 'v1',
        signature ?? null,
        ip_address ?? request.ip,
      ],
    );

    // Update case status to reflect signing
    await query(
      `UPDATE claim_cases SET updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await request.logAudit({
      action: 'portal.contract_signed',
      resourceType: 'executed_contract',
      resourceId: result.rows[0].id,
      caseId: id,
      details: { contractVersion: caseResult.rows[0].contract_version },
    });

    return reply.status(201).send({
      message: 'Contract signed successfully',
      contract: result.rows[0],
    });
  });

  // -------------------------------------------------------
  // POST /my-cases/:id/rescind — rescind/cancel case
  // -------------------------------------------------------
  app.post('/my-cases/:id/rescind', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    await requireClaimant(request, reply);
    if (reply.sent) return;

    const claimantId = (request as unknown as { claimantId: string }).claimantId;
    const { id } = request.params as { id: string };

    // Verify case belongs to this claimant and check cooling-off eligibility
    const caseResult = await query<{
      status: string;
      cooling_off_days: number | null;
      created_at: string;
    }>(
      `SELECT status, cooling_off_days, created_at FROM claim_cases WHERE id = $1 AND claimant_id = $2`,
      [id, claimantId],
    );

    if (caseResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const caseRow = caseResult.rows[0];

    // Only allow rescission during the cooling-off period
    if (caseRow.cooling_off_days != null) {
      const createdAt = new Date(caseRow.created_at);
      const coolingOffEnd = new Date(createdAt.getTime() + caseRow.cooling_off_days * 24 * 60 * 60 * 1000);
      if (new Date() > coolingOffEnd) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cooling-off period has expired. Contact support to discuss your options.',
        });
      }
    }

    // Prevent rescission of already-closed or paid-out cases
    const terminalStatuses = ['CLOSED', 'PAID', 'RESCINDED'];
    if (terminalStatuses.includes(caseRow.status)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Cannot rescind a case in ${caseRow.status} status`,
      });
    }

    const { reason } = request.body as { reason?: string };
    const previousStatus = caseRow.status;

    await query(
      `UPDATE claim_cases SET status = 'RESCINDED', previous_status = $1, updated_at = NOW() WHERE id = $2`,
      [previousStatus, id],
    );

    await query(
      `INSERT INTO case_status_history (case_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'RESCINDED', $3, $4)`,
      [id, previousStatus, request.user!.sub, reason ?? 'Claimant-initiated rescission'],
    );

    await request.logAudit({
      action: 'portal.case_rescinded',
      resourceType: 'claim_case',
      resourceId: id,
      caseId: id,
      previousState: { status: previousStatus },
      newState: { status: 'RESCINDED' },
      details: { reason },
    });

    return reply.send({
      message: 'Case rescinded successfully',
      caseId: id,
      previousStatus,
      newStatus: 'RESCINDED',
    });
  });
}
