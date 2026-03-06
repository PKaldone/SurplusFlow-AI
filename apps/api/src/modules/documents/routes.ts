// ============================================================
// SurplusFlow AI — Documents Routes
// ============================================================

import { FastifyInstance } from 'fastify';
import { AUDIT_ACTIONS, SENSITIVE_DOC_TYPES, STORAGE_BUCKETS } from '@surplusflow/shared';

export async function documentRoutes(app: FastifyInstance) {
  app.post('/upload', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ message: 'No file uploaded' });

    const { caseId, docType, docCategory: _docCategory } = data.fields as unknown as Record<string, { value: string }>;
    const isSensitive = SENSITIVE_DOC_TYPES.includes(docType?.value as (typeof SENSITIVE_DOC_TYPES)[number]);
    const bucket = isSensitive ? STORAGE_BUCKETS.SENSITIVE : STORAGE_BUCKETS.DOCUMENTS;

    // In production:
    // 1. Generate storage key: `${caseId}/${docType}/${uuid}_${filename}`
    // 2. If sensitive: encrypt with envelope encryption before upload
    // 3. Upload to MinIO/S3 bucket with SSE
    // 4. Compute SHA-256 checksum
    // 5. Insert into documents table
    // 6. Audit log

    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_UPLOADED,
      resourceType: 'document',
      caseId: caseId?.value,
      details: { filename: data.filename, docType: docType?.value, isSensitive },
    });

    return reply.status(201).send({ message: 'Document uploaded', documentId: 'doc-id', bucket });
  });

  app.get('/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // RBAC check: sensitive docs require compliance or super_admin
    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_VIEWED,
      resourceType: 'document',
      resourceId: id,
    });
    return reply.send({ id });
  });

  app.get('/:id/download', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // In production:
    // 1. Fetch document metadata
    // 2. Check RBAC (sensitive docs need higher role)
    // 3. Generate presigned URL (15-min expiry)
    // 4. Audit log download event

    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_DOWNLOADED,
      resourceType: 'document',
      resourceId: id,
    });

    return reply.send({ id, downloadUrl: 'https://presigned-url-placeholder', expiresIn: 900 });
  });

  app.delete('/:id', {
    preHandler: [app.authenticate, app.requireRole(['super_admin', 'admin'])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Soft delete only
    await request.logAudit({
      action: AUDIT_ACTIONS.DOC_DELETED,
      resourceType: 'document',
      resourceId: id,
    });
    return reply.send({ message: 'Document deleted', id });
  });
}
