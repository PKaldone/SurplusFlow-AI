'use client';

import React, { useState } from 'react';
import { Upload, Zap } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable, Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ImportCsvDialog } from '@/components/import-csv-dialog';
import { TriggerScrapeDialog } from '@/components/trigger-scrape-dialog';
import { ConvertToCaseDialog } from '@/components/convert-to-case-dialog';
import {
  useOpportunities,
  SOURCE_TYPES,
  OPPORTUNITY_STATUSES,
  Opportunity,
} from '@/lib/hooks/use-opportunities';
import { formatCurrency, formatSourceType } from '@/lib/hooks/use-cases';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;

const LIMIT = 25;

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function OpportunitiesPage() {
  const [stateFilter, setStateFilter] = useState('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [page, setPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  const { opportunities, total, isLoading, mutate } = useOpportunities({
    state: stateFilter === 'all' ? undefined : stateFilter,
    sourceType: sourceTypeFilter === 'all' ? undefined : sourceTypeFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    minAmount: minAmount || undefined,
    maxAmount: maxAmount || undefined,
    page,
    limit: LIMIT,
  });

  function resetFilters() {
    setStateFilter('all');
    setSourceTypeFilter('all');
    setStatusFilter('all');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
  }

  function handleConvert(opp: Opportunity) {
    setSelectedOpportunity(opp);
    setConvertOpen(true);
  }

  const columns: Column<Opportunity>[] = [
    {
      key: 'ownerName',
      header: 'Owner Name',
      render: (row) => <span className="font-medium">{row.ownerName || '-'}</span>,
    },
    {
      key: 'jurisdictionState',
      header: 'State',
      render: (row) => row.jurisdictionState || '-',
    },
    {
      key: 'jurisdictionCounty',
      header: 'County',
      render: (row) => row.jurisdictionCounty || '-',
    },
    {
      key: 'sourceType',
      header: 'Source Type',
      className: 'text-xs',
      render: (row) => formatSourceType(row.sourceType),
    },
    {
      key: 'estimatedAmount',
      header: 'Amount',
      render: (row) => formatCurrency(row.estimatedAmount),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'ingestedAt',
      header: 'Ingested',
      className: 'text-xs',
      render: (row) => formatDate(row.ingestedAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        const canConvert = row.status === 'new' || row.status === 'matched';
        return canConvert ? (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              handleConvert(row);
            }}
          >
            Convert to Case
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Opportunities" description="Discovered surplus opportunities">
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
        <Button onClick={() => setScrapeOpen(true)}>
          <Zap className="h-4 w-4 mr-2" />
          Trigger Scrape
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="w-36">
          <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-52">
          <Select value={sourceTypeFilter} onValueChange={(v) => { setSourceTypeFilter(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SOURCE_TYPES.map((st) => (
                <SelectItem key={st} value={st}>{formatSourceType(st)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-44">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {OPPORTUNITY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-32">
          <Input
            type="number"
            placeholder="Min $"
            value={minAmount}
            onChange={(e) => { setMinAmount(e.target.value); setPage(1); }}
            min="0"
          />
        </div>

        <div className="w-32">
          <Input
            type="number"
            placeholder="Max $"
            value={maxAmount}
            onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }}
            min="0"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Reset
        </Button>
      </div>

      <DataTable<Opportunity>
        columns={columns}
        data={opportunities}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No opportunities found."
      />

      <ImportCsvDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => mutate()}
      />

      <TriggerScrapeDialog
        open={scrapeOpen}
        onOpenChange={setScrapeOpen}
        onSuccess={() => mutate()}
      />

      <ConvertToCaseDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        opportunity={selectedOpportunity}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
