// ============================================================
// SurplusFlow AI — Rule Engine Tests
// 15 test cases covering all evaluation paths
// ============================================================

import { evaluateRule, findBestRule, getEnforcedFee, evaluateJurisdiction } from '../src/engine.js';
import type { JurisdictionRule, RuleEvalInput } from '@surplusflow/shared';

// --- Test Fixtures ---

function makeRule(overrides: Partial<JurisdictionRule> = {}): JurisdictionRule {
  return {
    id: 'rule-001',
    jurisdictionKey: 'CA',
    state: 'CA',
    sourceType: 'unclaimed_property',
    effectiveDate: '2024-01-01',
    coolingOffDays: 0,
    notarizationRequired: false,
    assignmentAllowed: true,
    licenseRequired: false,
    bondRequired: false,
    solicitationRestricted: false,
    requiredDisclosures: [],
    prohibitedPractices: [],
    filingRequirements: {},
    judicialFilingRequired: false,
    verificationStatus: 'VERIFIED',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<RuleEvalInput> = {}): RuleEvalInput {
  return {
    sourceType: 'unclaimed_property',
    jurisdictionKey: 'CA',
    state: 'CA',
    configuredFeePercent: 10,
    ...overrides,
  };
}

// --- Test Runner ---

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];
function test(name: string, fn: () => void) { tests.push({ name, fn }); }
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ============================================================
// TEST CASES
// ============================================================

test('TC01: No rule found — returns ALLOWED_WITH_CONSTRAINTS + warnings', () => {
  const result = evaluateRule(makeInput(), null);
  assert(result.result === 'ALLOWED_WITH_CONSTRAINTS', 'Should be ALLOWED_WITH_CONSTRAINTS');
  assert(result.warnings.length >= 1, 'Should have warning about no rule');
  assert(result.warnings.some(w => w.includes('No jurisdiction rule found')), 'Should mention no rule found');
  assert(result.verificationStatus === 'UNVERIFIED', 'Should be UNVERIFIED');
});

test('TC02: Valid rule, no constraints — ALLOWED', () => {
  const rule = makeRule({ maxFeePercent: 15, coolingOffDays: 0 });
  const result = evaluateRule(makeInput({ configuredFeePercent: 10 }), rule);
  assert(result.result === 'ALLOWED', 'Should be ALLOWED with no constraints');
  assert(result.blockedReasons.length === 0, 'No blocked reasons');
  assert(result.constraints.length === 0, 'No constraints');
});

test('TC03: Fee exceeds max — constraint added, fee capped', () => {
  const rule = makeRule({ maxFeePercent: 10 });
  const result = evaluateRule(makeInput({ configuredFeePercent: 33 }), rule);
  assert(result.result === 'ALLOWED_WITH_CONSTRAINTS', 'Should be ALLOWED_WITH_CONSTRAINTS');
  assert(result.constraints.some(c => c.constraint === 'FEE_EXCEEDS_MAX'), 'Should flag fee exceeds max');
  const feeConstraint = result.constraints.find(c => c.constraint === 'FEE_EXCEEDS_MAX');
  assert(feeConstraint?.enforcedValue === 10, 'Enforced fee should be 10');
});

test('TC04: Fee cap applies — constraint includes cap amount', () => {
  const rule = makeRule({ feeCapAmount: 5000 });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'FEE_CAP_APPLIES'), 'Should flag fee cap');
  const capConstraint = result.constraints.find(c => c.constraint === 'FEE_CAP_APPLIES');
  assert(capConstraint?.enforcedValue === 5000, 'Cap should be 5000');
});

test('TC05: Solicitation window violation — BLOCKED', () => {
  const rule = makeRule({
    solicitationRestricted: true,
    solicitationWindowDays: 30,
  });
  const input = makeInput({
    solicitationDate: '2024-03-10',
    opportunitySurplusDate: '2024-03-01',
  });
  const result = evaluateRule(input, rule);
  assert(result.result === 'BLOCKED', 'Should be BLOCKED');
  assert(result.blockedReasons.length > 0, 'Should have blocked reason');
  assert(result.blockedReasons[0].includes('restricted window'), 'Should mention restricted window');
});

