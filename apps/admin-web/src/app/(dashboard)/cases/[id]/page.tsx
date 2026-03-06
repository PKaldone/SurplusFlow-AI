'use client';

import React, { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  FileText,
  MessageSquare,
  Upload,
  Download,
  User,
  Scale,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { LoadingPage } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import {
  useCase,
  useCaseTimeline,
  CASE_STATUSES,
  DOC_TYPES,
  formatCurrency,
  formatSourceType,
  formatStatus,
} from '@/lib/hooks/use-cases';

// ── Status change dialog ────────────────────────────────────

function ChangeStatusDialog({
  open,
  onOpenChange,
  caseId,
  currentStatus,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  currentStatus: string;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherStatuses = CASE_STATUSES.filter((s) => s !== currentStatus);

  async function handleSubmit() {
    if (!status) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/cases/${caseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onOpenChange(false);
      setStatus('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change status');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
          <DialogDescription>Select the new status for this case.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label>New Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              {otherStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!status || submitting}>
            {submitting ? 'Updating...' : 'Update Status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign dialog ───────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  caseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  onSuccess: () => void;
}) {
  const [opsId, setOpsId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!opsId.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/cases/${caseId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedOpsId: opsId.trim() }),
      });
      onOpenChange(false);
      setOpsId('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Assign Case</DialogTitle>
          <DialogDescription>Assign this case to an operations user.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="opsId">Ops User ID</Label>
          <Input
            id="opsId"
            value={opsId}
            onChange={(e) => setOpsId(e.target.value)}
            placeholder="Enter ops user ID"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!opsId.trim() || submitting}>
            {submitting ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Flag legal review dialog ────────────────────────────────

function FlagLegalDialog({
  open,
  onOpenChange,
  caseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: string;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/cases/${caseId}/flag-legal-review`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onOpenChange(false);
      setReason('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to flag for legal review');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Flag for Legal Review</DialogTitle>
          <DialogDescription>Provide a reason for flagging this case.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this case needs legal review..."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? 'Flagging...' : 'Flag for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Timeline event icon ─────────────────────────────────────

function TimelineIcon({ type }: { type?: string }) {
  const className = 'h-4 w-4';
  switch (type) {
    case 'status_change':
      return <RefreshCw className={className} />;
    case 'note_added':
      return <MessageSquare className={className} />;
    case 'document_uploaded':
      return <FileText className={className} />;
    case 'assignment':
      return <User className={className} />;
    case 'legal_flag':
      return <Scale className={className} />;
    case 'legal_advance':
      return <CheckCircle className={className} />;
    case 'error':
      return <XCircle className={className} />;
    case 'warning':
      return <AlertTriangle className={className} />;
    default:
      return <Clock className={className} />;
  }
}

// ── Timeline tab ────────────────────────────────────────────

function TimelineTab({ caseId }: { caseId: string }) {
  const { timeline, isLoading } = useCaseTimeline(caseId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading timeline...</p>;
  }

  if (!timeline || timeline.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No timeline events yet.</p>;
  }

  return (
    <div className="space-y-4">
      {(timeline as Array<{
        id?: string;
        type?: string;
        description?: string;
        actor?: string;
        createdAt?: string;
        timestamp?: string;
      }>).map((event, i) => (
        <div key={event.id || i} className="flex gap-3 items-start">
          <div className="mt-1 rounded-full bg-muted p-2">
            <TimelineIcon type={event.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{event.description || 'Event'}</p>
            <div className="flex items-center gap-2 mt-1">
              {event.actor && (
                <span className="text-xs text-muted-foreground">by {event.actor}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {event.createdAt || event.timestamp
                  ? new Date(event.createdAt || event.timestamp || '').toLocaleString()
                  : ''}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Notes tab ───────────────────────────────────────────────

function NotesTab({
  caseId,
  notes,
  onNoteAdded,
}: {
  caseId: string;
  notes: Array<{ id?: string; note?: string; text?: string; createdAt?: string; author?: string }>;
  onNoteAdded: () => void;
}) {
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/cases/${caseId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote.trim() }),
      });
      setNewNote('');
      onNoteAdded();
    } catch {
      // Error handled silently for now
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote} className="flex gap-2">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="flex-1"
        />
        <Button type="submit" disabled={!newNote.trim() || submitting} className="self-end">
          {submitting ? 'Adding...' : 'Add Note'}
        </Button>
      </form>

      <Separator />

      {(!notes || notes.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n, i) => (
            <div key={n.id || i} className="rounded-md border p-3">
              <p className="text-sm">{n.note || n.text}</p>
              <div className="flex items-center gap-2 mt-2">
                {n.author && (
                  <span className="text-xs text-muted-foreground">by {n.author}</span>
                )}
                {n.createdAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Documents tab ───────────────────────────────────────────

function DocumentsTab({
  caseId,
  documents,
  onDocUploaded,
}: {
  caseId: string;
  documents: Array<{
    id?: string;
    filename?: string;
    docType?: string;
    size?: number;
    createdAt?: string;
    url?: string;
  }>;
  onDocUploaded: () => void;
}) {
  const [docType, setDocType] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !docType) return;

    setUploading(true);
    setUploadError(null);

    try {
      const base64 = await readFileAsBase64(file);
      await apiFetch(`/api/v1/cases/${caseId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          docType,
          filename: file.name,
          mimeType: file.type,
          fileBase64: base64,
        }),
      });
      setFile(null);
      setDocType('');
      // Reset file input
      const input = document.getElementById('doc-file-input') as HTMLInputElement;
      if (input) input.value = '';
      onDocUploaded();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function readFileAsBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data:...;base64, prefix
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  function formatFileSize(bytes: number | undefined): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleUpload} className="space-y-3 rounded-md border p-4">
        <h4 className="text-sm font-medium">Upload Document</h4>
        {uploadError && (
          <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {uploadError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-file-input">File</Label>
            <Input
              id="doc-file-input"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={!file || !docType || uploading}>
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </form>

      <Separator />

      {(!documents || documents.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No documents yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <div key={doc.id || i} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.filename || 'Untitled'}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={doc.docType || 'other'} />
                    <span>{formatFileSize(doc.size)}</span>
                    {doc.createdAt && (
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
              {doc.url && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main case detail page ───────────────────────────────────

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { caseData, isLoading, mutate } = useCase(id);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [legalDialogOpen, setLegalDialogOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  async function handleDownloadDossier() {
    try {
      const dossier = await apiFetch<{ case: unknown; timeline: unknown; generatedAt: string }>(
        `/api/v1/cases/${id}/dossier`,
      );
      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `case-${caseData?.caseNumber || id}-dossier.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Dossier download failed
    }
  }

  if (isLoading) return <LoadingPage />;

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Case not found.</p>
        <Button variant="link" onClick={() => router.push('/cases')} className="mt-2">
          Back to Cases
        </Button>
      </div>
    );
  }

  const c = caseData as Record<string, unknown>;
  const claimantName =
    (c.claimantName as string) ||
    ((c.claimant as Record<string, string>)?.name) ||
    [
      (c.claimant as Record<string, string>)?.firstName,
      (c.claimant as Record<string, string>)?.lastName,
    ]
      .filter(Boolean)
      .join(' ') ||
    '-';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">
              {(c.caseNumber as string) || 'Case'}
            </h1>
            <StatusBadge status={(c.status as string) || 'UNKNOWN'} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {claimantName} &middot; {formatCurrency(c.estimatedAmount as number ?? c.amount as number)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(true)}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Change Status
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
          <User className="h-4 w-4 mr-2" />
          Assign
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLegalDialogOpen(true)}>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Flag Legal Review
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadDossier}>
          <Download className="h-4 w-4 mr-2" />
          Download Dossier
        </Button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Case Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Claimant" value={claimantName} />
            <InfoRow label="State" value={(c.state as string) || '-'} />
            <InfoRow label="County" value={(c.county as string) || '-'} />
            <InfoRow label="Source Type" value={formatSourceType(c.sourceType as string)} />
            <InfoRow
              label="Amount"
              value={formatCurrency(c.estimatedAmount as number ?? c.amount as number)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow
              label="Assigned Ops"
              value={
                (c.assignedOps as Record<string, string>)?.name ||
                (c.assignedOpsId as string) ||
                'Unassigned'
              }
            />
            <InfoRow
              label="Attorney"
              value={
                (c.attorney as Record<string, string>)?.name ||
                (c.attorneyId as string) ||
                'None'
              }
            />
            <InfoRow
              label="Fee %"
              value={
                c.configuredFeePercent != null
                  ? `${c.configuredFeePercent}%`
                  : '-'
              }
            />
            <InfoRow
              label="Fee Cap"
              value={
                c.configuredFeeCap != null
                  ? formatCurrency(c.configuredFeeCap as number)
                  : '-'
              }
            />
            <InfoRow
              label="Created"
              value={
                c.createdAt
                  ? new Date(c.createdAt as string).toLocaleDateString()
                  : '-'
              }
            />
            <InfoRow
              label="Updated"
              value={
                c.updatedAt
                  ? new Date(c.updatedAt as string).toLocaleDateString()
                  : '-'
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="notes">
            <MessageSquare className="h-4 w-4 mr-2" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <TimelineTab caseId={id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesTab
            caseId={id}
            notes={(c.notes as Array<{ id?: string; note?: string; text?: string; createdAt?: string; author?: string }>) || []}
            onNoteAdded={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab
            caseId={id}
            documents={
              (c.documents as Array<{
                id?: string;
                filename?: string;
                docType?: string;
                size?: number;
                createdAt?: string;
                url?: string;
              }>) || []
            }
            onDocUploaded={handleRefresh}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ChangeStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        caseId={id}
        currentStatus={(c.status as string) || ''}
        onSuccess={handleRefresh}
      />
      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        caseId={id}
        onSuccess={handleRefresh}
      />
      <FlagLegalDialog
        open={legalDialogOpen}
        onOpenChange={setLegalDialogOpen}
        caseId={id}
        onSuccess={handleRefresh}
      />
    </div>
  );
}

// ── Helper ──────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
