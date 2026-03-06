'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable, Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

import {
  useAuditLog,
  verifyChain,
  exportAuditLog,
  AUDIT_EVENT_TYPES,
  type AuditLogEntry,
  type ChainVerifyResult,
} from '@/lib/hooks/use-audit';

// ── Role badge styles ──────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 border-red-200',
  ops: 'bg-blue-100 text-blue-700 border-blue-200',
  compliance: 'bg-purple-100 text-purple-700 border-purple-200',
  attorney: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  claimant: 'bg-gray-100 text-gray-600 border-gray-200',
};

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <Badge variant="outline" className={style}>
      {role}
    </Badge>
  );
}

// ── Changes display ────────────────────────────────────────

function ChangesPreview({ changes }: { changes: Record<string, { old?: unknown; new?: unknown }> }) {
  const keys = Object.keys(changes || {});
  if (keys.length === 0) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className="space-y-1">
      {keys.map((key) => (
        <div key={key} className="text-xs">
          <span className="font-medium">{key}:</span>{' '}
          <span className="text-red-600 line-through">
            {JSON.stringify(changes[key]?.old ?? '-')}
          </span>{' '}
          <span className="text-green-600">
            {JSON.stringify(changes[key]?.new ?? '-')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatTimestamp(ts: string | undefined | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

// ── Main Page ──────────────────────────────────────────────

export default function AuditPage() {
  // Filters
  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { entries, total, isLoading, mutate } = useAuditLog({
    eventType: eventType || undefined,
    entityType: entityType.trim() || undefined,
    actorId: actorId.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: LIMIT,
  });

  // Verify chain dialog
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Exporting
  const [exporting, setExporting] = useState(false);

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const result = await verifyChain();
      setVerifyResult(result);
      setVerifyOpen(true);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verification failed');
      setVerifyOpen(true);
    } finally {
      setVerifying(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportAuditLog();
    } catch {
      // export error
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setEventType('');
    setEntityType('');
    setActorId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (row) => (
        <span className="text-xs font-mono whitespace-nowrap">
          {formatTimestamp(row.timestamp)}
        </span>
      ),
    },
    {
      key: 'eventType',
      header: 'Event',
      render: (row) => <StatusBadge status={row.eventType} />,
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div className="text-xs">
          <span className="font-medium">{row.entityType}</span>
          <br />
          <span className="text-muted-foreground font-mono">{row.entityId}</span>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono">{row.actorId?.slice(0, 8) || '-'}</span>
          {row.actorRole && <RoleBadge role={row.actorRole} />}
        </div>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (row) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.ipAddress || '-'}
        </span>
      ),
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (row) => {
        const hasChanges = row.changes && Object.keys(row.changes).length > 0;
        if (!hasChanges) return <span className="text-xs text-muted-foreground">-</span>;

        const isExpanded = expandedId === row.id;

        return (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedId(isExpanded ? null : row.id);
              }}
            >
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 mr-1" />
              ) : (
                <ChevronDown className="h-3 w-3 mr-1" />
              )}
              {isExpanded ? 'Hide' : 'View'}
            </Button>
            {isExpanded && (
              <div className="mt-2 p-2 bg-muted rounded text-xs max-w-xs overflow-auto">
                <ChangesPreview changes={row.changes} />
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Audit Log" description="Immutable record of all system events">
        <Button variant="outline" onClick={handleVerify} disabled={verifying}>
          <ShieldCheck className="h-4 w-4 mr-2" />
          {verifying ? 'Verifying...' : 'Verify Chain'}
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="space-y-1">
          <Label className="text-xs">Event Type</Label>
          <Select
            value={eventType}
            onValueChange={(v) => {
              setEventType(v === '__all__' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Events</SelectItem>
              {AUDIT_EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Entity Type</Label>
          <Input
            className="w-[140px]"
            placeholder="e.g. case"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Actor ID</Label>
          <Input
            className="w-[140px]"
            placeholder="User ID"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="mb-0.5"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      <DataTable<AuditLogEntry>
        columns={columns}
        data={entries}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No audit entries found."
      />

      {/* Verify Chain Result Dialog */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Chain Integrity Verification</DialogTitle>
            <DialogDescription>
              Results of the audit log hash-chain verification.
            </DialogDescription>
          </DialogHeader>

          {verifyError && (
            <div className="flex items-center gap-3 p-4 rounded-md bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Verification Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{verifyError}</p>
              </div>
            </div>
          )}

          {verifyResult && verifyResult.valid && (
            <div className="flex items-center gap-3 p-4 rounded-md bg-green-50">
              <ShieldCheck className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700">Chain Integrity Verified</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All {verifyResult.totalEntries} entries are valid. No tampering detected.
                </p>
                {verifyResult.message && (
                  <p className="text-xs text-muted-foreground mt-1">{verifyResult.message}</p>
                )}
              </div>
            </div>
          )}

          {verifyResult && !verifyResult.valid && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-md bg-destructive/10">
                <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Chain Integrity Compromised
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {verifyResult.compromisedEntries?.length || 0} entries may have been tampered with.
                  </p>
                  {verifyResult.message && (
                    <p className="text-xs text-muted-foreground mt-1">{verifyResult.message}</p>
                  )}
                </div>
              </div>
              {verifyResult.compromisedEntries && verifyResult.compromisedEntries.length > 0 && (
                <div className="p-3 bg-muted rounded text-xs font-mono max-h-40 overflow-auto">
                  <p className="font-medium mb-1">Compromised Entry IDs:</p>
                  {verifyResult.compromisedEntries.map((id) => (
                    <div key={id}>{id}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
