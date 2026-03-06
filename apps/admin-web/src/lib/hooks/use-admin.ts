import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

export const USER_ROLES = [
  'admin',
  'ops',
  'compliance',
  'attorney',
  'claimant',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AdminUser {
  id: string;
  email: string;
  phone?: string;
  role: UserRole;
  mfaEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

interface UserFilters {
  role?: string;
  page?: number;
  limit?: number;
}

interface UserListResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export function useUsers(filters: UserFilters = {}) {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  params.set('page', String(filters.page || 1));
  params.set('limit', String(filters.limit || 25));

  const { data, error, isLoading, mutate } = useSWR<UserListResponse>(
    `/api/v1/admin/users?${params}`,
  );

  return {
    users: data?.data || [],
    total: data?.total || 0,
    error,
    isLoading,
    mutate,
  };
}

export async function createUser(body: {
  email: string;
  phone?: string;
  role: UserRole;
  password?: string;
  mfaEnabled?: boolean;
}): Promise<AdminUser> {
  return apiFetch<AdminUser>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateUser(
  id: string,
  body: { is_active?: boolean; role?: string },
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/v1/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
