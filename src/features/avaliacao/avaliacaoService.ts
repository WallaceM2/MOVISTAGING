import { apiFetch } from '@/api/http';
import type { EvaluationInput } from '@/types/api';

export function createEvaluation(input: EvaluationInput) {
  return apiFetch<{ mensagem: string; avaliacao: Record<string, unknown>; avaliado: Record<string, unknown> }>('/api/avaliacoes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
