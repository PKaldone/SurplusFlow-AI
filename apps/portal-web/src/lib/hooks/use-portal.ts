import useSWR from "swr";

export function useMyCases() {
  const { data, error, isLoading, mutate } = useSWR("/api/v1/portal/my-cases");
  return {
    cases: data?.data ?? data ?? [],
    isLoading,
    error,
    mutate,
  };
}

export function useMyCase(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/v1/portal/my-cases/${id}` : null,
  );
  return {
    caseData: data?.data ?? data ?? null,
    isLoading,
    error,
    mutate,
  };
}

export function useMyCaseStatus(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/v1/portal/my-cases/${id}/status` : null,
  );
  return {
    status: data?.data ?? data ?? null,
    isLoading,
    error,
    mutate,
  };
}

export function useMyInvoices() {
  const { data, error, isLoading, mutate } = useSWR("/api/v1/portal/my-invoices");
  return {
    invoices: data?.data ?? data ?? [],
    isLoading,
    error,
    mutate,
  };
}
