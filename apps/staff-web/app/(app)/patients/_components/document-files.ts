import { ApiError } from '@serenemed/api-client';
import { SESSION_EXPIRED_KEY } from '../../../../lib/api-client';
import { clearStaffSession, getStaffToken } from '../../../../lib/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * The shared ApiClient only speaks JSON, so the two document-file calls
 * (multipart upload, binary download) go through fetch directly with the
 * same base URL, bearer token and 401 handling as lib/api-client.
 */
async function fileRequest(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getStaffToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && token) {
    try {
      window.sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    } catch {
      // storage blocked: the redirect still happens, just without the notice
    }
    clearStaffSession();
    window.location.replace('/login');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiError(response.status, body);
  }
  return response;
}

export interface DocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  createdAt: string;
  uploadedBy?: { fullName: string } | null;
}

/** POST /patient-documents/upload (multipart). */
export async function uploadDocument(input: {
  patientId: string;
  documentType: string;
  file: File;
}): Promise<DocumentRow> {
  const form = new FormData();
  form.set('patientId', input.patientId);
  form.set('documentType', input.documentType);
  form.set('file', input.file, input.file.name);
  const response = await fileRequest('/patient-documents/upload', { method: 'POST', body: form });
  return (await response.json()) as DocumentRow;
}

/**
 * GET /patient-documents/:id/file in a new tab. A plain link would not
 * carry the bearer token, so the file is fetched first and opened from a
 * blob URL, which is released once the tab has it.
 */
export async function openDocument(id: string): Promise<void> {
  // Open the tab synchronously (inside the click) so popup blockers allow it.
  const tab = window.open('', '_blank');
  try {
    const response = await fileRequest(`/patient-documents/${encodeURIComponent(id)}/file`, {
      method: 'GET',
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
