import { apiFetch } from '@/api/http';
import type { LegalDocumentsResponse, LegalPublicResponse } from '@/types/api';

export function getPublicLegal() { return apiFetch<LegalPublicResponse>('/api/legal/publicos/passageiro', { retryAuth: false }); }
export function getCurrentLegal() { return apiFetch<LegalDocumentsResponse>('/api/legal/documentos'); }
export function acceptLegal(documentos: Array<{ documento_tipo: string; versao: string }>) {
  return apiFetch<{ sucesso: boolean; mensagem: string; documentos: unknown[] }>('/api/legal/aceites', {
    method: 'POST',
    body: JSON.stringify({ documentos }),
    idempotencyKey: `legal-accept-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });
}
