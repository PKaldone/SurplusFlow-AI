'use client';

import React, { useState } from 'react';
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

interface CreateCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface FormState {
  opportunityId: string;
  assignedOpsId: string;
  configuredFeePercent: string;
  configuredFeeCap: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  opportunityId: '',
  assignedOpsId: '',
  configuredFeePercent: '',
  configuredFeeCap: '',
  notes: '',
};

export function CreateCaseDialog({ open, onOpenChange, onSuccess }: CreateCaseDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setError(null);

    if (!form.opportunityId.trim()) {
      setError('Opportunity ID is required.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        opportunityId: form.opportunityId.trim(),
      };
      if (form.assignedOpsId.trim()) {
        body.assignedOpsId = form.assignedOpsId.trim();
      }
      if (form.configuredFeePercent) {
        body.configuredFeePercent = Number(form.configuredFeePercent);
      }
      if (form.configuredFeeCap) {
        body.configuredFeeCap = Number(form.configuredFeeCap);
      }
      if (form.notes.trim()) {
        body.notes = form.notes.trim();
      }

      await apiFetch('/api/v1/cases', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      handleClose();
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create case';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create New Case</DialogTitle>
          <DialogDescription>
            Create a new case from an identified opportunity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="opportunityId">Opportunity ID *</Label>
            <Input
              id="opportunityId"
              value={form.opportunityId}
              onChange={(e) => updateField('opportunityId', e.target.value)}
              placeholder="e.g. OPP-2024-00001"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignedOpsId">Assigned Ops ID</Label>
            <Input
              id="assignedOpsId"
              value={form.assignedOpsId}
              onChange={(e) => updateField('assignedOpsId', e.target.value)}
              placeholder="Optional — assign later"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="feePercent">Fee Percent (%)</Label>
              <Input
                id="feePercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.configuredFeePercent}
                onChange={(e) => updateField('configuredFeePercent', e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feeCap">Fee Cap ($)</Label>
              <Input
                id="feeCap"
                type="number"
                min="0"
                step="0.01"
                value={form.configuredFeeCap}
                onChange={(e) => updateField('configuredFeeCap', e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
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
