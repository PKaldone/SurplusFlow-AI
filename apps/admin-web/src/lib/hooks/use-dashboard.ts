import useSWR from 'swr';

export interface DashboardStats {
  total_cases: number;
  active_cases: number;
  pending_outreach: number;
  filed_claims: number;
  total_recovered: number;
  revenue: number;
}

export function useDashboard() {
  const { data, error, isLoading } = useSWR<DashboardStats>('/api/v1/admin/dashboard');
  return { stats: data, error, isLoading };
}
