// ============================================================
// SurplusFlow AI — Contract Template Engine
// Handlebars-based template system with jurisdiction versioning
// ============================================================

import Handlebars from 'handlebars';
import type { ContractMergeData } from '@surplusflow/shared';

// --- Register Helpers ---

Handlebars.registerHelper('ifEquals', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ifTrue', function (this: unknown, value: unknown, options: Handlebars.HelperOptions) {
  return value ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ifFalse', function (this: unknown, value: unknown, options: Handlebars.HelperOptions) {
  return !value ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ifInArray', function (this: unknown, arr: string[], value: string, options: Handlebars.HelperOptions) {
  return Array.isArray(arr) && arr.includes(value) ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('formatDate', function (dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
});

Handlebars.registerHelper('uppercase', function (str: string) {
  return (str || '').toUpperCase();
});

Handlebars.registerHelper('eachDisclosure', function (this: unknown, disclosures: string[], options: Handlebars.HelperOptions) {
  if (!Array.isArray(disclosures)) return '';
  return disclosures.map(d => options.fn({ disclosure: d })).join('');
});

// --- Template Compilation ---

export interface CompiledTemplate {
  key: string;
  version: string;
  jurisdictionKey?: string;
  render: (data: ContractMergeData) => string;
}

/**
 * Compile a Handlebars template string into a render function
 */
export function compileTemplate(
  templateKey: string,
  version: string,
  templateBody: string,
  jurisdictionKey?: string
): CompiledTemplate {
  const compiled = Handlebars.compile(templateBody);
  return {
    key: templateKey,
    version,
    jurisdictionKey,
    render: (data: ContractMergeData) => compiled(data),
  };
}

/**
 * Select the correct template version for a jurisdiction.
 * Priority: jurisdiction-specific > source-type-specific > generic
 */
export function selectTemplate(
  templates: Array<{
    template_key: string;
    version: string;
    jurisdiction_key: string | null;
    source_type: string | null;
    body_template: string;
    is_active: boolean;
  }>,
  templateKey: string,
  jurisdictionKey: string,
  sourceType: string
): { body_template: string; version: string; jurisdiction_key: string | null } | null {
  const active = templates.filter(t => t.template_key === templateKey && t.is_active);

  // Exact jurisdiction + source_type match
  const exact = active.find(t => t.jurisdiction_key === jurisdictionKey && t.source_type === sourceType);
  if (exact) return exact;

  // Jurisdiction match, any source type
  const jurisdictionMatch = active.find(t => t.jurisdiction_key === jurisdictionKey && !t.source_type);
  if (jurisdictionMatch) return jurisdictionMatch;

  // State-level fallback (strip county)
  const stateKey = jurisdictionKey.split('-')[0];
  const stateMatch = active.find(t => t.jurisdiction_key === stateKey && t.source_type === sourceType);
  if (stateMatch) return stateMatch;

  const stateGeneric = active.find(t => t.jurisdiction_key === stateKey && !t.source_type);
  if (stateGeneric) return stateGeneric;

  // Generic (no jurisdiction specified)
  const generic = active.find(t => !t.jurisdiction_key);
  if (generic) return generic;

  return null;
}

/**
 * Render a full contract package for a case
 */
export function renderContractPackage(
  mergeData: ContractMergeData,
  templates: {
    masterAgreement: string;
    disclosureAddendum: string;
    assignmentAddendum?: string;
    notaryPage?: string;
    attorneyConsent?: string;
  }
): {
  masterAgreement: string;
  disclosureAddendum: string;
  assignmentAddendum?: string;
  notaryPage?: string;
  attorneyConsent?: string;
} {
  const renderTemplate = (body: string) => Handlebars.compile(body)(mergeData);

  const result: ReturnType<typeof renderContractPackage> = {
    masterAgreement: renderTemplate(templates.masterAgreement),
    disclosureAddendum: renderTemplate(templates.disclosureAddendum),
  };

  if (mergeData.showAssignmentAddendum && templates.assignmentAddendum) {
    result.assignmentAddendum = renderTemplate(templates.assignmentAddendum);
  }

  if (mergeData.showNotaryPage && templates.notaryPage) {
    result.notaryPage = renderTemplate(templates.notaryPage);
  }

  if (mergeData.showAttorneyConsent && templates.attorneyConsent) {
    result.attorneyConsent = renderTemplate(templates.attorneyConsent);
  }

  return result;
}

export default { compileTemplate, selectTemplate, renderContractPackage };
