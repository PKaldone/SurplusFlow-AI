'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatSourceType } from '@/lib/hooks/use-cases';
import type { Opportunity } from '@/lib/hooks/use-opportunities';

interface ConvertToCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  onSuccess: () => void;
}

interface FormState {
  assignedOpsId: string;
  feePercent: string;
  feeCap: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  assignedOpsId: '',
  feePercent: '',
  feeCap: '',
  notes: '',
};

export function ConvertToCaseDialog({
  open,
  onOpenChange,
  opportunity,
  onSuccess,
}: ConvertToCaseDialogProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(INITIAL_FORM);
    setError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!opportunity) return;

    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        opportunityId: opportunity.id,
      };
      if (form.assignedOpsId.trim()) {
        body.assignedOpsId = form.assignedOpsId.trim();
      }
      if (form.feePercent) {
        body.configuredFeePercent = Number(form.feePercent);
      }
      if (form.feeCap) {
        body.configuredFeeCap = Number(form.feeCap);
      }
      if (form.notes.trim()) {
        body.notes = form.notes.trim();
      }

      const result = await apiFetch<{ id: string }>('/api/v1/cases', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      handleClose();
      onSuccess();

      if (result?.id) {
        router.push(`/cases/${result.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create case';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Convert to Case</DialogTitle>
          <DialogDescription>
            Create a new case from this opportunity.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1 mb-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Owner</span>
            <span className="font-medium">{opportunity.ownerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{formatCurrency(opportunity.estimatedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">State</span>
            <span>{opportunity.jurisdictionState}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span>{formatSourceType(opportunity.sourceType)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="convertAssignedOps">Assigned Ops ID</Label>
            <Input
              id="convertAssignedOps"
              value={form.assignedOpsId}
              onChange={(e) => updateField('assignedOpsId', e.target.value)}
              placeholder="Optional — assign later"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="convertFeePercent">Fee Percent (%)</Label>
              <Input
                id="convertFeePercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.feePercent}
                onChange={(e) => updateField('feePercent', e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="convertFeeCap">Fee Cap ($)</Label>
              <Input
                id="convertFeeCap"
                type="number"
                min="0"
                step="0.01"
                value={form.feeCap}
                onChange={(e) => updateField('feeCap', e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="convertNotes">Notes</Label>
            <Textarea
              id="convertNotes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Optional notes about this case..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Case'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
