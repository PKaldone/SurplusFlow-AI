'use client';

import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Upload,
  Search,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { LoadingSpinner } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useCaseDocuments,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  Document,
} from '@/lib/hooks/use-documents';
import { DOC_TYPES } from '@/lib/hooks/use-cases';

// ── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocType(docType: string): string {
  return docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Delete confirm dialog ──────────────────────────────────

function DeleteDocumentDialog({
  open,
  onOpenChange,
  doc,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: Document | null;
  onConfirm: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!doc) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(doc.id);
      onOpenChange(false);
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Document</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{doc?.filename || 'this document'}&quot;? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Upload dialog ──────────────────────────────────────────

function UploadDocumentDialog({
  open,
  onOpenChange,
  prefillCaseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillCaseId: string;
  onSuccess: () => void;
}) {
  const [caseId, setCaseId] = useState(prefillCaseId);
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync prefill when dialog opens
  React.useEffect(() => {
    if (open) {
      setCaseId(prefillCaseId);
      setDocType('');
      setFile(null);
      setError(null);
    }
  }, [open, prefillCaseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId.trim() || !docType || !file) return;

    setUploading(true);
    setError(null);
    try {
      await uploadDocument(caseId.trim(), docType, file);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Upload a document and attach it to a case.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="upload-case-id">Case ID</Label>
            <Input
              id="upload-case-id"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="Enter case ID"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {formatDocType(dt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-file-input">File</Label>
            <Input
              id="upload-file-input"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!caseId.trim() || !docType || !file || uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────

export default function DocumentsPage() {
  const [searchCaseId, setSearchCaseId] = useState('');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { documents, caseData, isLoading, mutate } = useCaseDocuments(activeCaseId);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchCaseId.trim();
    if (trimmed) {
      setActiveCaseId(trimmed);
    }
  }

  function handleClear() {
    setSearchCaseId('');
    setActiveCaseId(null);
  }

  async function handleDownload(doc: Document) {
    setDownloadingId(doc.id);
    try {
      await downloadDocument(doc.id, doc.filename || 'download');
    } catch {
      // Download error — user sees no file
    } finally {
      setDownloadingId(null);
    }
  }

  function handleDeleteClick(doc: Document) {
    setDocToDelete(doc);
    setDeleteDialogOpen(true);
  }

  const caseNumber = (caseData as Record<string, unknown>)?.caseNumber as string | undefined;

  return (
    <div>
      <PageHeader title="Documents" description="Search and manage case documents">
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </PageHeader>

      {/* Case ID search */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find Documents by Case</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex items-end gap-3">
            <div className="flex-1 max-w-sm space-y-2">
              <Label htmlFor="search-case-id">Case ID</Label>
              <Input
                id="search-case-id"
                value={searchCaseId}
                onChange={(e) => setSearchCaseId(e.target.value)}
                placeholder="Enter case ID to search..."
              />
            </div>
            <Button type="submit" disabled={!searchCaseId.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            {activeCaseId && (
              <Button type="button" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {activeCaseId && (
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : !caseData ? (
            <div className="text-center py-12 text-muted-foreground">
              Case not found. Please check the ID and try again.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    Documents for {caseNumber || activeCaseId}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {documents.length} document{documents.length !== 1 ? 's' : ''} found
                  </p>
                </div>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground rounded-md border">
                  No documents attached to this case yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border p-4"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {doc.filename || 'Untitled'}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <StatusBadge status={doc.docType || 'other'} />
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(doc.size)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.createdAt)}
                            </span>
                            {doc.uploadedBy && (
                              <span className="text-xs text-muted-foreground">
                                by {doc.uploadedBy}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                        >
                          <Download className="h-4 w-4" />
                          <span className="sr-only">Download</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(doc)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* No search state */}
      {!activeCaseId && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Enter a Case ID above to view and manage documents.</p>
          <p className="text-sm mt-1">You can also upload new documents using the button above.</p>
        </div>
      )}

      {/* Dialogs */}
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        prefillCaseId={activeCaseId || ''}
        onSuccess={() => mutate()}
      />
      <DeleteDocumentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        doc={docToDelete}
        onConfirm={() => mutate()}
      />
    </div>
  );
}