test('TC06: Solicitation window passed — not blocked', () => {
  const rule = makeRule({
    solicitationRestricted: true,
    solicitationWindowDays: 30,
  });
  const input = makeInput({
    solicitationDate: '2024-05-15',
    opportunitySurplusDate: '2024-03-01',
  });
  const result = evaluateRule(input, rule);
  assert(result.result !== 'BLOCKED', 'Should NOT be blocked after window passes');
  assert(result.blockedReasons.length === 0, 'No blocked reasons');
});

test('TC07: Cooling-off period enforced', () => {
  const rule = makeRule({ coolingOffDays: 5 });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'COOLING_OFF_REQUIRED'), 'Should require cooling off');
  const coolingConstraint = result.constraints.find(c => c.constraint === 'COOLING_OFF_REQUIRED');
  assert(coolingConstraint?.enforcedValue === 5, 'Should be 5 days');
});

test('TC08: Notarization required', () => {
  const rule = makeRule({ notarizationRequired: true });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'NOTARIZATION_REQUIRED'), 'Should require notarization');
});

test('TC09: Assignment not allowed', () => {
  const rule = makeRule({ assignmentAllowed: false });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'ASSIGNMENT_NOT_ALLOWED'), 'Should flag no assignment');
});

test('TC10: License required', () => {
  const rule = makeRule({ licenseRequired: true });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'LICENSE_REQUIRED'), 'Should require license');
});

test('TC11: Bond required with amount', () => {
  const rule = makeRule({ bondRequired: true, bondAmount: 25000 });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'BOND_REQUIRED'), 'Should require bond');
  const bondConstraint = result.constraints.find(c => c.constraint === 'BOND_REQUIRED');
  assert(bondConstraint?.enforcedValue === 25000, 'Bond amount should be 25000');
});

test('TC12: Judicial filing required — routes to attorney', () => {
  const rule = makeRule({ judicialFilingRequired: true });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'ATTORNEY_REQUIRED'), 'Should require attorney');
});

test('TC13: UNVERIFIED rule — warning added', () => {
  const rule = makeRule({ verificationStatus: 'UNVERIFIED' });
  const result = evaluateRule(makeInput(), rule);
  assert(result.warnings.some(w => w.includes('UNVERIFIED')), 'Should warn about unverified status');
  assert(result.verificationStatus === 'UNVERIFIED', 'Status should be UNVERIFIED');
});

test('TC14: Required disclosures listed', () => {
  const rule = makeRule({ requiredDisclosures: ['fee_disclosure', 'free_filing_disclosure', 'rescission_disclosure'] });
  const result = evaluateRule(makeInput(), rule);
  assert(result.constraints.some(c => c.constraint === 'DISCLOSURES_REQUIRED'), 'Should list required disclosures');
  const discConstraint = result.constraints.find(c => c.constraint === 'DISCLOSURES_REQUIRED');
  assert(typeof discConstraint?.enforcedValue === 'string', 'Should be string of disclosures');
  assert((discConstraint?.enforcedValue as string).includes('fee_disclosure'), 'Should include fee_disclosure');
});

test('TC15: Expired rule — warning added', () => {
  const rule = makeRule({ expirationDate: '2023-01-01' });
  const result = evaluateRule(makeInput(), rule);
  assert(result.warnings.some(w => w.includes('expired')), 'Should warn about expired rule');
});

// --- findBestRule tests ---

test('TC16: findBestRule prefers county-level over state-level', () => {
  const rules: JurisdictionRule[] = [
    makeRule({ id: 'state', jurisdictionKey: 'FL', state: 'FL', sourceType: 'foreclosure_surplus' }),
    makeRule({ id: 'county', jurisdictionKey: 'FL-MIAMI_DADE', state: 'FL', county: 'MIAMI_DADE', sourceType: 'foreclosure_surplus', maxFeePercent: 8 }),
  ];
  const found = findBestRule(rules, 'FL-MIAMI_DADE', 'foreclosure_surplus');
  assert(found?.id === 'county', 'Should prefer county-level rule');
  assert(found?.maxFeePercent === 8, 'Should have county-specific fee');
});

