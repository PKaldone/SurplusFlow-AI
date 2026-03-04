// ============================================================
// SurplusFlow AI — Jurisdiction Rule Engine
// Evaluates compliance rules for a given opportunity context
// ============================================================

import type {
  JurisdictionRule,
  RuleEvalInput,
  RuleEvaluation,
  RuleEvalResult,
  RuleConstraint,
  SourceType,
} from '@surplusflow/shared';

/**
 * Core rule evaluation function.
 *
 * Inputs: opportunity source_type, jurisdiction, configured fee, dates
 * Outputs: ALLOWED | ALLOWED_WITH_CONSTRAINTS | BLOCKED + reasons
 */
export function evaluateRule(input: RuleEvalInput, rule: JurisdictionRule | null): RuleEvaluation {
  // No rule found for jurisdiction
  if (!rule) {
    return {
      result: 'ALLOWED_WITH_CONSTRAINTS',
      jurisdictionKey: input.jurisdictionKey,
      sourceType: input.sourceType,
      rule: undefined,
      constraints: [],
      warnings: [
        `No jurisdiction rule found for ${input.jurisdictionKey} / ${input.sourceType}. Proceeding with caution.`,
        'REQUIRES LEGAL VERIFICATION: Verify all compliance requirements before proceeding.',
      ],
      blockedReasons: [],
      verificationStatus: 'UNVERIFIED',
    };
  }

  const constraints: RuleConstraint[] = [];
  const warnings: string[] = [];
  const blockedReasons: string[] = [];

  // --- Check rule verification status ---
  if (rule.verificationStatus !== 'VERIFIED') {
    warnings.push(
      `Rule verification status: ${rule.verificationStatus}. REQUIRES LEGAL VERIFICATION before relying on these constraints.`
    );
  }

  // --- Check expiration ---
  if (rule.expirationDate && new Date(rule.expirationDate) < new Date()) {
    warnings.push(`Rule expired on ${rule.expirationDate}. REQUIRES LEGAL VERIFICATION for current rules.`);
  }

  // --- License/Bond checks ---
  if (rule.licenseRequired) {
    constraints.push({
      field: 'license',
      constraint: 'LICENSE_REQUIRED',
      enforcedValue: true,
      reason: `License required in ${input.jurisdictionKey}. Verify current license status before proceeding.`,
    });
  }

  if (rule.bondRequired) {
    constraints.push({
      field: 'bond',
      constraint: 'BOND_REQUIRED',
      enforcedValue: rule.bondAmount,
      reason: `Bond required in ${input.jurisdictionKey}${rule.bondAmount ? ` (amount: $${rule.bondAmount})` : ''}. Verify current bond status.`,
    });
  }

  // --- Fee compliance ---
  if (rule.maxFeePercent != null && input.configuredFeePercent > rule.maxFeePercent) {
    constraints.push({
      field: 'fee_percent',
      constraint: 'FEE_EXCEEDS_MAX',
      enforcedValue: rule.maxFeePercent,
      reason: `Configured fee ${input.configuredFeePercent}% exceeds max allowed ${rule.maxFeePercent}% in ${input.jurisdictionKey}. Fee will be capped.`,
    });
  }

  if (rule.feeCapAmount != null) {
    constraints.push({
      field: 'fee_cap',
      constraint: 'FEE_CAP_APPLIES',
      enforcedValue: rule.feeCapAmount,
      reason: `Fee cap of $${rule.feeCapAmount} applies in ${input.jurisdictionKey}.`,
    });
  }

  // --- Solicitation window ---
  if (rule.solicitationRestricted && rule.solicitationWindowDays && input.solicitationDate && input.opportunitySurplusDate) {
    const eventDate = new Date(input.opportunitySurplusDate);
    const solicitDate = new Date(input.solicitationDate);
    const windowEnd = new Date(eventDate);
    windowEnd.setDate(windowEnd.getDate() + rule.solicitationWindowDays);

    if (solicitDate < windowEnd) {
      blockedReasons.push(
        `Solicitation date ${input.solicitationDate} falls within the ${rule.solicitationWindowDays}-day restricted window after event date ${input.opportunitySurplusDate} in ${input.jurisdictionKey}. Contact not allowed until ${windowEnd.toISOString().split('T')[0]}.`
      );
    }
  }

  // --- Cooling-off period ---
  if (rule.coolingOffDays > 0) {
    constraints.push({
      field: 'cooling_off',
      constraint: 'COOLING_OFF_REQUIRED',
      enforcedValue: rule.coolingOffDays,
      reason: `${rule.coolingOffDays}-day cooling-off/rescission period required in ${input.jurisdictionKey}. Contract must include rescission clause.`,
    });
  }

  // --- Notarization ---
  if (rule.notarizationRequired) {
    constraints.push({
      field: 'notarization',
      constraint: 'NOTARIZATION_REQUIRED',
      enforcedValue: true,
      reason: `Notarization required for contracts in ${input.jurisdictionKey}. Include notary page.`,
    });
  }

  // --- Assignment ---
  if (!rule.assignmentAllowed) {
    constraints.push({
      field: 'assignment',
      constraint: 'ASSIGNMENT_NOT_ALLOWED',
      enforcedValue: false,
      reason: `Assignment of claim is not allowed in ${input.jurisdictionKey}. Do NOT include assignment addendum.`,
    });
  }

  // --- Judicial filing ---
  if (rule.judicialFilingRequired) {
    constraints.push({
      field: 'judicial_filing',
      constraint: 'ATTORNEY_REQUIRED',
      enforcedValue: true,
      reason: `Judicial filing required in ${input.jurisdictionKey}. Must route to attorney for court filing.`,
    });
  }

  // --- Required disclosures ---
  if (rule.requiredDisclosures && rule.requiredDisclosures.length > 0) {
    constraints.push({
      field: 'disclosures',
      constraint: 'DISCLOSURES_REQUIRED',
      enforcedValue: rule.requiredDisclosures.join(', '),
      reason: `Required disclosures in ${input.jurisdictionKey}: ${rule.requiredDisclosures.join(', ')}`,
    });
  }

  // --- Prohibited practices ---
  if (rule.prohibitedPractices && rule.prohibitedPractices.length > 0) {
    warnings.push(
      `Prohibited practices in ${input.jurisdictionKey}: ${rule.prohibitedPractices.join('; ')}`
    );
  }

  // --- Determine result ---
  let result: RuleEvalResult;

  if (blockedReasons.length > 0) {
    result = 'BLOCKED';
  } else if (constraints.length > 0 || warnings.length > 0) {
    result = 'ALLOWED_WITH_CONSTRAINTS';
  } else {
    result = 'ALLOWED';
  }

  return {
    result,
    jurisdictionKey: input.jurisdictionKey,
    sourceType: input.sourceType,
    rule,
    constraints,
    warnings,
    blockedReasons,
    verificationStatus: rule.verificationStatus,
  };
}

