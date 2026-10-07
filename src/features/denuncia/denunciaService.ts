import { apiFetch } from '@/api/http';
import type { ReportInput } from '@/types/api';

export function createReport(input: ReportInput) {
  return apiFetch<{ mensagem: string; denuncia: Record<string, unknown>; bloqueio_automatico?: boolean }>('/api/denuncias', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
