// ============================================================
// Document Generation Processor
// Generates contracts, claim packets, attorney dossiers, and invoices.
// Currently produces JSON documents; PDF rendering will be added later.
// ============================================================
import { Job } from 'bullmq';
import crypto from 'node:crypto';
import { query } from '../lib/db.js';
import { STORAGE_BUCKETS, AUDIT_ACTIONS } from '@surplusflow/shared';

// --- Helpers ---

function uuid(): string {
  return crypto.randomUUID();
}

async function insertAuditLog(
  action: string,
  resourceType: string,
  resourceId: string | null,
  caseId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO audit_log (action, resource_type, resource_id, case_id, details, actor_role)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [action, resourceType, resourceId, caseId, JSON.stringify(details), 'system'],
  );
}

async function insertStatusHistory(
  caseId: string,
  fromStatus: string | null,
  toStatus: string,
  reason: string,
): Promise<void> {
  await query(
    `INSERT INTO case_status_history (case_id, from_status, to_status, reason)
     VALUES ($1, $2, $3, $4)`,
    [caseId, fromStatus, toStatus, reason],
  );
}

// --- generate-contract ---

async function handleGenerateContract(caseId: string): Promise<string> {
  // 1. Fetch case + claimant + opportunity + jurisdiction rule
  const { rows: [caseRow] } = await query(
    `SELECT cc.*, cl.first_name, cl.last_name, cl.middle_name,
            cl.email AS claimant_email, cl.phone AS claimant_phone,
            cl.address_line1, cl.address_line2, cl.city AS claimant_city,
            cl.state AS claimant_state, cl.zip AS claimant_zip,
            cl.ssn_last4, cl.date_of_birth,
            o.source_type AS opp_source_type, o.property_description,
            o.reported_amount, o.holder_name, o.owner_name,
            o.parcel_number, o.sale_date, o.surplus_date, o.deadline_date
     FROM claim_cases cc
     JOIN claimants cl ON cl.id = cc.claimant_id
     JOIN opportunities o ON o.id = cc.opportunity_id
     WHERE cc.id = $1`,
    [caseId],
  );

  if (!caseRow) {
    throw new Error(`Case not found: ${caseId}`);
  }

  // 2. Fetch matching jurisdiction rule
  const { rows: [rule] } = await query(
    `SELECT * FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [caseRow.jurisdiction_key, caseRow.source_type],
  );

  // 3. Find matching contract template
  const { rows: [template] } = await query(
    `SELECT * FROM contract_templates
     WHERE (jurisdiction_key = $1 OR jurisdiction_key IS NULL)
       AND (source_type = $2 OR source_type IS NULL)
       AND is_active = TRUE
     ORDER BY
       CASE WHEN jurisdiction_key = $1 AND source_type = $2 THEN 0
            WHEN jurisdiction_key = $1 THEN 1
            WHEN source_type = $2 THEN 2
            ELSE 3 END,
       effective_date DESC NULLS LAST
     LIMIT 1`,
    [caseRow.jurisdiction_key, caseRow.source_type],
  );

  const templateId = template?.id ?? null;

  // 4. Build merge data
  const mergeData = {
    generatedAt: new Date().toISOString(),
    caseNumber: caseRow.case_number,
    caseId,
    claimant: {
      fullName: [caseRow.first_name, caseRow.middle_name, caseRow.last_name].filter(Boolean).join(' '),
      firstName: caseRow.first_name,
      lastName: caseRow.last_name,
      email: caseRow.claimant_email,
      phone: caseRow.claimant_phone,
      address: [caseRow.address_line1, caseRow.address_line2].filter(Boolean).join(', '),
      city: caseRow.claimant_city,
      state: caseRow.claimant_state,
      zip: caseRow.claimant_zip,
      ssnLast4: caseRow.ssn_last4,
      dateOfBirth: caseRow.date_of_birth,
    },
    opportunity: {
      sourceType: caseRow.opp_source_type,
      propertyDescription: caseRow.property_description,
      reportedAmount: caseRow.reported_amount,
      holderName: caseRow.holder_name,
      ownerName: caseRow.owner_name,
      parcelNumber: caseRow.parcel_number,
      saleDate: caseRow.sale_date,
      surplusDate: caseRow.surplus_date,
      deadlineDate: caseRow.deadline_date,
    },
    terms: {
      feePercent: caseRow.agreed_fee_pct,
      feeCap: caseRow.agreed_fee_cap,
      claimedAmount: caseRow.claimed_amount,
      jurisdictionKey: caseRow.jurisdiction_key,
      state: caseRow.state,
      county: caseRow.county,
    },
    jurisdictionRule: rule ? {
      maxFeePercent: rule.max_fee_percent,
      feeCapAmount: rule.fee_cap_amount,
      coolingOffDays: rule.cooling_off_days,
      notarizationRequired: rule.notarization_required,
      assignmentAllowed: rule.assignment_allowed,
      requiredDisclosures: rule.required_disclosures,
      statuteReference: rule.statute_reference,
    } : null,
    templateId,
    templateVersion: template?.version ?? null,
  };

  // 5. Insert document record
  const docId = uuid();
  const storageKey = `contracts/${caseId}/${docId}.json`;

  await query(
    `INSERT INTO documents (id, case_id, claimant_id, doc_type, doc_category, filename, mime_type, storage_key, storage_bucket, metadata)
     VALUES ($1, $2, $3, 'contract', 'generated', $4, 'application/json', $5, $6, $7)`,
    [
      docId,
      caseId,
      caseRow.claimant_id,
      `contract-${caseRow.case_number}.json`,
      storageKey,
      STORAGE_BUCKETS.GENERATED,
      JSON.stringify({ mergeData }),
    ],
  );

  // 6. Insert executed contract (no signature yet)
  await query(
    `INSERT INTO executed_contracts (case_id, template_id, document_id, merge_data)
     VALUES ($1, $2, $3, $4)`,
    [caseId, templateId, docId, JSON.stringify(mergeData)],
  );

  // 7. Audit log
  await insertAuditLog(
    AUDIT_ACTIONS.CONTRACT_GENERATED,
    'document',
    docId,
    caseId,
    { documentId: docId, templateId, caseNumber: caseRow.case_number },
  );

  console.log(`[DocGen] Contract generated for case ${caseRow.case_number} -> doc ${docId}`);
  return docId;
}

// --- generate-packet ---

async function handleGeneratePacket(caseId: string): Promise<string> {
  // 1. Fetch case
  const { rows: [caseRow] } = await query(
    `SELECT id, case_number, claimant_id, status FROM claim_cases WHERE id = $1`,
    [caseId],
  );

  if (!caseRow) {
    throw new Error(`Case not found: ${caseId}`);
  }

  // 2. Fetch all documents for the case
  const { rows: docs } = await query(
    `SELECT id, doc_type, doc_category, filename, storage_key, created_at
     FROM documents WHERE case_id = $1
     ORDER BY doc_category, doc_type, created_at`,
    [caseId],
  );

  // 3. Build manifest/checklist
  const requiredTypes = ['contract', 'id_front', 'id_back'];
  const presentTypes = docs.map((d: { doc_type: string }) => d.doc_type);
  const missingTypes = requiredTypes.filter(t => !presentTypes.includes(t));

  const manifest = {
    generatedAt: new Date().toISOString(),
    caseNumber: caseRow.case_number,
    caseId,
    totalDocuments: docs.length,
    documents: docs.map((d: { id: string; doc_type: string; doc_category: string; filename: string; storage_key: string; created_at: string }) => ({
      id: d.id,
      type: d.doc_type,
      category: d.doc_category,
      filename: d.filename,
      storageKey: d.storage_key,
      addedAt: d.created_at,
    })),
    checklist: {
      required: requiredTypes,
      present: presentTypes,
      missing: missingTypes,
      complete: missingTypes.length === 0,
    },
  };

  // 4. Insert packet document record
  const docId = uuid();
  const storageKey = `packets/${caseId}/${docId}.json`;

  await query(
    `INSERT INTO documents (id, case_id, claimant_id, doc_type, doc_category, filename, mime_type, storage_key, storage_bucket, metadata)
     VALUES ($1, $2, $3, 'claim_packet', 'generated', $4, 'application/json', $5, $6, $7)`,
    [
      docId,
      caseId,
      caseRow.claimant_id,
      `packet-${caseRow.case_number}.json`,
      storageKey,
      STORAGE_BUCKETS.GENERATED,
      JSON.stringify(manifest),
    ],
  );

  // 5. If case is in PACKET_ASSEMBLY, transition to SUBMITTED
  if (caseRow.status === 'PACKET_ASSEMBLY') {
    await query(
      `UPDATE claim_cases
       SET status = 'SUBMITTED', previous_status = $2, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [caseId, caseRow.status],
    );

    await insertStatusHistory(
      caseId,
      caseRow.status,
      'SUBMITTED',
      'Claim packet assembled and submitted.',
    );
  }

  // 6. Audit log
  await insertAuditLog(
    AUDIT_ACTIONS.DOC_UPLOADED,
    'document',
    docId,
    caseId,
    {
      documentId: docId,
      docType: 'claim_packet',
      totalDocuments: docs.length,
      missingTypes,
      caseNumber: caseRow.case_number,
    },
  );

  console.log(`[DocGen] Packet generated for case ${caseRow.case_number} -> doc ${docId} (${docs.length} docs, ${missingTypes.length} missing)`);
  return docId;
}

