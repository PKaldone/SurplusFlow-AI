'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  ExternalLink,
  Eye,
  FileSearch,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  TrendingUp,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { LoadingPage } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConvertToCaseDialog } from '@/components/convert-to-case-dialog';
import { apiFetch } from '@/lib/api';
import {
  useOpportunity,
  useRuleCheck,
  Opportunity,
  RuleCheckSignal,
} from '@/lib/hooks/use-opportunities';
import { formatCurrency, formatSourceType } from '@/lib/hooks/use-cases';

// -- Helpers --

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-right truncate text-blue-600 hover:underline flex items-center gap-1"
        >
          {value}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="font-medium text-right truncate">{value}</span>
      )}
    </div>
  );
}

// -- Signal severity styling --

const SIGNAL_STYLES: Record<string, { icon: React.ReactNode; bg: string; border: string }> = {
  ok: {
    icon: <CheckCircle className="h-4 w-4 text-green-600" />,
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  info: {
    icon: <Info className="h-4 w-4 text-blue-600" />,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  critical: {
    icon: <XCircle className="h-4 w-4 text-red-600" />,
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

function SignalCard({ signal }: { signal: RuleCheckSignal }) {
  const style = SIGNAL_STYLES[signal.severity] || SIGNAL_STYLES.info;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${style.bg} ${style.border}`}>
      <div className="mt-0.5 shrink-0">{style.icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{signal.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{signal.detail}</p>
      </div>
    </div>
  );
}

// -- Rule check verdict badge --

function VerdictBadge({ result }: { result: string }) {
  switch (result) {
    case 'ALLOWED':
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
          <ShieldCheck className="h-3 w-3" />
          Allowed
        </Badge>
      );
    case 'ALLOWED_WITH_CONSTRAINTS':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
          <Shield className="h-3 w-3" />
          Allowed with Constraints
        </Badge>
      );
    case 'BLOCKED':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
          <ShieldAlert className="h-3 w-3" />
          Blocked
        </Badge>
      );
    default:
      return <StatusBadge status={result} />;
  }
}

// -- Scanning Intelligence Panel --

function ScanningIntelligence({ opportunityId }: { opportunityId: string }) {
  const { ruleCheck, isLoading, mutate } = useRuleCheck(opportunityId);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRescan() {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Scanning Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Analyzing opportunity...</p>
        </CardContent>
      </Card>
    );
  }

  if (!ruleCheck) return null;

  const { ruleCheck: check, signals, duplicateCount } = ruleCheck;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Scanning Intelligence
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRescan}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Rescan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verdict */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Compliance Verdict</span>
          <VerdictBadge result={check.result} />
        </div>

        {/* Constraints */}
        {check.constraints.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Constraints</p>
            {check.constraints.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Shield className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {check.warnings.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Warnings</p>
            {check.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Signals */}
        {signals && signals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Intelligence Signals</p>
            <div className="grid gap-2">
              {signals.map((s, i) => (
                <SignalCard key={i} signal={s} />
              ))}
            </div>
          </div>
        )}

        {/* Duplicate indicator */}
        {duplicateCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Search className="h-4 w-4 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {duplicateCount} potential duplicate{duplicateCount > 1 ? 's' : ''} detected
              </p>
              <p className="text-xs text-muted-foreground">
                Same owner, state, and source type
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- Related Cases --

function RelatedCasesTab({ opportunity }: { opportunity: Opportunity }) {
  const router = useRouter();
  const cases = opportunity.relatedCases || [];

  if (cases.length === 0) {
    return (
      <div className="text-center py-8">
        <FileSearch className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No cases created from this opportunity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cases.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
          onClick={() => router.push(`/cases/${c.id}`)}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-sm">{c.caseNumber}</span>
              <StatusBadge status={c.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {c.claimantName && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {c.claimantName}
                </span>
              )}
              {c.claimantEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {c.claimantEmail}
                </span>
              )}
              {c.claimantPhone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {c.claimantPhone}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium text-sm">{formatCurrency(c.claimedAmount)}</p>
            <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// -- Outreach History --

function OutreachTab({ opportunity }: { opportunity: Opportunity }) {
  const records = opportunity.outreachHistory || [];

  if (records.length === 0) {
    return (
      <div className="text-center py-8">
        <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No outreach records yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full bg-muted p-2">
              {r.channel === 'email' ? (
                <Mail className="h-4 w-4" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize">{r.channel}</span>
                <Badge variant="outline" className="text-xs">Touch #{r.touchNumber}</Badge>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(r.templateKey || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0 space-y-0.5">
            {r.sentAt && <p>Sent: {formatDateTime(r.sentAt)}</p>}
            {r.deliveredAt && <p>Delivered: {formatDateTime(r.deliveredAt)}</p>}
            {r.openedAt && <p className="text-green-600">Opened: {formatDateTime(r.openedAt)}</p>}
            {r.respondedAt && <p className="text-blue-600 font-medium">Responded: {formatDateTime(r.respondedAt)}</p>}
            {r.stopReason && <p className="text-red-500">Stopped: {r.stopReason}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// -- Enrichment History --

function EnrichmentTab({ opportunity }: { opportunity: Opportunity }) {
  const entries = opportunity.enrichmentHistory || [];

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No enrichment activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e, i) => {
        const details = (typeof e.details === 'string' ? JSON.parse(e.details) : e.details || {}) as Record<string, unknown>;
        return (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="rounded-full bg-green-50 p-2 mt-0.5">
              <Zap className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {e.action === 'claimant.email_enriched' ? 'Email Discovered' : e.action.replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                {details.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {String(details.email)}
                  </span>
                )}
                {details.confidence && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {String(details.confidence)}% confidence
                  </span>
                )}
                {details.source && (
                  <Badge variant="outline" className="text-xs">{String(details.source)}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatDateTime(e.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -- Main Page --

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { opportunity, isLoading, mutate } = useOpportunity(id);
  const [convertOpen, setConvertOpen] = useState(false);
  const [qualifying, setQualifying] = useState(false);

  async function handleQualify() {
    setQualifying(true);
    try {
      await apiFetch(`/api/v1/opportunities/${id}/qualify`, { method: 'POST' });
      mutate();
    } catch {
      // handled by UI
    } finally {
      setQualifying(false);
    }
  }

  if (isLoading) return <LoadingPage />;

  if (!opportunity) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Opportunity not found.</p>
        <Button variant="link" onClick={() => router.push('/opportunities')} className="mt-2">
          Back to Opportunities
        </Button>
      </div>
    );
  }

  const canConvert = opportunity.status === 'new' || opportunity.status === 'matched' || opportunity.status === 'qualified';
  const canQualify = opportunity.status === 'new' || opportunity.status === 'matched';

  return (
    <TooltipProvider>
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {opportunity.ownerName || 'Unknown Owner'}
              </h1>
              <StatusBadge status={opportunity.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[opportunity.jurisdictionCounty, opportunity.jurisdictionState].filter(Boolean).join(', ') || '-'}
              </span>
              <span>&middot;</span>
              <span>{formatSourceType(opportunity.sourceType)}</span>
              <span>&middot;</span>
              <span className="font-medium">{formatCurrency(opportunity.estimatedAmount)}</span>
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {canQualify && (
            <Button variant="outline" size="sm" onClick={handleQualify} disabled={qualifying}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {qualifying ? 'Qualifying...' : 'Qualify'}
            </Button>
          )}
          {canConvert && (
            <Button size="sm" onClick={() => setConvertOpen(true)}>
              <Zap className="h-4 w-4 mr-2" />
              Convert to Case
            </Button>
          )}
          {opportunity.sourceUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={opportunity.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Source
              </a>
            </Button>
          )}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Property Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Property Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Source Type" value={formatSourceType(opportunity.sourceType)} />
              <InfoRow label="State" value={opportunity.jurisdictionState || '-'} />
              <InfoRow label="County" value={opportunity.jurisdictionCounty || '-'} />
              <InfoRow label="Amount" value={formatCurrency(opportunity.estimatedAmount)} />
              {opportunity.parcelNumber && (
                <InfoRow label="Parcel #" value={opportunity.parcelNumber} />
              )}
              {opportunity.propertyDescription && (
                <>
                  <Separator />
                  <div>
                    <span className="text-muted-foreground text-xs">Description</span>
                    <p className="mt-1 text-sm">{opportunity.propertyDescription}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Owner & Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Owner & Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Owner Name" value={opportunity.ownerName || '-'} />
              <InfoRow label="Address" value={opportunity.ownerAddress || '-'} />
              <InfoRow label="Holder" value={opportunity.holderName || '-'} />
              <Separator />
              <InfoRow label="Sale Date" value={formatDate(opportunity.saleDate)} />
              <InfoRow label="Surplus Date" value={formatDate(opportunity.surplusDate)} />
              <InfoRow label="Deadline" value={formatDate(opportunity.deadlineDate)} />
              <Separator />
              <InfoRow label="Ingested" value={formatDateTime(opportunity.ingestedAt)} />
              <InfoRow label="Updated" value={formatDateTime(opportunity.updatedAt)} />
              {opportunity.sourceRef && (
                <InfoRow label="Source Ref" value={opportunity.sourceRef} />
              )}
              {opportunity.sourceUrl && (
                <InfoRow label="Source URL" value="Open" href={opportunity.sourceUrl} />
              )}
            </CardContent>
          </Card>

          {/* Scanning Intelligence */}
          <ScanningIntelligence opportunityId={id} />
        </div>

        {/* Tabs: Related Cases, Outreach, Enrichment */}
        <Tabs defaultValue="cases">
          <TabsList>
            <TabsTrigger value="cases" className="gap-1.5">
              <FileSearch className="h-4 w-4" />
              Cases
              {(opportunity.relatedCases?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {opportunity.relatedCases!.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outreach" className="gap-1.5">
              <Mail className="h-4 w-4" />
              Outreach
              {(opportunity.outreachHistory?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {opportunity.outreachHistory!.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="enrichment" className="gap-1.5">
              <Zap className="h-4 w-4" />
              Enrichment
              {(opportunity.enrichmentHistory?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {opportunity.enrichmentHistory!.length}
                </Badge>
              )}
            </TabsTrigger>
            {opportunity.rawData && (
              <TabsTrigger value="raw" className="gap-1.5">
                <Eye className="h-4 w-4" />
                Raw Data
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="cases" className="mt-4">
            <RelatedCasesTab opportunity={opportunity} />
          </TabsContent>

          <TabsContent value="outreach" className="mt-4">
            <OutreachTab opportunity={opportunity} />
          </TabsContent>

          <TabsContent value="enrichment" className="mt-4">
            <EnrichmentTab opportunity={opportunity} />
          </TabsContent>

          {opportunity.rawData && (
            <TabsContent value="raw" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <pre className="text-xs font-mono bg-muted rounded-lg p-4 overflow-auto max-h-96">
                    {JSON.stringify(opportunity.rawData, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {/* Convert dialog */}
        <ConvertToCaseDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          opportunity={opportunity}
          onSuccess={() => mutate()}
        />
      </div>
    </TooltipProvider>
  );
}
