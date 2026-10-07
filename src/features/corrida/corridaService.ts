import { apiFetch } from '@/api/http';
import { createIdempotencyKey } from '@/utils/idempotency';
import type { Estimate, PaymentMethod, Ride, RideCategory } from '@/types/api';

export type RideRequest = {
  origem: string;
  destino: string;
  origem_lat: number;
  origem_lng: number;
  destino_lat: number;
  destino_lng: number;
  categoria: RideCategory;
  forma_pagamento: PaymentMethod;
};

export async function estimateRide(body: RideRequest) {
  const response = await apiFetch<{ mensagem: string; estimativa: Estimate }>('/api/corridas/estimar', { method: 'POST', body: JSON.stringify(body) });
  return response.estimativa;
}

export async function requestRide(body: RideRequest) {
  const key = createIdempotencyKey('corrida-solicitar');
  return apiFetch<{ mensagem: string; corrida: Ride; detalhes_valores: Estimate; motoristas_encontrados: number; oferta_enviada: boolean }>('/api/corridas/solicitar', { method: 'POST', body: JSON.stringify(body), idempotencyKey: key });
}

export function getRide(id: number) { return apiFetch<Ride>(`/api/corridas/${id}`); }

export function cancelRide(id: number) {
  return apiFetch<{ mensagem: string; corrida: Ride }>(`/api/corridas/${id}/cancelar`, {
    method: 'POST',
    idempotencyKey: createIdempotencyKey('corrida-cancelar'),
  });
}

export function createRideShare(id: number) {
  return apiFetch<{ url: string; expira_em: string }>(`/api/corridas/${id}/compartilhamento`, {
    method: 'POST',
    idempotencyKey: `ride-${id}-share-${Date.now().toString(36)}`,
  });
}

export function revokeRideShare(id: number) {
  return apiFetch<{ sucesso: boolean }>(`/api/corridas/${id}/compartilhamento`, { method: 'DELETE' });
}
