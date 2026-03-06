// ============================================================
// SurplusFlow AI — Billing Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS, calculateFee, generateInvoiceNumber } from '@surplusflow/shared';
import { query } from '../../lib/db.js';

export async function billingRoutes(app: FastifyInstance) {
  // GET /billing/invoices
  app.get('/invoices', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { page: rawPage, pageSize: rawPageSize, status, caseId } = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Claimant role: filter to own invoices only
    if (request.user!.role === 'claimant') {
      conditions.push(`i.claimant_id = (SELECT id FROM claimants WHERE user_id = $${paramIdx++})`);
      params.push(request.user!.sub);
    }

    if (status) {
      conditions.push(`i.status = $${paramIdx++}`);
      params.push(status);
    }

    if (caseId) {
      conditions.push(`i.case_id = $${paramIdx++}`);
      params.push(caseId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoices i ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT i.*, cc.case_number
       FROM invoices i
       LEFT JOIN claim_cases cc ON cc.id = i.case_id
       ${where}
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

  // POST /billing/invoices — Create invoice for a case
  app.post('/invoices', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { caseId, payoutAmount, feePercent, feeCap, notes } = request.body as {
      caseId: string; payoutAmount: number; feePercent: number; feeCap?: number; notes?: string;
    };

    // Verify case exists
    const caseResult = await query(
      `SELECT id, claimant_id, status FROM claim_cases WHERE id = $1`,
      [caseId],
    );
    if (caseResult.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    const caseRow = caseResult.rows[0];

    // Calculate fee with cap enforcement
    const calculatedFee = payoutAmount * (feePercent / 100);
    const finalFee = calculateFee(payoutAmount, feePercent, feeCap);

    // Get next invoice sequence number
    const seqResult = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM invoices`);
    const seq = parseInt(seqResult.rows[0].count, 10) + 1;
    const invoiceNumber = generateInvoiceNumber(seq);

    const insertResult = await query(
      `INSERT INTO invoices (
        invoice_number, case_id, claimant_id, payout_amount,
        fee_percent, fee_cap, calculated_fee, final_fee,
        status, issued_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), $9)
      RETURNING *`,
      [invoiceNumber, caseId, caseRow.claimant_id, payoutAmount, feePercent, feeCap ?? null, calculatedFee, finalFee, notes ?? null],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.INVOICE_CREATED,
      resourceType: 'invoice',
      resourceId: insertResult.rows[0].id,
      caseId,
      details: { invoiceNumber, payoutAmount, feePercent, feeCap, calculatedFee, finalFee },
    });

    return reply.status(201).send({
      message: 'Invoice created',
      invoice: insertResult.rows[0],
      invoiceNumber,
      calculatedFee,
      finalFee,
      feeWasCapped: calculatedFee > finalFee,
    });
  });

  // GET /billing/invoices/:id
  app.get('/invoices/:id', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await query(
      `SELECT i.*, cc.case_number, cc.status AS case_status
       FROM invoices i
       LEFT JOIN claim_cases cc ON cc.id = i.case_id
       WHERE i.id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Invoice not found' });
    }

    // Claimant can only see their own invoices
    if (request.user!.role === 'claimant') {
      const claimantResult = await query<{ id: string }>(
        `SELECT id FROM claimants WHERE user_id = $1`,
        [request.user!.sub],
      );
      if (claimantResult.rowCount === 0 || result.rows[0].claimant_id !== claimantResult.rows[0].id) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Invoice not found' });
      }
    }

    return reply.send(result.rows[0]);
  });

  // PATCH /billing/invoices/:id — Update status
  app.patch('/invoices/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, paymentMethod, paymentReference, notes } = request.body as Record<string, string>;

    // Build dynamic SET clause
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      sets.push(`status = $${paramIdx++}`);
      params.push(status);
      if (status === 'paid') {
        sets.push('paid_at = NOW()');
      }
    }
    if (paymentMethod) {
      sets.push(`payment_method = $${paramIdx++}`);
      params.push(paymentMethod);
    }
    if (paymentReference) {
      sets.push(`payment_reference = $${paramIdx++}`);
      params.push(paymentReference);
    }
    if (notes) {
      sets.push(`notes = $${paramIdx++}`);
      params.push(notes);
    }

    params.push(id);
    const result = await query(
      `UPDATE invoices SET ${sets.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Invoice not found' });
    }

    if (status === 'paid') {
      await request.logAudit({
        action: AUDIT_ACTIONS.INVOICE_PAID,
        resourceType: 'invoice',
        resourceId: id,
        details: { paymentMethod, paymentReference },
      });
    }

    return reply.send({ message: 'Invoice updated', invoice: result.rows[0] });
  });

  // POST /billing/payout-confirm — Record payout confirmation
  app.post('/payout-confirm', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { caseId, payoutAmount, payoutDate, payoutMethod, evidenceDocId, notes } = request.body as {
      caseId: string; payoutAmount: number; payoutDate: string; payoutMethod: string; evidenceDocId?: string; notes?: string;
    };

    // Verify case exists
    const caseResult = await query(`SELECT id, status FROM claim_cases WHERE id = $1`, [caseId]);
    if (caseResult.rowCount === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Case not found' });
    }

    // Insert payout confirmation
    const confirmResult = await query(
      `INSERT INTO payout_confirmations (
        case_id, confirmed_by, payout_amount, payout_date,
        payout_method, evidence_doc_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [caseId, request.user!.sub, payoutAmount, payoutDate, payoutMethod, evidenceDocId ?? null, notes ?? null],
    );

    // Update case payout fields
    await query(
      `UPDATE claim_cases
       SET payout_amount = $1, payout_date = $2, payout_confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [payoutAmount, payoutDate, caseId],
    );

    await request.logAudit({
      action: AUDIT_ACTIONS.PAYOUT_CONFIRMED,
      resourceType: 'payout_confirmation',
      resourceId: confirmResult.rows[0].id,
      caseId,
      details: { payoutAmount, payoutDate, payoutMethod, notes },
    });

    return reply.send({
      message: 'Payout confirmed',
      confirmation: confirmResult.rows[0],
      caseId,
      payoutAmount,
      nextStep: 'Case is now ready for invoicing',
    });
  });
}
