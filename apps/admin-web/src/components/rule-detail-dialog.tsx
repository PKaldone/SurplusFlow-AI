'use client';

import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  Pencil,
  Save,
  ShieldCheck,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  ComplianceRule,
  updateRule,
  verifyRule,
} from '@/lib/hooks/use-compliance';

// ── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function BoolIcon({ value }: { value: boolean | undefined | null }) {
  if (value === true) return <Check className="h-4 w-4 text-green-600" />;
  if (value === false) return <X className="h-4 w-4 text-red-500" />;
  return <span className="text-sm text-muted-foreground">-</span>;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Field Display ──────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground w-48 shrink-0">{label}</span>
      <div className="text-sm text-right">{children}</div>
    </div>
  );
}

// ── Verify Dialog ──────────────────────────────────────────

function VerifyRuleDialog({
  open,
  onOpenChange,
  ruleId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ruleId: string;
  onSuccess: () => void;
}) {
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEvidence('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evidence.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await verifyRule(ruleId, evidence.trim());
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Verify Rule</DialogTitle>
          <DialogDescription>
            Provide evidence to mark this rule as verified.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="verify-evidence">Verification Evidence</Label>
            <Textarea
              id="verify-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="e.g., Reviewed state statute 123.45, confirmed fee cap is current as of 2026..."
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!evidence.trim() || submitting}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {submitting ? 'Verifying...' : 'Mark Verified'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────

interface RuleDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: ComplianceRule | null;
  onUpdated: () => void;
}

export function RuleDetailDialog({
  open,
  onOpenChange,
  rule,
  onUpdated,
}: RuleDetailDialogProps) {
  const [editing, setEditing] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editState, setEditState] = useState('');
  const [editCounty, setEditCounty] = useState('');
  const [editSourceType, setEditSourceType] = useState('');
  const [editMaxFeePercent, setEditMaxFeePercent] = useState('');
  const [editFeeCapAmount, setEditFeeCapAmount] = useState('');
  const [editCoolingOffDays, setEditCoolingOffDays] = useState('');
  const [editNotarizationRequired, setEditNotarizationRequired] = useState(false);
  const [editAssignmentAllowed, setEditAssignmentAllowed] = useState(false);
  const [editLicenseRequired, setEditLicenseRequired] = useState(false);
  const [editBondRequired, setEditBondRequired] = useState(false);
  const [editBondAmount, setEditBondAmount] = useState('');
  const [editEffectiveDate, setEditEffectiveDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (open && rule) {
      setEditing(false);
      setError(null);
      populateEditState(rule);
    }
  }, [open, rule]);

  function populateEditState(r: ComplianceRule) {
    setEditState(r.state || '');
    setEditCounty(r.county || '');
    setEditSourceType(r.sourceType || '');
    setEditMaxFeePercent(r.maxFeePercent != null ? String(r.maxFeePercent) : '');
    setEditFeeCapAmount(r.feeCapAmount != null ? String(r.feeCapAmount) : '');
    setEditCoolingOffDays(r.coolingOffDays != null ? String(r.coolingOffDays) : '');
    setEditNotarizationRequired(r.notarizationRequired || false);
    setEditAssignmentAllowed(r.assignmentAllowed || false);
    setEditLicenseRequired(r.licenseRequired || false);
    setEditBondRequired(r.bondRequired || false);
    setEditBondAmount(r.bondAmount != null ? String(r.bondAmount) : '');
    setEditEffectiveDate(r.effectiveDate ? r.effectiveDate.split('T')[0] : '');
    setEditExpiryDate(r.expiryDate ? r.expiryDate.split('T')[0] : '');
    setEditNotes(r.notes || '');
  }

  async function handleSave() {
    if (!rule) return;

    setSaving(true);
    setError(null);
    try {
      await updateRule(rule.id, {
        state: editState,
        county: editCounty || undefined,
        sourceType: editSourceType,
        maxFeePercent: editMaxFeePercent ? Number(editMaxFeePercent) : undefined,
        feeCapAmount: editFeeCapAmount ? Number(editFeeCapAmount) : undefined,
        coolingOffDays: editCoolingOffDays ? Number(editCoolingOffDays) : undefined,
        notarizationRequired: editNotarizationRequired,
        assignmentAllowed: editAssignmentAllowed,
        licenseRequired: editLicenseRequired,
        bondRequired: editBondRequired,
        bondAmount: editBondAmount ? Number(editBondAmount) : undefined,
        effectiveDate: editEffectiveDate || undefined,
        expiryDate: editExpiryDate || undefined,
        notes: editNotes || undefined,
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  if (!rule) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Rule: {rule.state}
              {rule.county && ` - ${rule.county}`}
            </DialogTitle>
            <DialogDescription>
              {formatLabel(rule.sourceType)} compliance rule
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {/* View Mode */}
          {!editing && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Basic Information</h3>
                <FieldRow label="State">{rule.state}</FieldRow>
                <FieldRow label="County">{rule.county || '-'}</FieldRow>
                <FieldRow label="Source Type">{formatLabel(rule.sourceType)}</FieldRow>
                <FieldRow label="Effective Date">{formatDate(rule.effectiveDate)}</FieldRow>
                <FieldRow label="Expiry Date">{formatDate(rule.expiryDate)}</FieldRow>
              </div>

              <Separator />

              {/* Fee Limits */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Fee Limits</h3>
                <FieldRow label="Max Fee Percent">
                  {rule.maxFeePercent != null ? `${rule.maxFeePercent}%` : '-'}
                </FieldRow>
                <FieldRow label="Fee Cap Amount">{formatCurrency(rule.feeCapAmount)}</FieldRow>
              </div>

              <Separator />

              {/* Requirements */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Requirements</h3>
                <FieldRow label="Cooling Off Days">
                  {rule.coolingOffDays != null ? `${rule.coolingOffDays} days` : '-'}
                </FieldRow>
                <FieldRow label="Notarization Required"><BoolIcon value={rule.notarizationRequired} /></FieldRow>
                <FieldRow label="Assignment Allowed"><BoolIcon value={rule.assignmentAllowed} /></FieldRow>
                <FieldRow label="License Required"><BoolIcon value={rule.licenseRequired} /></FieldRow>
                <FieldRow label="Bond Required"><BoolIcon value={rule.bondRequired} /></FieldRow>
                <FieldRow label="Bond Amount">{formatCurrency(rule.bondAmount)}</FieldRow>
              </div>

              <Separator />

              {/* Solicitation & Disclosures */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Solicitation & Disclosures</h3>
                <FieldRow label="Solicitation Restrictions">
                  {rule.solicitationRestrictions ? (
                    <pre className="text-xs bg-muted p-2 rounded max-w-xs overflow-x-auto text-left">
                      {typeof rule.solicitationRestrictions === 'string'
                        ? rule.solicitationRestrictions
                        : JSON.stringify(rule.solicitationRestrictions, null, 2)}
                    </pre>
                  ) : '-'}
                </FieldRow>
                <FieldRow label="Required Disclosures">
                  {rule.requiredDisclosures && rule.requiredDisclosures.length > 0 ? (
                    <ul className="text-xs space-y-1 text-left">
                      {rule.requiredDisclosures.map((d, i) => (
                        <li key={i} className="bg-muted px-2 py-1 rounded">{d}</li>
                      ))}
                    </ul>
                  ) : '-'}
                </FieldRow>
                {rule.contractTemplateVersion && (
                  <FieldRow label="Contract Template">
                    v{rule.contractTemplateVersion}
                  </FieldRow>
                )}
              </div>

              <Separator />

              {/* Verification */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Verification</h3>
                <FieldRow label="Status"><StatusBadge status={rule.verificationStatus} /></FieldRow>
                <FieldRow label="Verified By">{rule.verifiedBy || '-'}</FieldRow>
                <FieldRow label="Verified At">{formatDate(rule.verifiedAt)}</FieldRow>
                <FieldRow label="Evidence">
                  {rule.verificationEvidence || '-'}
                </FieldRow>
              </div>

              {/* Notes */}
              {rule.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rule.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Edit Mode */}
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={editState} onChange={(e) => setEditState(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>County</Label>
                  <Input value={editCounty} onChange={(e) => setEditCounty(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Input value={editSourceType} onChange={(e) => setEditSourceType(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Fee %</Label>
                  <Input type="number" min="0" max="100" step="0.1" value={editMaxFeePercent} onChange={(e) => setEditMaxFeePercent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fee Cap Amount</Label>
                  <Input type="number" min="0" step="0.01" value={editFeeCapAmount} onChange={(e) => setEditFeeCapAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cooling Off Days</Label>
                  <Input type="number" min="0" value={editCoolingOffDays} onChange={(e) => setEditCoolingOffDays(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Effective Date</Label>
                  <Input type="date" value={editEffectiveDate} onChange={(e) => setEditEffectiveDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input type="date" value={editExpiryDate} onChange={(e) => setEditExpiryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Bond Amount</Label>
                  <Input type="number" min="0" step="0.01" value={editBondAmount} onChange={(e) => setEditBondAmount(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editNotarizationRequired} onChange={(e) => setEditNotarizationRequired(e.target.checked)} className="rounded" />
                  Notarization Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editAssignmentAllowed} onChange={(e) => setEditAssignmentAllowed(e.target.checked)} className="rounded" />
                  Assignment Allowed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editLicenseRequired} onChange={(e) => setEditLicenseRequired(e.target.checked)} className="rounded" />
                  License Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editBondRequired} onChange={(e) => setEditBondRequired(e.target.checked)} className="rounded" />
                  Bond Required
                </label>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} placeholder="Optional notes..." />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setVerifyOpen(true)}
                  disabled={rule.verificationStatus === 'verified'}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Verify
                </Button>
                <Button onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setEditing(false); if (rule) populateEditState(rule); }} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VerifyRuleDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        ruleId={rule.id}
        onSuccess={() => {
          setVerifyOpen(false);
          onUpdated();
        }}
      />
    </>
  );
}
