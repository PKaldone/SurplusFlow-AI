'use client';

import React, { useState } from 'react';
import {
  Send,
  Search,
  Mail,
  MessageSquare,
  Plus,
  CheckCircle,
  ShieldBan,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable, Column } from '@/components/data-table';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  useTemplates,
  useOutreachHistory,
  useSuppression,
  queueOutreach,
  approveOutreach,
  addSuppression,
  OUTREACH_CHANNELS,
  IDENTIFIER_TYPES,
  SUPPRESSION_REASONS,
  OutreachTemplate,
  OutreachRecord,
  SuppressionEntry,
} from '@/lib/hooks/use-outreach';

// ── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function maskIdentifier(value: string): string {
  if (!value || value.length <= 4) return value;
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.min(value.length - 4, 8))}${visible}`;
}

const OUTREACH_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  bounced: 'bg-red-100 text-red-700 border-red-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  opened: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  clicked: 'bg-purple-100 text-purple-700 border-purple-200',
  responded: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function OutreachStatusBadge({ status }: { status: string }) {
  const style = OUTREACH_STATUS_STYLES[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <Badge variant="outline" className={style}>
      {formatLabel(status)}
    </Badge>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4" />;
    case 'mail':
      return <Send className="h-4 w-4" />;
    default:
      return <Send className="h-4 w-4" />;
  }
}

// ── Templates Tab ──────────────────────────────────────────

function TemplatesTab() {
  const { templates, isLoading } = useTemplates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No outreach templates configured yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((tpl: OutreachTemplate) => (
        <Card key={tpl.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{tpl.name}</CardTitle>
              <Badge variant="outline" className="text-xs">
                <ChannelIcon channel={tpl.channel} />
                <span className="ml-1">{formatLabel(tpl.channel)}</span>
              </Badge>
            </div>
            {tpl.description && (
              <CardDescription className="text-xs">{tpl.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {tpl.subject && (
              <p className="text-xs text-muted-foreground mb-1">
                <span className="font-medium">Subject:</span> {tpl.subject}
              </p>
            )}
            {tpl.body && (
              <p className="text-xs text-muted-foreground line-clamp-3">{tpl.body}</p>
            )}
            {!tpl.subject && !tpl.body && (
              <p className="text-xs text-muted-foreground italic">No preview available</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Outreach History List ──────────────────────────────────

function OutreachHistoryList({ caseId }: { caseId: string }) {
  const { history, isLoading, mutate } = useOutreachHistory(caseId);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(recordId: string) {
    setApprovingId(recordId);
    try {
      await approveOutreach(recordId);
      mutate();
    } catch {
      // Approval error
    } finally {
      setApprovingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No outreach history for this case.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((record: OutreachRecord) => (
        <div
          key={record.id}
          className="flex items-center justify-between rounded-md border p-3"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ChannelIcon channel={record.channel} />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {record.templateName || record.templateId || 'Outreach'}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {formatLabel(record.channel)}
                </Badge>
                <OutreachStatusBadge status={record.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(record.sentAt || record.createdAt)}
                </span>
              </div>
            </div>
          </div>
          {record.status === 'pending' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApprove(record.id)}
              disabled={approvingId === record.id}
              className="shrink-0 ml-4"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {approvingId === record.id ? 'Approving...' : 'Approve'}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Queue Outreach Tab ─────────────────────────────────────

function QueueOutreachTab() {
  const { templates } = useTemplates();
  const [caseId, setCaseId] = useState('');
  const [channel, setChannel] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyCaseId, setHistoryCaseId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId.trim() || !channel || !templateId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await queueOutreach(caseId.trim(), channel, templateId);
      setSuccess('Outreach queued successfully.');
      setHistoryCaseId(caseId.trim());
      setShowHistory(true);
      setChannel('');
      setTemplateId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue outreach');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCaseSearch() {
    if (caseId.trim()) {
      setHistoryCaseId(caseId.trim());
      setShowHistory(true);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Queue New Outreach</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            {success && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="queue-case-id">Case ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="queue-case-id"
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                    placeholder="Enter case ID"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCaseSearch}
                    disabled={!caseId.trim()}
                    title="View history"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTREACH_CHANNELS.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {formatLabel(ch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl: OutreachTemplate) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={!caseId.trim() || !channel || !templateId || submitting}
            >
              <Send className="h-4 w-4 mr-2" />
              {submitting ? 'Queuing...' : 'Queue Outreach'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Outreach history for entered case */}
      {showHistory && historyCaseId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Outreach History for {historyCaseId}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OutreachHistoryList caseId={historyCaseId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Add Suppression Dialog ─────────────────────────────────

function AddSuppressionDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState('');
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setIdentifier('');
      setIdentifierType('');
      setReason('');
      setSource('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !identifierType || !reason || !source.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await addSuppression({
        identifier: identifier.trim(),
        identifierType,
        reason,
        source: source.trim(),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add suppression entry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add to Suppression List</DialogTitle>
          <DialogDescription>
            Add an identifier to prevent future outreach.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="suppression-identifier">Identifier</Label>
            <Input
              id="suppression-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email, phone, hash..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Identifier Type</Label>
            <Select value={identifierType} onValueChange={setIdentifierType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {IDENTIFIER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                {SUPPRESSION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {formatLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="suppression-source">Source</Label>
            <Input
              id="suppression-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g., Claimant request, Legal hold..."
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!identifier.trim() || !identifierType || !reason || !source.trim() || submitting}
            >
              {submitting ? 'Adding...' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Suppression Tab ────────────────────────────────────────

function SuppressionTab() {
  const [page, setPage] = useState(1);
  const LIMIT = 25;
  const { entries, total, isLoading, mutate } = useSuppression({ page, limit: LIMIT });
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns: Column<SuppressionEntry>[] = [
    {
      key: 'identifier',
      header: 'Identifier',
      render: (row) => (
        <span className="font-mono text-sm">{maskIdentifier(row.identifier)}</span>
      ),
    },
    {
      key: 'identifierType',
      header: 'Type',
      render: (row) => (
        <Badge variant="outline" className="text-xs">
          {formatLabel(row.identifierType)}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <StatusBadge status={row.reason} />,
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => (
        <span className="text-sm">{row.source || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      className: 'text-xs',
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Identifiers on the suppression list will not receive outreach.
        </p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add to Suppression
        </Button>
      </div>

      <DataTable<SuppressionEntry>
        columns={columns}
        data={entries}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No suppression entries found."
      />

      <AddSuppressionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function OutreachPage() {
  return (
    <div>
      <PageHeader
        title="Outreach"
        description="Manage templates, queue communications, and suppression list"
      />

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="templates">
            <Mail className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="queue">
            <Send className="h-4 w-4 mr-2" />
            Queue Outreach
          </TabsTrigger>
          <TabsTrigger value="suppression">
            <ShieldBan className="h-4 w-4 mr-2" />
            Suppression List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <QueueOutreachTab />
        </TabsContent>

        <TabsContent value="suppression" className="mt-4">
          <SuppressionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
