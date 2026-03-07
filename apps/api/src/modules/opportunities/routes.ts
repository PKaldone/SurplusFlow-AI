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

function mapOpportunityRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceRef: row.source_id,
    sourceUrl: row.source_url,
    jurisdictionState: row.state,
    jurisdictionCounty: row.county,
    ownerName: row.owner_name,
    ownerAddress: row.owner_address,
    holderName: row.holder_name,
    propertyDescription: row.property_description,
    estimatedAmount: row.reported_amount ? Number(row.reported_amount) : null,
    parcelNumber: row.parcel_number,
    saleDate: row.sale_date,
    surplusDate: row.surplus_date,
    deadlineDate: row.deadline_date,
    status: row.status,
    ingestedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function opportunityRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops', 'compliance'])],
  }, async (request, reply) => {
    const qs = request.query as Record<string, string>;
    const pageNum = Math.max(1, Number(qs.page || '1'));
    const size = Math.min(100, Math.max(1, Number(qs.limit || qs.pageSize || '25')));
    const offset = (pageNum - 1) * size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (qs.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(qs.status);
    }
    if (qs.state) {
      conditions.push(`state = $${paramIdx++}`);
      params.push(qs.state);
    }
    if (qs.sourceType) {
      conditions.push(`source_type = $${paramIdx++}`);
      params.push(qs.sourceType);
    }
    if (qs.minAmount) {
      conditions.push(`reported_amount >= $${paramIdx++}`);
      params.push(Number(qs.minAmount));
    }
    if (qs.maxAmount) {
      conditions.push(`reported_amount <= $${paramIdx++}`);
      params.push(Number(qs.maxAmount));
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

    const data = dataResult.rows.map(mapOpportunityRow);

    return reply.send({
      data,
      total,
      page: pageNum,
      limit: size,
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

    const opportunity = mapOpportunityRow(result.rows[0] as Record<string, unknown>);
    const rawData = (result.rows[0] as Record<string, unknown>).raw_data;

    // Fetch related cases
    const casesResult = await query(
      `SELECT cc.id, cc.case_number, cc.status, cc.claimed_amount, cc.created_at,
              cl.first_name, cl.last_name, cl.email, cl.phone
       FROM claim_cases cc
       LEFT JOIN claimants cl ON cl.id = cc.claimant_id
       WHERE cc.opportunity_id = $1
       ORDER BY cc.created_at DESC`,
      [id],
    );

    const relatedCases = casesResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      caseNumber: r.case_number,
      status: r.status,
      claimedAmount: r.claimed_amount ? Number(r.claimed_amount) : null,
      createdAt: r.created_at,
      claimantName: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      claimantEmail: r.email,
      claimantPhone: r.phone,
    }));

    // Fetch outreach records linked to cases from this opportunity
    const outreachResult = await query(
      `SELECT o.id, o.channel, o.template_key, o.touch_number, o.status,
              o.sent_at, o.delivered_at, o.opened_at, o.responded_at, o.stop_reason
       FROM outreach_records o
       JOIN claim_cases cc ON cc.id = o.case_id
       WHERE cc.opportunity_id = $1
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [id],
    );

    const outreachHistory = outreachResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      channel: r.channel,
      templateKey: r.template_key,
      touchNumber: r.touch_number,
      status: r.status,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      openedAt: r.opened_at,
      respondedAt: r.responded_at,
      stopReason: r.stop_reason,
    }));

    // Fetch enrichment audit entries
    const enrichmentResult = await query(
      `SELECT action, details, created_at
       FROM audit_log
       WHERE resource_type = 'claimant'
         AND action LIKE 'claimant.email%'
         AND case_id IN (SELECT id FROM claim_cases WHERE opportunity_id = $1)
       ORDER BY created_at DESC
       LIMIT 10`,
      [id],
    );

    const enrichmentHistory = enrichmentResult.rows.map((r: Record<string, unknown>) => ({
      action: r.action,
      details: r.details,
      createdAt: r.created_at,
    }));

    return reply.send({
      ...opportunity,
      rawData: rawData || null,
      relatedCases,
      outreachHistory,
      enrichmentHistory,
    });
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

    const result = await query(`SELECT * FROM opportunities WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Opportunity not found' });
    }

    const opp = result.rows[0] as Record<string, unknown>;
    const state = opp.state as string;
    const amount = Number(opp.reported_amount) || 0;
    const sourceType = opp.source_type as string;
    const deadlineDate = opp.deadline_date as string | null;

    const constraints: string[] = [];
    const warnings: string[] = [];
    const signals: Array<{ type: string; label: string; detail: string; severity: string }> = [];
    let ruleResult = 'ALLOWED';

    // Amount threshold check
    if (amount >= 50000) {
      signals.push({ type: 'high_value', label: 'High-Value Opportunity', detail: `$${amount.toLocaleString()} exceeds $50k threshold — attorney review recommended`, severity: 'info' });
    }
    if (amount >= 100000) {
      constraints.push('Requires attorney review for claims over $100,000');
      ruleResult = 'ALLOWED_WITH_CONSTRAINTS';
    }
    if (amount < 100) {
      warnings.push('Claimed amount under $100 — may not be cost-effective to pursue');
      signals.push({ type: 'low_value', label: 'Low-Value Flag', detail: 'Amount below cost-effective threshold', severity: 'warning' });
    }

    // Deadline proximity check
    if (deadlineDate) {
      const daysUntilDeadline = Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilDeadline < 0) {
        ruleResult = 'BLOCKED';
        warnings.push('Filing deadline has passed');
        signals.push({ type: 'deadline_expired', label: 'Deadline Expired', detail: `Deadline was ${Math.abs(daysUntilDeadline)} days ago`, severity: 'critical' });
      } else if (daysUntilDeadline <= 30) {
        constraints.push(`Only ${daysUntilDeadline} days until filing deadline — expedite processing`);
        signals.push({ type: 'deadline_near', label: 'Deadline Approaching', detail: `${daysUntilDeadline} days remaining`, severity: 'warning' });
        if (ruleResult === 'ALLOWED') ruleResult = 'ALLOWED_WITH_CONSTRAINTS';
      } else {
        signals.push({ type: 'deadline_ok', label: 'Deadline Clear', detail: `${daysUntilDeadline} days remaining`, severity: 'ok' });
      }
    }

    // State-specific rules
    const attorneyStates = ['FL', 'TX', 'CA', 'NY', 'IL', 'PA', 'OH'];
    if (attorneyStates.includes(state) && amount >= 25000) {
      constraints.push(`${state} requires attorney involvement for claims over $25,000`);
      if (ruleResult === 'ALLOWED') ruleResult = 'ALLOWED_WITH_CONSTRAINTS';
    }

    // Duplicate check
    const dupeResult = await query(
      `SELECT COUNT(*) as count FROM opportunities
       WHERE owner_name = $1 AND state = $2 AND source_type = $3 AND id != $4 AND status NOT IN ('expired','duplicate')`,
      [opp.owner_name, state, sourceType, id],
    );
    const dupeCount = parseInt((dupeResult.rows[0] as { count: string }).count, 10);
    if (dupeCount > 0) {
      signals.push({ type: 'duplicate_risk', label: 'Possible Duplicates', detail: `${dupeCount} other matching opportunit${dupeCount === 1 ? 'y' : 'ies'} found`, severity: 'warning' });
    }

    // Source quality signal
    const sourceQuality: Record<string, string> = {
      unclaimed_property: 'State comptroller data — high reliability',
      foreclosure_surplus: 'County records — medium reliability, verify sale details',
      tax_sale_surplus: 'Tax office records — medium reliability, check redemption period',
    };
    signals.push({
      type: 'source_quality',
      label: 'Source Quality',
      detail: sourceQuality[sourceType] || 'Unknown source type',
      severity: sourceType === 'unclaimed_property' ? 'ok' : 'info',
    });

    return reply.send({
      id,
      ruleCheck: { result: ruleResult, constraints, warnings },
      signals,
      duplicateCount: dupeCount,
    });
  });

  // --- Trigger autonomous scrape pipeline ---
  app.post('/trigger-scrape', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { states } = (request.body ?? {}) as { states?: string[] };
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