/**
 * Find the best matching rule for a jurisdiction and source type.
 * Prefers county-level over state-level, most recent effective date.
 */
export function findBestRule(
  rules: JurisdictionRule[],
  jurisdictionKey: string,
  sourceType: SourceType,
  asOfDate: Date = new Date()
): JurisdictionRule | null {
  const matching = rules
    .filter(r => {
      // Match jurisdiction: exact match or state-level fallback
      const jurisdictionMatch = r.jurisdictionKey === jurisdictionKey ||
        r.jurisdictionKey === jurisdictionKey.split('-')[0];
      const sourceMatch = r.sourceType === sourceType;
      const dateMatch = new Date(r.effectiveDate) <= asOfDate;
      const notExpired = !r.expirationDate || new Date(r.expirationDate) >= asOfDate;
      return jurisdictionMatch && sourceMatch && dateMatch && notExpired;
    })
    .sort((a, b) => {
      // Prefer exact jurisdiction match over state-level
      const aExact = a.jurisdictionKey === jurisdictionKey ? 1 : 0;
      const bExact = b.jurisdictionKey === jurisdictionKey ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      // Then prefer most recent effective date
      return new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime();
    });

  return matching[0] || null;
}

/**
 * Full evaluation pipeline: find rule + evaluate
 */
export function evaluateJurisdiction(
  input: RuleEvalInput,
  allRules: JurisdictionRule[]
): RuleEvaluation {
  const rule = findBestRule(allRules, input.jurisdictionKey, input.sourceType);
  return evaluateRule(input, rule);
}

/**
 * Batch evaluate multiple opportunities
 */
export function evaluateBatch(
  inputs: RuleEvalInput[],
  allRules: JurisdictionRule[]
): RuleEvaluation[] {
  return inputs.map(input => evaluateJurisdiction(input, allRules));
}

/**
 * Get enforced fee for a jurisdiction (caps the configured fee)
 */
export function getEnforcedFee(
  configuredFeePercent: number,
  rule: JurisdictionRule | null
): { feePercent: number; feeCap?: number; wasCapped: boolean } {
  if (!rule) return { feePercent: configuredFeePercent, wasCapped: false };

  let feePercent = configuredFeePercent;
  let wasCapped = false;

  if (rule.maxFeePercent != null && configuredFeePercent > rule.maxFeePercent) {
    feePercent = rule.maxFeePercent;
    wasCapped = true;
  }

  return {
    feePercent,
    feeCap: rule.feeCapAmount ?? undefined,
    wasCapped,
  };
}
