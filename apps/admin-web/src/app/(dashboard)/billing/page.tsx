'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Send,
  DollarSign,
  Ban,
  Eye,
  Plus,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable, Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

import {
  useInvoices,
  generateInvoice,
  sendInvoice,
  markInvoicePaid,
  waiveInvoice,
  INVOICE_STATUSES,
  Invoice,
} from '@/lib/hooks/use-billing';
import { formatCurrency } from '@/lib/hooks/use-cases';

// ── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Generate Invoice Dialog ────────────────────────────────

function GenerateInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [caseId, setCaseId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCaseId('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await generateInvoice(caseId.trim());
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
          <DialogDescription>
            Generate an invoice for a case. The fee will be calculated based on the case payout and applicable rules.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="gen-case-id">Case ID</Label>
            <Input
              id="gen-case-id"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="Enter case ID"
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!caseId.trim() || submitting}>
              <Receipt className="h-4 w-4 mr-2" />
              {submitting ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark Paid Dialog ───────────────────────────────────────

function MarkPaidDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: Invoice | null;
  onSuccess: () => void;
}) {
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setPaymentReference('');
      setPaymentMethod('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !paymentReference.trim() || !paymentMethod.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await markInvoicePaid(invoice.id, paymentReference.trim(), paymentMethod.trim());
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Mark Invoice as Paid</DialogTitle>
          <DialogDescription>
            Record payment for invoice {invoice?.invoiceNumber || ''}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pay-ref">Payment Reference</Label>
            <Input
              id="pay-ref"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g., check #, wire ref, Stripe ID"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-method">Payment Method</Label>
            <Input
              id="pay-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="e.g., check, wire, ach, stripe"
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!paymentReference.trim() || !paymentMethod.trim() || submitting}>
              <DollarSign className="h-4 w-4 mr-2" />
              {submitting ? 'Processing...' : 'Mark Paid'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Waive Dialog ───────────────────────────────────────────

function WaiveDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: Invoice | null;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !reason.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await waiveInvoice(invoice.id, reason.trim());
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to waive invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Waive Invoice</DialogTitle>
          <DialogDescription>
            Waive invoice {invoice?.invoiceNumber || ''}. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="waive-reason">Reason</Label>
            <Textarea
              id="waive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this invoice is being waived..."
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" type="submit" disabled={!reason.trim() || submitting}>
              <Ban className="h-4 w-4 mr-2" />
              {submitting ? 'Waiving...' : 'Waive Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function BillingPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { invoices, total, isLoading, mutate } = useInvoices({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: LIMIT,
  });

  const [generateOpen, setGenerateOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleSend(invoice: Invoice) {
    setSendingId(invoice.id);
    try {
      await sendInvoice(invoice.id);
      mutate();
    } catch {
      // Send error
    } finally {
      setSendingId(null);
    }
  }

  function handleMarkPaid(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setMarkPaidOpen(true);
  }

  function handleWaive(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setWaiveOpen(true);
  }

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (row) => (
        <span className="font-medium text-sm">{row.invoiceNumber || '-'}</span>
      ),
    },
    {
      key: 'caseId',
      header: 'Case',
      render: (row) => (
        <Link
          href={`/cases/${row.caseId}`}
          className="text-sm text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.caseId}
        </Link>
      ),
    },
    {
      key: 'payoutAmount',
      header: 'Payout',
      render: (row) => (
        <span className="text-sm font-mono">{formatCurrency(row.payoutAmount)}</span>
      ),
    },
    {
      key: 'feePercent',
      header: 'Fee %',
      render: (row) => (
        <span className="text-sm">
          {row.feePercent != null ? `${row.feePercent}%` : '-'}
          {row.feeCapApplied && (
            <span className="text-xs text-muted-foreground ml-1">(capped)</span>
          )}
        </span>
      ),
    },
    {
      key: 'feeAmount',
      header: 'Fee Amount',
      render: (row) => (
        <span className="text-sm font-mono">{formatCurrency(row.feeAmount)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.dueDate)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.status === 'draft' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSend(row)}
              disabled={sendingId === row.id}
              title="Send invoice"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
          {(row.status === 'sent' || row.status === 'overdue') && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMarkPaid(row)}
                title="Mark as paid"
              >
                <DollarSign className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleWaive(row)}
                title="Waive invoice"
                className="text-destructive hover:text-destructive"
              >
                <Ban className="h-4 w-4" />
              </Button>
            </>
          )}
          <Link href={`/cases/${row.caseId}`}>
            <Button variant="ghost" size="sm" title="View case">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Billing" description="Manage invoices and fee collection">
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate Invoice
        </Button>
      </PageHeader>

      {/* Status filter */}
      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm">Status</Label>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<Invoice>
        columns={columns}
        data={invoices}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No invoices found."
      />

      {/* Dialogs */}
      <GenerateInvoiceDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onSuccess={() => mutate()}
      />
      <MarkPaidDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        invoice={selectedInvoice}
        onSuccess={() => mutate()}
      />
      <WaiveDialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        invoice={selectedInvoice}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