test('TC17: findBestRule falls back to state-level when no county rule', () => {
  const rules: JurisdictionRule[] = [
    makeRule({ id: 'state', jurisdictionKey: 'FL', state: 'FL', sourceType: 'foreclosure_surplus', maxFeePercent: 10 }),
  ];
  const found = findBestRule(rules, 'FL-BROWARD', 'foreclosure_surplus');
  assert(found?.id === 'state', 'Should fall back to state-level');
});

test('TC18: findBestRule returns null when no match', () => {
  const rules: JurisdictionRule[] = [
    makeRule({ jurisdictionKey: 'CA', sourceType: 'unclaimed_property' }),
  ];
  const found = findBestRule(rules, 'TX', 'tax_sale_surplus');
  assert(found === null, 'Should return null for no match');
});

// --- getEnforcedFee tests ---

test('TC19: getEnforcedFee caps fee correctly', () => {
  const rule = makeRule({ maxFeePercent: 10 });
  const result = getEnforcedFee(33, rule);
  assert(result.feePercent === 10, 'Fee should be capped to 10');
  assert(result.wasCapped === true, 'Should indicate fee was capped');
});

test('TC20: getEnforcedFee passes through when under limit', () => {
  const rule = makeRule({ maxFeePercent: 33 });
  const result = getEnforcedFee(15, rule);
  assert(result.feePercent === 15, 'Fee should remain 15');
  assert(result.wasCapped === false, 'Should not be capped');
});

// --- Multiple constraints combined ---

test('TC21: Multiple constraints — FL foreclosure with all flags', () => {
  const rule = makeRule({
    jurisdictionKey: 'FL',
    state: 'FL',
    sourceType: 'foreclosure_surplus',
    maxFeePercent: 10,
    coolingOffDays: 3,
    notarizationRequired: true,
    assignmentAllowed: false,
    judicialFilingRequired: true,
    requiredDisclosures: ['free_filing_disclosure', 'fee_disclosure', 'rescission_disclosure', 'no_legal_advice'],
    solicitationRestricted: true,
    solicitationWindowDays: 45,
  });
  const input = makeInput({
    sourceType: 'foreclosure_surplus',
    jurisdictionKey: 'FL',
    state: 'FL',
    configuredFeePercent: 25,
    solicitationDate: '2024-06-01',
    opportunitySurplusDate: '2024-01-01',
  });
  const result = evaluateRule(input, rule);
  assert(result.result === 'ALLOWED_WITH_CONSTRAINTS', 'Should be ALLOWED_WITH_CONSTRAINTS');
  assert(result.constraints.length >= 5, 'Should have multiple constraints');
  assert(result.constraints.some(c => c.constraint === 'FEE_EXCEEDS_MAX'), 'Fee constraint');
  assert(result.constraints.some(c => c.constraint === 'COOLING_OFF_REQUIRED'), 'Cooling off');
  assert(result.constraints.some(c => c.constraint === 'NOTARIZATION_REQUIRED'), 'Notarization');
  assert(result.constraints.some(c => c.constraint === 'ASSIGNMENT_NOT_ALLOWED'), 'No assignment');
  assert(result.constraints.some(c => c.constraint === 'ATTORNEY_REQUIRED'), 'Attorney required');
  assert(result.constraints.some(c => c.constraint === 'DISCLOSURES_REQUIRED'), 'Disclosures');
});

// ============================================================
// RUN ALL TESTS
// ============================================================

let passed = 0;
let failed = 0;

console.log('\n=== SurplusFlow Rule Engine Tests ===\n');

for (const t of tests) {
  try {
    t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${t.name}`);
    console.log(`    ${(err as Error).message}`);
    failed++;
  }
}

console.log(`\n  ${passed} passed, ${failed} failed, ${tests.length} total\n`);

if (failed > 0) process.exit(1);
