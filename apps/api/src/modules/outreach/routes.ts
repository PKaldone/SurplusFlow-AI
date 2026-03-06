// ============================================================
// SurplusFlow AI — Outreach Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import { validateApproval } from '@surplusflow/contracts/src/outreach.js';
import { query } from '../../lib/db.js';

export async function outreachRoutes(app: FastifyInstance) {
  app.get('/campaigns', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page: rawPage, pageSize: rawPageSize, status } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM outreach_campaigns ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM outreach_campaigns ${where}
       ORDER BY created_at DESC
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

  app.post('/campaigns', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const result = await query(
      `INSERT INTO outreach_campaigns (
        name, source_type, jurisdiction_key, template_key,
        channel, status, total_recipients, created_by
      ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
      RETURNING *`,
      [
        body.name, body.sourceType, body.jurisdictionKey, body.templateKey,
        body.channel, body.totalRecipients ?? 0, request.user!.sub,
      ],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_CREATED, resourceType: 'outreach_campaign',
      resourceId: result.rows[0].id, details: body,
    });

    return reply.status(201).send({ message: 'Campaign created', campaign: result.rows[0] });
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

    const result = await query(
      `UPDATE outreach_campaigns
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [request.user!.sub, id],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Campaign not found' });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_APPROVED, resourceType: 'outreach_campaign', resourceId: id, details: payload,
    });
    return reply.send({ message: 'Campaign approved', campaign: result.rows[0] });
  });

  app.post('/campaigns/:id/send', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify campaign is approved before sending
    const campaign = await query(
      `SELECT id, status FROM outreach_campaigns WHERE id = $1`,
      [id],
    );
    if (campaign.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Campaign not found' });
    }
    if (campaign.rows[0].status !== 'approved') {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Campaign must be approved before sending' });
    }

    // Mark as sending — actual send needs BullMQ job
    await query(
      `UPDATE outreach_campaigns SET status = 'sending', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    return reply.send({ message: 'Campaign send initiated', id });
  });

  app.get('/records', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { campaignId, claimantId, page: rawPage, pageSize: rawPageSize } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (campaignId) {
      conditions.push(`r.campaign_id = $${paramIdx++}`);
      params.push(campaignId);
    }
    if (claimantId) {
      conditions.push(`r.claimant_id = $${paramIdx++}`);
      params.push(claimantId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM outreach_records r ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT r.*, c.first_name, c.last_name
       FROM outreach_records r
       LEFT JOIN claimants c ON c.id = r.claimant_id
       ${where}
       ORDER BY r.created_at DESC
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

  // Public opt-out endpoint
  app.post('/opt-out', async (request, reply) => {
    const { identifier, identifierType, reason } = request.body as {
      identifier: string; identifierType: string; reason?: string;
    };

    // Add to suppression list
    await query(
      `INSERT INTO suppression_list (identifier, identifier_type, reason, source)
       VALUES ($1, $2, $3, 'self_opt_out')
       ON CONFLICT DO NOTHING`,
      [identifier, identifierType, reason ?? 'Opted out by recipient'],
    );

    // Update claimant do_not_contact flag
    if (identifierType === 'email') {
      await query(
        `UPDATE claimants SET do_not_contact = true, updated_at = NOW() WHERE email = $1`,
        [identifier],
      );
    } else if (identifierType === 'phone') {
      await query(
        `UPDATE claimants SET do_not_contact = true, updated_at = NOW() WHERE phone = $1`,
        [identifier],
      );
    }

    await app.audit.write({
      action: AUDIT_ACTIONS.OUTREACH_OPTED_OUT,
      resourceType: 'suppression_list',
      details: { identifier: identifier.substring(0, 3) + '***', identifierType },
    });

    return reply.send({ message: 'You have been removed from our contact list. You will not receive further communications.' });
  });

  // --- Templates (frontend expects GET /templates) ---
  app.get('/templates', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page: rawPage, pageSize: rawPageSize, channel } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (channel) {
      conditions.push(`channel = $${paramIdx++}`);
      params.push(channel);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM contract_templates ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT id, name, channel, description, body, subject, created_at AS "createdAt"
       FROM contract_templates ${where}
       ORDER BY created_at DESC
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

  // --- Suppression List ---
  app.get('/suppression', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page: rawPage, pageSize: rawPageSize, identifierType } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (identifierType) {
      conditions.push(`identifier_type = $${paramIdx++}`);
      params.push(identifierType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM suppression_list ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM suppression_list ${where}
       ORDER BY created_at DESC
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

  app.post('/suppression', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const body = request.body as {
      identifier: string; identifierType: string; reason?: string;
    };

    const result = await query(
      `INSERT INTO suppression_list (identifier, identifier_type, reason, source)
       VALUES ($1, $2, $3, 'manual')
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [body.identifier, body.identifierType, body.reason ?? 'Manually added'],
    );

    if (result.rowCount === 0) {
      return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Entry already exists in suppression list' });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_OPTED_OUT,
      resourceType: 'suppression_list',
      resourceId: result.rows[0].id,
      details: { identifier: body.identifier.substring(0, 3) + '***', identifierType: body.identifierType },
    });

    return reply.status(201).send({ message: 'Suppression entry added', entry: result.rows[0] });
  });

  // --- Case-level Outreach ---
  app.get('/cases/:caseId/history', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { page: rawPage, pageSize: rawPageSize } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM outreach_records WHERE case_id = $1`,
      [caseId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT r.*, c.name AS campaign_name
       FROM outreach_records r
       LEFT JOIN outreach_campaigns c ON c.id = r.campaign_id
       WHERE r.case_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [caseId, pageSize, offset],
    );

    return reply.send({
      data: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  app.post('/cases/:caseId/queue', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const body = request.body as { channel: string; templateId: string };

    const result = await query(
      `INSERT INTO outreach_records (case_id, channel, campaign_id, status, created_by)
       VALUES ($1, $2, $3, 'queued', $4)
       RETURNING *`,
      [caseId, body.channel, body.templateId, request.user!.sub],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_CREATED,
      resourceType: 'outreach_record',
      resourceId: result.rows[0].id,
      details: { caseId, channel: body.channel, templateId: body.templateId },
    });

    return reply.status(201).send({ message: 'Outreach queued', record: result.rows[0] });
  });

  app.patch('/cases/:recordId/approve', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'compliance'])],
  }, async (request, reply) => {
    const { recordId } = request.params as { recordId: string };

    const result = await query(
      `UPDATE outreach_records
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [recordId],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Outreach record not found' });
    }

    await request.logAudit({
      action: AUDIT_ACTIONS.OUTREACH_APPROVED,
      resourceType: 'outreach_record',
      resourceId: recordId,
    });

    return reply.send({ message: 'Outreach record approved', record: result.rows[0] });
  });
}
