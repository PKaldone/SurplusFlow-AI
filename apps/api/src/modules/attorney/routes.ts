// ============================================================
// SurplusFlow AI — Attorney Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { query } from '../../lib/db.js';

export async function attorneyRoutes(app: FastifyInstance) {
  app.get('/assignments', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const attorneyId = request.user!.sub;
    const { page: rawPage, pageSize: rawPageSize, status } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['a.attorney_id = $1'];
    const params: unknown[] = [attorneyId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`a.status = $${paramIdx++}`);
      params.push(status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM attorney_assignments a ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT a.*, cc.case_number, cc.status AS case_status,
              cc.source_type, cc.jurisdiction_key, cc.estimated_amount
       FROM attorney_assignments a
       LEFT JOIN claim_cases cc ON cc.id = a.case_id
       ${where}
       ORDER BY a.created_at DESC
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

  app.get('/assignments/:id', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const attorneyId = request.user!.sub;

    const result = await query(
      `SELECT a.*, cc.case_number, cc.status AS case_status,
              cc.source_type, cc.jurisdiction_key, cc.estimated_amount,
              cc.claimant_id
       FROM attorney_assignments a
       LEFT JOIN claim_cases cc ON cc.id = a.case_id
       WHERE a.id = $1 AND a.attorney_id = $2`,
      [id, attorneyId],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Assignment not found' });
    }

    return reply.send(result.rows[0]);
  });

  app.patch('/assignments/:id', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const attorneyId = request.user!.sub;
    const { status, notes } = request.body as { status: string; notes?: string };

    // Verify assignment belongs to this attorney
    const existing = await query(
      `SELECT id FROM attorney_assignments WHERE id = $1 AND attorney_id = $2`,
      [id, attorneyId],
    );
    if (existing.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Assignment not found' });
    }

    // Build dynamic SET clause with timestamp fields based on status
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      sets.push(`status = $${paramIdx++}`);
      params.push(status);

      if (status === 'accepted') {
        sets.push('accepted_at = NOW()');
      } else if (status === 'filed') {
        sets.push('filed_at = NOW()');
      } else if (status === 'completed') {
        sets.push('completed_at = NOW()');
      }
    }

    if (notes !== undefined) {
      sets.push(`notes = $${paramIdx++}`);
      params.push(notes);
    }

    params.push(id);
    const result = await query(
      `UPDATE attorney_assignments SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    const auditAction = status === 'accepted' ? AUDIT_ACTIONS.ATTORNEY_ACCEPTED
      : status === 'filed' ? AUDIT_ACTIONS.ATTORNEY_FILED
      : status === 'completed' ? AUDIT_ACTIONS.ATTORNEY_COMPLETED
      : 'attorney.status_updated';

    await request.logAudit({
      action: auditAction, resourceType: 'attorney_assignment', resourceId: id,
      details: { status, notes },
    });

    return reply.send({ message: 'Assignment updated', assignment: result.rows[0] });
  });

  app.get('/assignments/:id/dossier', {
    preHandler: [app.authenticate, app.requireRole(['attorney'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const attorneyId = request.user!.sub;

    // Verify assignment belongs to this attorney and get dossier doc
    const result = await query(
      `SELECT a.dossier_doc_id, d.filename, d.storage_key, d.storage_bucket
       FROM attorney_assignments a
       LEFT JOIN documents d ON d.id = a.dossier_doc_id
       WHERE a.id = $1 AND a.attorney_id = $2`,
      [id, attorneyId],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Assignment not found' });
    }

    if (!result.rows[0].dossier_doc_id) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'No dossier document available for this assignment' });
    }

    // Generate presigned download URL — stub until S3 integration
    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_DOWNLOADED, resourceType: 'document',
      resourceId: result.rows[0].dossier_doc_id,
      details: { type: 'dossier', assignmentId: id },
    });

    return reply.send({
      id,
      dossierDocId: result.rows[0].dossier_doc_id,
      filename: result.rows[0].filename,
      downloadUrl: 'https://presigned-url-placeholder',
      expiresIn: 900,
    });
  });
}
