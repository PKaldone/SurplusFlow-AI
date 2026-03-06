'use client';

import React, { useState } from 'react';
import {
  Check,
  X,
  Plus,
  ToggleLeft,
  ToggleRight,
  UserCog,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { DataTable, Column } from '@/components/data-table';
import { CreateUserDialog } from '@/components/create-user-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  useUsers,
  updateUser,
  USER_ROLES,
  type AdminUser,
  type UserRole,
} from '@/lib/hooks/use-admin';

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

// ── Change Role Dialog ─────────────────────────────────────

function ChangeRoleDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<UserRole>('claimant');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open && user) {
      setRole(user.role);
      setError(null);
    }
  }, [open, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateUser(user.id, { role });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>
            Update role for {user?.email || 'user'}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              <UserCog className="h-4 w-4 mr-2" />
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Main Page ──────────────────────────────────────────────

export default function SettingsPage() {
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { users, total, isLoading, mutate } = useUsers({
    role: roleFilter === 'all' ? undefined : roleFilter,
    page,
    limit: LIMIT,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggleActive(user: AdminUser) {
    setTogglingId(user.id);
    try {
      await updateUser(user.id, { is_active: !user.isActive });
      mutate();
    } catch {
      // toggle error
    } finally {
      setTogglingId(null);
    }
  }

  function handleChangeRole(user: AdminUser) {
    setSelectedUser(user);
    setChangeRoleOpen(true);
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
      key: 'role',
      header: 'Role',
      render: (row) => <RoleBadge role={row.role} />,
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
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleChangeRole(row)}
            title="Change role"
          >
            <UserCog className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="User Management" description="Manage system users and roles">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </PageHeader>

      {/* Role filter */}
      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm">Role</Label>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable<AdminUser>
        columns={columns}
        data={users}
        totalCount={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No users found."
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => mutate()}
      />

      <ChangeRoleDialog
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        user={selectedUser}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
