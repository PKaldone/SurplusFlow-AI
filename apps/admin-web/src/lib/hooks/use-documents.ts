import useSWR from 'swr';
import { apiFetch, getAccessToken } from '@/lib/api';

export interface Document {
  id: string;
  caseId: string;
  docType: string;
  filename: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export function useCaseDocuments(caseId: string | null) {
  // Fetch the full case object and extract documents from it
  const { data, error, isLoading, mutate } = useSWR(
    caseId ? `/api/v1/cases/${caseId}` : null,
  );

  const caseObj = data as Record<string, unknown> | undefined;
  const documents: Document[] = (caseObj?.documents as Document[]) || [];

  return {
    documents,
    caseData: caseObj,
    error,
    isLoading,
    mutate,
  };
}

export async function uploadDocument(
  caseId: string,
  docType: string,
  file: File,
): Promise<void> {
  const base64 = await readFileAsBase64(file);
  await apiFetch(`/api/v1/cases/${caseId}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      docType,
      filename: file.name,
      mimeType: file.type,
      fileBase64: base64,
    }),
  });
}

export async function deleteDocument(docId: string): Promise<void> {
  await apiFetch(`/api/v1/documents/${docId}`, {
    method: 'DELETE',
  });
}

export async function downloadDocument(
  docId: string,
  filename: string,
): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  const token = getAccessToken();

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api/v1/documents/${docId}/download`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
