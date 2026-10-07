import { apiFetch } from '@/api/http';
import { createIdempotencyKey } from '@/utils/idempotency';

export function settleDebt() {
  return apiFetch<{ mensagem: string }>('/api/passageiros/quitar-debito', {
    method: 'POST',
    idempotencyKey: createIdempotencyKey('debito-quitar'),
  });
}
