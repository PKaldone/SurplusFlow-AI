// ============================================================
// SurplusFlow AI — Billing Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS, calculateFee, generateInvoiceNumber } from '@surplusflow/shared';

export async function billingRoutes(app: FastifyInstance) {
  // GET /billing/invoices
  app.get('/invoices', {
    preHandler: [app.authenticate, app.requireSelfOrRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const _query = request.query as Record<string, string>;
    // Claimant role: filter to own invoices only
    return reply.send({ data: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
  });

  // POST /billing/invoices — Create invoice for a case
  app.post('/invoices', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { caseId, payoutAmount, feePercent, feeCap } = request.body as {
      caseId: string; payoutAmount: number; feePercent: number; feeCap?: number;
    };

    // Calculate fee with cap enforcement
    const calculatedFee = payoutAmount * (feePercent / 100);
    const finalFee = calculateFee(payoutAmount, feePercent, feeCap);

    // In production:
    // 1. Verify case exists and is in AWAITING_PAYOUT or INVOICED status
    // 2. Verify payout has been confirmed
    // 3. Get next invoice sequence number
    // 4. Create invoice record
    // 5. Generate invoice PDF via docgen queue
    // 6. Transition case to INVOICED
    // 7. Audit log

    await request.logAudit({
      action: AUDIT_ACTIONS.INVOICE_CREATED,
      resourceType: 'invoice',
      caseId,
      details: { payoutAmount, feePercent, feeCap, calculatedFee, finalFee },
    });

    return reply.status(201).send({
      message: 'Invoice created',
      invoiceNumber: generateInvoiceNumber(1),
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
    return reply.send({ id });
  });

  // PATCH /billing/invoices/:id — Update status
  app.patch('/invoices/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, paymentMethod, paymentReference } = request.body as Record<string, string>;

    if (status === 'paid') {
      await request.logAudit({
        action: AUDIT_ACTIONS.INVOICE_PAID,
        resourceType: 'invoice',
        resourceId: id,
        details: { paymentMethod, paymentReference },
      });
    }

    return reply.send({ message: 'Invoice updated', id, status });
  });

  // POST /billing/payout-confirm — Record payout confirmation
  app.post('/payout-confirm', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin', 'ops'])],
  }, async (request, reply) => {
    const { caseId, payoutAmount, payoutDate, payoutMethod, notes } = request.body as {
      caseId: string; payoutAmount: number; payoutDate: string; payoutMethod: string; notes?: string;
    };

    // In production:
    // 1. Verify case is in AWAITING_PAYOUT status
    // 2. Create payout_confirmations record
    // 3. Update case: payout_amount, payout_date, payout_confirmed_at
    // 4. Optionally upload evidence document
    // 5. Transition case to allow invoicing
    // 6. Audit log

    await request.logAudit({
      action: AUDIT_ACTIONS.PAYOUT_CONFIRMED,
      resourceType: 'payout_confirmation',
      caseId,
      details: { payoutAmount, payoutDate, payoutMethod, notes },
    });

    return reply.send({
      message: 'Payout confirmed',
      caseId,
      payoutAmount,
      nextStep: 'Case is now ready for invoicing',
    });
  });
}
