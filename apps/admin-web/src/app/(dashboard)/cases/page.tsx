'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

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
import { CreateCaseDialog } from '@/components/create-case-dialog';
import {
  useCases,
  CASE_STATUSES,
  formatCurrency,
  formatSourceType,
} from '@/lib/hooks/use-cases';

interface CaseRow {
  id: string;
  caseNumber: string;
  claimantName?: string;
  claimant?: { firstName?: string; lastName?: string; name?: string };
  state?: string;
  sourceType?: string;
  estimatedAmount?: number;
  amount?: number;
  status: string;
  assignedOpsId?: string;
  assignedOps?: { name?: string };
  [key: string]: unknown;
}

const LIMIT = 25;

export default function CasesPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { cases, total, isLoading, mutate } = useCases({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: LIMIT,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return cases as CaseRow[];
    const q = search.toLowerCase();
    return (cases as CaseRow[]).filter((c) => {
      const name =
        c.claimantName ||
        c.claimant?.name ||
        [c.claimant?.firstName, c.claimant?.lastName].filter(Boolean).join(' ');
      return (
        c.caseNumber?.toLowerCase().includes(q) ||
        name?.toLowerCase().includes(q)
      );
    });
  }, [cases, search]);

  function getClaimantName(row: CaseRow): string {
    return (
      row.claimantName ||
      row.claimant?.name ||
      [row.claimant?.firstName, row.claimant?.lastName].filter(Boolean).join(' ') ||
      '-'
    );
  }

  function getAssignedName(row: CaseRow): string {
    return row.assignedOps?.name || row.assignedOpsId || '-';
  }

  const columns: Column<CaseRow>[] = [
    {
      key: 'caseNumber',
      header: 'Case #',
      className: 'font-mono text-xs',
      render: (row) => row.caseNumber || '-',
    },
    {
      key: 'claimant',
      header: 'Claimant',
      render: (row) => <span className="font-medium">{getClaimantName(row)}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => row.state || '-',
    },
    {
      key: 'sourceType',
      header: 'Type',
      className: 'text-xs',
      render: (row) => formatSourceType(row.sourceType),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => formatCurrency(row.estimatedAmount ?? row.amount),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'assignedOpsId',
      header: 'Assigned',
      render: (row) => (
        <span className="text-muted-foreground">{getAssignedName(row)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <Button
          variant="link"
          size="sm"
          className="px-0 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/cases/${row.id}`);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div>
      <PageHeader title="Cases" description="Manage surplus recovery cases">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </PageHeader>

      <div className="flex items-center gap-4 mb-6">
        <Input
          type="text"
          placeholder="Search by case # or claimant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CASE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<CaseRow>
        columns={columns}
        data={filtered}
        totalCount={search.trim() ? filtered.length : total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/cases/${row.id}`)}
        loading={isLoading}
        emptyMessage="No cases found."
      />

      <CreateCaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
