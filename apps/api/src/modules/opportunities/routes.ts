// ============================================================
// SurplusFlow AI — Opportunities Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { query } from '../../lib/db.js';

// --- BullMQ queue for triggering ingestion jobs from the API ---
const REDIS_URL = process.env.REDIS_URL || 'redis://:sfredis_local_dev@localhost:6379';
const parsedRedis = new URL(REDIS_URL);
const ingestionQueue = new Queue('ingestion', {
  connection: {
    host: parsedRedis.hostname,
    port: parseInt(parsedRedis.port || '6379', 10),
    password: parsedRedis.password || undefined,
  },
});

export async function opportunityRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { page = '1', pageSize = '25', status, state, sourceType } = request.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (state) {
      conditions.push(`state = $${paramIdx++}`);
      params.push(state);
    }
    if (sourceType) {
      conditions.push(`source_type = $${paramIdx++}`);
      params.push(sourceType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM opportunities ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT * FROM opportunities ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
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

  app.get('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(`SELECT * FROM opportunities WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Opportunity not found' });
    }

    return reply.send(result.rows[0]);
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
    const body = request.body as Record<string, unknown>;

    const allowedFields = [
      'source_type', 'source_id', 'source_url', 'state', 'county',
      'jurisdiction_key', 'property_description', 'reported_amount',
      'holder_name', 'owner_name', 'owner_address', 'parcel_number',
      'sale_date', 'surplus_date', 'deadline_date', 'status',
      'ingestion_batch', 'raw_data',
    ];

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(field === 'raw_data' ? JSON.stringify(body[field]) : body[field]);
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE opportunities SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Opportunity not found' });
    }

    return reply.send(result.rows[0]);
  });

  app.post('/:id/qualify', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(
      `UPDATE opportunities SET status = 'qualified', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Opportunity not found' });
    }

    return reply.send(result.rows[0]);
  });

  app.get('/:id/rule-check', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Run evaluateJurisdiction from rules engine
    return reply.send({ id, ruleCheck: { result: 'ALLOWED_WITH_CONSTRAINTS', constraints: [], warnings: [] } });
  });

  // --- Trigger autonomous scrape pipeline ---
  app.post('/trigger-scrape', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { states } = request.body as { states?: string[] };
    const SUPPORTED_STATES = ['FL', 'TX', 'CA', 'OH', 'NY'];
    const targetStates = states ?? SUPPORTED_STATES;

    // Validate requested states
    const invalid = targetStates.filter(s => !SUPPORTED_STATES.includes(s));
    if (invalid.length > 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Unsupported states: ${invalid.join(', ')}. Supported: ${SUPPORTED_STATES.join(', ')}`,
      });
    }

    const jobs = await Promise.all(
      targetStates.map(state =>
        ingestionQueue.add('scrape-state-surplus', {
          state, triggeredBy: request.user!.sub,
        }),
      ),
    );

    return reply.send({
      message: `Scrape triggered for ${targetStates.length} states`,
      states: targetStates,
      jobIds: jobs.map(j => j.id),
    });
  });
}
