// ============================================================
// SurplusFlow AI — Admin Routes (Users, Audit, System)
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS } from '@surplusflow/shared';
import bcrypt from 'bcryptjs';
import { query } from '../../lib/db.js';

const BCRYPT_ROUNDS = 12;

export async function adminRoutes(app: FastifyInstance) {
  // --- User Management ---
  app.get('/users', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const result = await query(
      `SELECT id, email, full_name, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC`,
    );
    return reply.send({ data: result.rows, total: result.rowCount });
  });

  app.post('/users', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const passwordHash = body.password
      ? await bcrypt.hash(body.password as string, BCRYPT_ROUNDS)
      : null;

    const result = await query(
      `INSERT INTO users (email, phone, full_name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [
        body.email,
        body.phone ?? null,
        body.full_name,
        body.role,
        passwordHash,
        body.is_active ?? true,
      ],
    );

    const { password: _pw, ...auditDetails } = body;
    await request.logAudit({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: 'user',
      resourceId: result.rows[0].id,
      details: auditDetails,
    });

    return reply.status(201).send(result.rows[0]);
  });

  app.patch('/users/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const allowedFields = ['email', 'phone', 'full_name', 'role', 'is_active', 'mfa_enabled'];

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(body[field]);
      }
    }

    if (body.password) {
      setClauses.push(`password_hash = $${paramIdx++}`);
      params.push(await bcrypt.hash(body.password as string, BCRYPT_ROUNDS));
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, email, full_name, role, is_active, last_login_at, created_at, updated_at`,
      params,
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    const { password: _pw, ...auditDetails } = body;
    await request.logAudit({
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: 'user',
      resourceId: id,
      details: auditDetails,
    });

    return reply.send(result.rows[0]);
  });

  app.delete('/users/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1
       RETURNING id, email, full_name, role, is_active`,
      [id],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found' });
    }

    await request.logAudit({ action: AUDIT_ACTIONS.USER_DEACTIVATED, resourceType: 'user', resourceId: id });
    return reply.send(result.rows[0]);
  });

  // --- Dashboard Stats ---
  app.get('/dashboard/stats', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const [totalCases, casesByStatus, totalOpportunities, totalClaimants, recentActivity] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) as count FROM claim_cases`),
      query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM claim_cases GROUP BY status`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM opportunities`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM claimants`),
      query(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20`),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of casesByStatus.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    return reply.send({
      totalCases: parseInt(totalCases.rows[0].count, 10),
      casesByStatus: statusCounts,
      totalOpportunities: parseInt(totalOpportunities.rows[0].count, 10),
      totalClaimants: parseInt(totalClaimants.rows[0].count, 10),
      recentActivity: recentActivity.rows,
    });
  });

  // --- Audit Log ---
  app.get('/audit', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'compliance'])],
  }, async (request, reply) => {
    const { page = '1', pageSize = '25', action, resourceType, actorId, startDate, endDate } = request.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(action);
    }
    if (resourceType) {
      conditions.push(`resource_type = $${paramIdx++}`);
      params.push(resourceType);
    }
    if (actorId) {
      conditions.push(`actor_id = $${paramIdx++}`);
      params.push(actorId);
    }
    if (startDate) {
      conditions.push(`timestamp >= $${paramIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`timestamp <= $${paramIdx++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
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

  app.get('/audit/case/:caseId', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'compliance'])],
  }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };

    const result = await query(
      `SELECT * FROM audit_log WHERE case_id = $1 ORDER BY timestamp`,
      [caseId],
    );

    return reply.send({ caseId, events: result.rows });
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
    const result = await query(
      `SELECT id, user_id, first_name, last_name, middle_name, email, phone,
              address_line1, address_line2, city, state, zip, ssn_last4,
              date_of_birth, identity_verified, verification_method,
              do_not_contact, suppression_reason, created_at, updated_at
       FROM claimants ORDER BY created_at DESC`,
    );
    return reply.send({ data: result.rows, total: result.rowCount });
  });

  app.post('/claimants', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const result = await query(
      `INSERT INTO claimants (
        user_id, first_name, last_name, middle_name, email, phone,
        address_line1, address_line2, city, state, zip,
        ssn_last4, date_of_birth, do_not_contact
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, user_id, first_name, last_name, middle_name, email, phone,
                 address_line1, address_line2, city, state, zip, ssn_last4,
                 date_of_birth, identity_verified, do_not_contact, created_at`,
      [
        body.user_id ?? null,
        body.first_name,
        body.last_name,
        body.middle_name ?? null,
        body.email ?? null,
        body.phone ?? null,
        body.address_line1 ?? null,
        body.address_line2 ?? null,
        body.city ?? null,
        body.state ?? null,
        body.zip ?? null,
        body.ssn_last4 ?? null,
        body.date_of_birth ?? null,
        body.do_not_contact ?? false,
      ],
    );

    return reply.status(201).send(result.rows[0]);
  });
}