// --- generate-dossier ---

async function handleGenerateDossier(caseId: string, attorneyId: string): Promise<string> {
  // 1. Fetch case + claimant (redact SSN) + opportunity + rule
  const { rows: [caseRow] } = await query(
    `SELECT cc.*, cl.first_name, cl.last_name, cl.middle_name,
            cl.email AS claimant_email, cl.phone AS claimant_phone,
            cl.address_line1, cl.city AS claimant_city,
            cl.state AS claimant_state, cl.zip AS claimant_zip,
            cl.ssn_last4, cl.date_of_birth, cl.identity_verified,
            o.source_type AS opp_source_type, o.property_description,
            o.reported_amount, o.holder_name, o.owner_name,
            o.parcel_number, o.sale_date, o.surplus_date, o.deadline_date, o.source_url
     FROM claim_cases cc
     JOIN claimants cl ON cl.id = cc.claimant_id
     JOIN opportunities o ON o.id = cc.opportunity_id
     WHERE cc.id = $1`,
    [caseId],
  );

  if (!caseRow) {
    throw new Error(`Case not found: ${caseId}`);
  }

  // Fetch jurisdiction rule
  const { rows: [rule] } = await query(
    `SELECT * FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [caseRow.jurisdiction_key, caseRow.source_type],
  );

  // Fetch case status history
  const { rows: timeline } = await query(
    `SELECT from_status, to_status, reason, created_at
     FROM case_status_history WHERE case_id = $1
     ORDER BY created_at ASC`,
    [caseId],
  );

  // 2. Build dossier JSON (SSN redacted to last 4)
  const dossier = {
    generatedAt: new Date().toISOString(),
    caseNumber: caseRow.case_number,
    caseId,
    attorneyId,
    caseSummary: {
      status: caseRow.status,
      sourceType: caseRow.source_type,
      jurisdictionKey: caseRow.jurisdiction_key,
      state: caseRow.state,
      county: caseRow.county,
      claimedAmount: caseRow.claimed_amount,
      feePercent: caseRow.agreed_fee_pct,
      feeCap: caseRow.agreed_fee_cap,
      createdAt: caseRow.created_at,
    },
    claimant: {
      fullName: [caseRow.first_name, caseRow.middle_name, caseRow.last_name].filter(Boolean).join(' '),
      email: caseRow.claimant_email,
      phone: caseRow.claimant_phone,
      address: caseRow.address_line1,
      city: caseRow.claimant_city,
      state: caseRow.claimant_state,
      zip: caseRow.claimant_zip,
      ssnRedacted: caseRow.ssn_last4 ? `***-**-${caseRow.ssn_last4}` : null,
      dateOfBirth: caseRow.date_of_birth,
      identityVerified: caseRow.identity_verified,
    },
    opportunity: {
      sourceType: caseRow.opp_source_type,
      propertyDescription: caseRow.property_description,
      reportedAmount: caseRow.reported_amount,
      holderName: caseRow.holder_name,
      ownerName: caseRow.owner_name,
      parcelNumber: caseRow.parcel_number,
      saleDate: caseRow.sale_date,
      surplusDate: caseRow.surplus_date,
      deadlineDate: caseRow.deadline_date,
      sourceUrl: caseRow.source_url,
    },
    jurisdictionRule: rule ? {
      maxFeePercent: rule.max_fee_percent,
      feeCapAmount: rule.fee_cap_amount,
      coolingOffDays: rule.cooling_off_days,
      notarizationRequired: rule.notarization_required,
      assignmentAllowed: rule.assignment_allowed,
      judicialFilingRequired: rule.judicial_filing_required,
      requiredDisclosures: rule.required_disclosures,
      filingRequirements: rule.filing_requirements,
      statuteReference: rule.statute_reference,
    } : null,
    timeline,
  };

  // 3. Insert document record
  const docId = uuid();
  const storageKey = `dossiers/${caseId}/${docId}.json`;

  await query(
    `INSERT INTO documents (id, case_id, claimant_id, doc_type, doc_category, filename, mime_type, storage_key, storage_bucket, is_sensitive, metadata)
     VALUES ($1, $2, $3, 'dossier', 'generated', $4, 'application/json', $5, $6, TRUE, $7)`,
    [
      docId,
      caseId,
      caseRow.claimant_id,
      `dossier-${caseRow.case_number}.json`,
      storageKey,
      STORAGE_BUCKETS.GENERATED,
      JSON.stringify({ attorneyId }),
    ],
  );

  // 4. Insert or update attorney_assignments with dossier_doc_id
  const { rows: existingAssignment } = await query(
    `SELECT id FROM attorney_assignments WHERE case_id = $1 AND attorney_id = $2`,
    [caseId, attorneyId],
  );

  if (existingAssignment.length > 0) {
    await query(
      `UPDATE attorney_assignments SET dossier_doc_id = $1, updated_at = NOW() WHERE id = $2`,
      [docId, existingAssignment[0].id],
    );
  } else {
    await query(
      `INSERT INTO attorney_assignments (case_id, attorney_id, status, routing_reason, dossier_doc_id)
       VALUES ($1, $2, 'pending', 'dossier-generated', $3)`,
      [caseId, attorneyId, docId],
    );
  }

  // 5. Audit log
  await insertAuditLog(
    AUDIT_ACTIONS.ATTORNEY_ASSIGNED,
    'document',
    docId,
    caseId,
    { documentId: docId, attorneyId, caseNumber: caseRow.case_number },
  );

  console.log(`[DocGen] Dossier generated for case ${caseRow.case_number}, attorney ${attorneyId} -> doc ${docId}`);
  return docId;
}

// --- generate-invoice ---

async function handleGenerateInvoice(caseId: string): Promise<string> {
  // 1. Fetch case + claimant
  const { rows: [caseRow] } = await query(
    `SELECT cc.id, cc.case_number, cc.claimant_id, cc.status, cc.claimed_amount,
            cc.agreed_fee_pct, cc.agreed_fee_cap, cc.jurisdiction_key, cc.source_type,
            cl.first_name, cl.last_name, cl.email AS claimant_email
     FROM claim_cases cc
     JOIN claimants cl ON cl.id = cc.claimant_id
     WHERE cc.id = $1`,
    [caseId],
  );

  if (!caseRow) {
    throw new Error(`Case not found: ${caseId}`);
  }

  const claimedAmount = Number(caseRow.claimed_amount || 0);
  const feePercent = Number(caseRow.agreed_fee_pct || 33);
  const feeCap = caseRow.agreed_fee_cap ? Number(caseRow.agreed_fee_cap) : null;

  // 2. Calculate fee
  let calculatedFee = claimedAmount * (feePercent / 100);

  // 3. Check jurisdiction rule for fee cap enforcement
  const { rows: [rule] } = await query(
    `SELECT max_fee_percent, fee_cap_amount FROM jurisdiction_rules
     WHERE jurisdiction_key = $1 AND source_type = $2
       AND effective_date <= CURRENT_DATE
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     ORDER BY effective_date DESC LIMIT 1`,
    [caseRow.jurisdiction_key, caseRow.source_type],
  );

  if (rule?.fee_cap_amount != null) {
    calculatedFee = Math.min(calculatedFee, Number(rule.fee_cap_amount));
  }
  if (feeCap != null) {
    calculatedFee = Math.min(calculatedFee, feeCap);
  }
  if (rule?.max_fee_percent != null) {
    const maxByRule = claimedAmount * (Number(rule.max_fee_percent) / 100);
    calculatedFee = Math.min(calculatedFee, maxByRule);
  }

  const finalFee = Math.round(calculatedFee * 100) / 100;

  // 4. Generate invoice number: INV-{year}-{sequential 4-digit}
  const year = new Date().getFullYear();
  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*)::int AS count FROM invoices WHERE invoice_number LIKE $1`,
    [`INV-${year}-%`],
  );
  const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

  // 5. Insert into invoices
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const { rows: [invoice] } = await query(
    `INSERT INTO invoices (invoice_number, case_id, claimant_id, payout_amount, fee_percent, fee_cap, calculated_fee, final_fee, status, issued_at, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), $9)
     RETURNING id`,
    [
      invoiceNumber,
      caseId,
      caseRow.claimant_id,
      claimedAmount,
      feePercent,
      feeCap,
      calculatedFee,
      finalFee,
      dueDate.toISOString().split('T')[0],
    ],
  );

  // 6. Insert document record
  const docId = uuid();
  const storageKey = `invoices/${caseId}/${docId}.json`;

  const invoiceDoc = {
    generatedAt: new Date().toISOString(),
    invoiceNumber,
    invoiceId: invoice.id,
    caseNumber: caseRow.case_number,
    caseId,
    claimant: {
      fullName: `${caseRow.first_name} ${caseRow.last_name}`,
      email: caseRow.claimant_email,
    },
    amounts: {
      claimedAmount,
      feePercent,
      feeCap,
      calculatedFee,
      finalFee,
      jurisdictionFeeCap: rule?.fee_cap_amount ? Number(rule.fee_cap_amount) : null,
      jurisdictionMaxPercent: rule?.max_fee_percent ? Number(rule.max_fee_percent) : null,
    },
    dueDate: dueDate.toISOString().split('T')[0],
  };

  await query(
    `INSERT INTO documents (id, case_id, claimant_id, doc_type, doc_category, filename, mime_type, storage_key, storage_bucket, metadata)
     VALUES ($1, $2, $3, 'invoice', 'generated', $4, 'application/json', $5, $6, $7)`,
    [
      docId,
      caseId,
      caseRow.claimant_id,
      `invoice-${invoiceNumber}.json`,
      storageKey,
      STORAGE_BUCKETS.GENERATED,
      JSON.stringify(invoiceDoc),
    ],
  );

  // 7. Link document to invoice
  await query(
    `UPDATE invoices SET document_id = $1 WHERE id = $2`,
    [docId, invoice.id],
  );

  // 8. If case in AWAITING_PAYOUT, transition to INVOICED
  if (caseRow.status === 'AWAITING_PAYOUT') {
    await query(
      `UPDATE claim_cases
       SET status = 'INVOICED', previous_status = $2, fee_amount = $3, fee_invoiced_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [caseId, caseRow.status, finalFee],
    );

    await insertStatusHistory(
      caseId,
      caseRow.status,
      'INVOICED',
      `Invoice ${invoiceNumber} generated. Fee: $${finalFee.toFixed(2)}.`,
    );
  }

  // 9. Audit log
  await insertAuditLog(
    AUDIT_ACTIONS.INVOICE_CREATED,
    'invoice',
    invoice.id,
    caseId,
    {
      invoiceNumber,
      invoiceId: invoice.id,
      documentId: docId,
      finalFee,
      claimedAmount,
      feePercent,
      caseNumber: caseRow.case_number,
    },
  );

  console.log(`[DocGen] Invoice ${invoiceNumber} generated for case ${caseRow.case_number} -> fee $${finalFee.toFixed(2)}`);
  return docId;
}

// --- Main Processor ---

export async function processDocgen(job: Job): Promise<void> {
  const { type, caseId } = job.data;

  switch (type) {
    case 'generate-contract':
      await handleGenerateContract(caseId);
      break;

    case 'generate-packet':
      await handleGeneratePacket(caseId);
      break;

    case 'generate-dossier': {
      const { attorneyId } = job.data;
      if (!attorneyId) {
        throw new Error('generate-dossier requires attorneyId');
      }
      await handleGenerateDossier(caseId, attorneyId);
      break;
    }

    case 'generate-invoice':
      await handleGenerateInvoice(caseId);
      break;

    default:
      throw new Error(`Unknown docgen job type: ${type}`);
  }
}
