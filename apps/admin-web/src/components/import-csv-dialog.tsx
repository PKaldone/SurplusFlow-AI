'use client';

import React, { useState, useRef } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResult {
  imported: number;
  errors?: string[];
  total?: number;
}

export function ImportCsvDialog({ open, onOpenChange, onSuccess }: ImportCsvDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setCsvText('');
    setError(null);
    setResult(null);
    onOpenChange(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setCsvText(text);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const trimmed = csvText.trim();
    if (!trimmed) {
      setError('Please paste CSV content or upload a file.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<ImportResult>('/api/v1/opportunities/import', {
        method: 'POST',
        body: JSON.stringify({ csv: trimmed }),
      });
      setResult(res);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Opportunities from CSV</DialogTitle>
          <DialogDescription>
            Paste CSV content or upload a .csv file to import opportunities.
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
              <p className="font-medium">
                Successfully imported {result.imported} opportunit{result.imported === 1 ? 'y' : 'ies'}.
              </p>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-amber-700">
                    {result.errors.length} error{result.errors.length === 1 ? '' : 's'}:
                  </p>
                  <ul className="list-disc ml-4 mt-1 text-amber-700">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="csvContent">Or Paste CSV Content</Label>
            <Textarea
              id="csvContent"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="ownerName,jurisdictionState,jurisdictionCounty,sourceType,estimatedAmount..."
              rows={8}
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Importing...' : 'Import'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
