'use client';

import React, { useState } from 'react';
import {
  Shield,
  Download,
  Upload,
  Plus,
  Check,
  X,
  Search,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable, Column } from '@/components/data-table';
import { RuleDetailDialog } from '@/components/rule-detail-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useRules,
  createRule,
  evaluateCompliance,
  importRulesCsv,
  exportRulesCsv,
  VERIFICATION_STATUSES,
  SOURCE_TYPES,
  ComplianceRule,
  EvaluationResult,
} from '@/lib/hooks/use-compliance';
import { formatCurrency } from '@/lib/hooks/use-cases';

// ── Helpers ────────────────────────────────────────────────

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function BoolIcon({ value }: { value: boolean | undefined | null }) {
  if (value === true) return <Check className="h-4 w-4 text-green-600" />;
  if (value === false) return <X className="h-4 w-4 text-red-500" />;
  return <span className="text-muted-foreground">-</span>;
}

// ── Import CSV Dialog ──────────────────────────────────────

function ImportCsvDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [csvContent, setCsvContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCsvContent('');
      setError(null);
    }
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvContent(text);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvContent.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await importRulesCsv(csvContent.trim());
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Rules CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file or paste CSV content to import compliance rules.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="import-file">CSV File</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-csv">Or Paste CSV</Label>
            <Textarea
              id="import-csv"
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="state,county,sourceType,maxFeePercent,..."
              rows={6}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!csvContent.trim() || submitting}>
              <Upload className="h-4 w-4 mr-2" />
              {submitting ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Rule Dialog ─────────────────────────────────────

function CreateRuleDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [state, setState] = useState('');
  const [county, setCounty] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [maxFeePercent, setMaxFeePercent] = useState('');
  const [feeCapAmount, setFeeCapAmount] = useState('');
  const [coolingOffDays, setCoolingOffDays] = useState('');
  const [notarizationRequired, setNotarizationRequired] = useState(false);
  const [assignmentAllowed, setAssignmentAllowed] = useState(true);
  const [licenseRequired, setLicenseRequired] = useState(false);
  const [bondRequired, setBondRequired] = useState(false);
  const [bondAmount, setBondAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setState('');
      setCounty('');
      setSourceType('');
      setMaxFeePercent('');
      setFeeCapAmount('');
      setCoolingOffDays('');
      setNotarizationRequired(false);
      setAssignmentAllowed(true);
      setLicenseRequired(false);
      setBondRequired(false);
      setBondAmount('');
      setEffectiveDate('');
      setNotes('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.trim() || !sourceType) return;

    setSubmitting(true);
    setError(null);
    try {
      await createRule({
        state: state.trim(),
        county: county.trim() || undefined,
        sourceType,
        maxFeePercent: maxFeePercent ? Number(maxFeePercent) : undefined,
        feeCapAmount: feeCapAmount ? Number(feeCapAmount) : undefined,
        coolingOffDays: coolingOffDays ? Number(coolingOffDays) : undefined,
        notarizationRequired,
        assignmentAllowed,
        licenseRequired,
        bondRequired,
        bondAmount: bondAmount ? Number(bondAmount) : undefined,
        effectiveDate: effectiveDate || undefined,
        notes: notes.trim() || undefined,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Compliance Rule</DialogTitle>
          <DialogDescription>
            Create a new state/county compliance rule.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>State *</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g., CA" required />
            </div>
            <div className="space-y-2">
              <Label>County</Label>
              <Input value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Source Type *</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {formatLabel(st)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Fee %</Label>
              <Input type="number" min="0" max="100" step="0.1" value={maxFeePercent} onChange={(e) => setMaxFeePercent(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fee Cap Amount</Label>
              <Input type="number" min="0" step="0.01" value={feeCapAmount} onChange={(e) => setFeeCapAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cooling Off Days</Label>
              <Input type="number" min="0" value={coolingOffDays} onChange={(e) => setCoolingOffDays(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bond Amount</Label>
              <Input type="number" min="0" step="0.01" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notarizationRequired} onChange={(e) => setNotarizationRequired(e.target.checked)} className="rounded" />
              Notarization Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={assignmentAllowed} onChange={(e) => setAssignmentAllowed(e.target.checked)} className="rounded" />
              Assignment Allowed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={licenseRequired} onChange={(e) => setLicenseRequired(e.target.checked)} className="rounded" />
              License Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bondRequired} onChange={(e) => setBondRequired(e.target.checked)} className="rounded" />
              Bond Required
            </label>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!state.trim() || !sourceType || submitting}>
              <Plus className="h-4 w-4 mr-2" />
              {submitting ? 'Creating...' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rules Matrix Tab ───────────────────────────────────────

function RulesMatrixTab() {
  const [stateFilter, setStateFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { rules, total, isLoading, mutate } = useRules({
    state: stateFilter || undefined,
    verificationStatus: verificationFilter === 'all' ? undefined : verificationFilter,
    page,
    limit: LIMIT,
  });

  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportRulesCsv();
    } catch {
      // Export error
    } finally {
      setExporting(false);
    }
  }

  function handleRowClick(rule: ComplianceRule) {
    setSelectedRule(rule);
    setDetailOpen(true);
  }

  const columns: Column<ComplianceRule>[] = [
    {
      key: 'state',
      header: 'State',
      render: (row) => <span className="font-medium text-sm">{row.state}</span>,
    },
    {
      key: 'county',
      header: 'County',
      render: (row) => <span className="text-sm">{row.county || '-'}</span>,
    },
    {
      key: 'sourceType',
      header: 'Source Type',
      render: (row) => <span className="text-sm">{formatLabel(row.sourceType)}</span>,
    },
    {
      key: 'maxFeePercent',
      header: 'Max Fee %',
      render: (row) => (
        <span className="text-sm">{row.maxFeePercent != null ? `${row.maxFeePercent}%` : '-'}</span>
      ),
    },
    {
      key: 'feeCapAmount',
      header: 'Fee Cap',
      render: (row) => (
        <span className="text-sm font-mono">{row.feeCapAmount != null ? formatCurrency(row.feeCapAmount) : '-'}</span>
      ),
    },
    {
      key: 'coolingOffDays',
      header: 'Cooling Off',
      render: (row) => (
        <span className="text-sm">{row.coolingOffDays != null ? `${row.coolingOffDays}d` : '-'}</span>
      ),
    },
    {
      key: 'licenseRequired',
      header: 'License',
      render: (row) => <BoolIcon value={row.licenseRequired} />,
    },
    {
      key: 'bondRequired',
      header: 'Bond',
      render: (row) => <BoolIcon value={row.bondRequired} />,
    },
    {
      key: 'verificationStatus',
      header: 'Verification',
      render: (row) => <StatusBadge status={row.verificationStatus} />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            placeholder="Filter by state..."
            className="w-[140px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Verification</Label>
          <Select value={verificationFilter} onValueChange={(v) => { setVerificationFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {VERIFICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </div>

      <DataTable<ComplianceRule>
        columns={columns}
        data={rules}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        loading={isLoading}
        emptyMessage="No compliance rules found."
      />

      {/* Dialogs */}
      <ImportCsvDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => mutate()}
      />
      <CreateRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => mutate()}
      />
      <RuleDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        rule={selectedRule}
        onUpdated={() => {
          mutate();
          setDetailOpen(false);
        }}
      />
    </div>
  );
}

// ── Evaluate Tab ───────────────────────────────────────────

function EvaluateTab() {
  const [state, setState] = useState('');
  const [county, setCounty] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [solicitationDate, setSolicitationDate] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [hasLicense, setHasLicense] = useState(false);
  const [hasBond, setHasBond] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.trim() || !sourceType || !feePercent || !estimatedAmount) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const evalResult = await evaluateCompliance({
        state: state.trim(),
        county: county.trim() || undefined,
        sourceType,
        configuredFeePercent: Number(feePercent),
        estimatedAmount: Number(estimatedAmount),
        solicitationDate: solicitationDate || undefined,
        saleDate: saleDate || undefined,
        hasLicense,
        hasBond,
      });
      setResult(evalResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setSubmitting(false);
    }
  }

  const resultColorMap: Record<string, string> = {
    ALLOWED: 'bg-green-50 border-green-200',
    ALLOWED_WITH_CONSTRAINTS: 'bg-yellow-50 border-yellow-200',
    BLOCKED: 'bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compliance Evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>State *</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g., CA" required />
              </div>
              <div className="space-y-2">
                <Label>County</Label>
                <Input value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Source Type *</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {formatLabel(st)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fee Percent (0-100) *</Label>
                <Input type="number" min="0" max="100" step="0.1" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Estimated Amount *</Label>
                <Input type="number" min="0" step="0.01" value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Solicitation Date</Label>
                <Input type="date" value={solicitationDate} onChange={(e) => setSolicitationDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Sale Date</Label>
                <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasLicense} onChange={(e) => setHasLicense(e.target.checked)} className="rounded" />
                Has License
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasBond} onChange={(e) => setHasBond(e.target.checked)} className="rounded" />
                Has Bond
              </label>
            </div>

            <Button type="submit" disabled={!state.trim() || !sourceType || !feePercent || !estimatedAmount || submitting}>
              <Search className="h-4 w-4 mr-2" />
              {submitting ? 'Evaluating...' : 'Evaluate Compliance'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className={`border-2 ${resultColorMap[result.result] || ''}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <StatusBadge status={result.result} className="text-base px-4 py-1" />
              <span className="text-lg font-semibold">
                {result.result === 'ALLOWED' && 'This configuration is compliant.'}
                {result.result === 'ALLOWED_WITH_CONSTRAINTS' && 'Compliant with constraints.'}
                {result.result === 'BLOCKED' && 'This configuration is not allowed.'}
              </span>
            </div>

            {result.maxFeePercent != null && (
              <p className="text-sm text-muted-foreground mb-1">
                Maximum fee: <span className="font-medium">{result.maxFeePercent}%</span>
              </p>
            )}
            {result.feeCapAmount != null && (
              <p className="text-sm text-muted-foreground mb-1">
                Fee cap: <span className="font-medium">{formatCurrency(result.feeCapAmount)}</span>
              </p>
            )}

            {result.constraints && result.constraints.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2">Constraints</h4>
                <ul className="space-y-1">
                  {result.constraints.map((c, i) => (
                    <li key={i} className="text-sm text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.reasons && result.reasons.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2">Reasons</h4>
                <ul className="space-y-1">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="text-sm text-red-700 bg-red-50 px-3 py-1.5 rounded">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function CompliancePage() {
  return (
    <div>
      <PageHeader
        title="Compliance"
        description="Manage state rules, evaluate compliance, and maintain the rules matrix"
      />

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">
            <Shield className="h-4 w-4 mr-2" />
            Rules Matrix
          </TabsTrigger>
          <TabsTrigger value="evaluate">
            <Search className="h-4 w-4 mr-2" />
            Evaluate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <RulesMatrixTab />
        </TabsContent>

        <TabsContent value="evaluate" className="mt-4">
          <EvaluateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
