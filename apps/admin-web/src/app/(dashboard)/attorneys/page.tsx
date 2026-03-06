'use client';

import React, { useState } from 'react';
import { Check, X, Plus, ToggleLeft, ToggleRight } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { DataTable, Column } from '@/components/data-table';
import { CreateUserDialog } from '@/components/create-user-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { useUsers, updateUser, type AdminUser } from '@/lib/hooks/use-admin';

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AttorneysPage() {
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { users: attorneys, total, isLoading, mutate } = useUsers({
    role: 'attorney',
    page,
    limit: LIMIT,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggleActive(attorney: AdminUser) {
    setTogglingId(attorney.id);
    try {
      await updateUser(attorney.id, { is_active: !attorney.isActive });
      mutate();
    } catch {
      // toggle error
    } finally {
      setTogglingId(null);
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        <span className="text-sm font-medium">{row.email}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.phone || '-'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (row) =>
        row.isActive ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        ),
    },
    {
      key: 'mfaEnabled',
      header: 'MFA',
      render: (row) =>
        row.mfaEnabled ? (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Enabled
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
            Off
          </Badge>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleActive(row)}
            disabled={togglingId === row.id}
            title={row.isActive ? 'Deactivate' : 'Activate'}
          >
            {row.isActive ? (
              <ToggleRight className="h-4 w-4 text-green-600" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Attorneys" description="Manage attorney accounts">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Attorney
        </Button>
      </PageHeader>

      <DataTable<AdminUser>
        columns={columns}
        data={attorneys}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No attorneys found."
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => mutate()}
        fixedRole="attorney"
        title="Add Attorney"
        description="Create a new attorney account."
      />
    </div>
  );
}
