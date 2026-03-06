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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { SOURCE_TYPES } from '@/lib/hooks/use-opportunities';
import { formatSourceType } from '@/lib/hooks/use-cases';

interface TriggerScrapeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ScrapeResult {
  message: string;
  jobId?: string;
}

export function TriggerScrapeDialog({ open, onOpenChange, onSuccess }: TriggerScrapeDialogProps) {
  const [sourceType, setSourceType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  function handleClose() {
    setSourceType('');
    setError(null);
    setResult(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!sourceType) {
      setError('Please select a source type.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<ScrapeResult>('/api/v1/opportunities/trigger-scrape', {
        method: 'POST',
        body: JSON.stringify({ sourceType }),
      });
      setResult(res);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger scrape';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Trigger Scrape</DialogTitle>
          <DialogDescription>
            Start a new data scrape job to discover opportunities.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              <p>{result.message}</p>
              {result.jobId && (
                <p className="text-xs mt-1 text-green-600">Job ID: {result.jobId}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue placeholder="Select source type..." />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {formatSourceType(st)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Starting...' : 'Start Scrape'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
