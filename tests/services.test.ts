import {beforeEach,describe,expect,it,jest,} from '@jest/globals';

jest.mock('@/api/http', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/api/http';
import {
  estimateRide,
  requestRide,
} from '@/features/corrida/corridaService';

const apiFetchMock =
  apiFetch as jest.MockedFunction<typeof apiFetch>;

const ride = {
  origem: 'Centro de Caruaru',
  destino: 'Maurício de Nassau, Caruaru',
  origem_lat: -8.28,
  origem_lng: -35.97,
  destino_lat: -8.285,
  destino_lng: -35.965,
  categoria: 'moto' as const,
  forma_pagamento: 'dinheiro' as const,
};

describe('integração de domínio de corrida', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('usa o endpoint de estimativa V3 e devolve somente a estimativa oficial', async () => {
    apiFetchMock.mockResolvedValueOnce({
      estimativa: {
        valorPassageiro: 8.25,
        distanciaKm: 1.77,
        tempoMin: 6,
      },
    } as never);

    const result = await estimateRide(ride);
    expect(result.valorPassageiro).toBe(8.25);
    const firstCall = apiFetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe('/api/corridas/estimar');
  });

  it('solicita corrida com Idempotency-Key e preserva o contrato do V3', async () => {
    apiFetchMock.mockResolvedValueOnce({
      corrida: {
        id: 7,
      },
      motoristas_encontrados: 1,
      oferta_enviada: true,
    } as never);

    const result = await requestRide(ride);
    expect(result.corrida.id).toBe(7);
    const firstCall = apiFetchMock.mock.calls[0];
    const options = firstCall?.[1];

    expect(options?.method).toBe('POST');
    expect(options?.idempotencyKey).toBeTruthy();
    expect(
      (options?.idempotencyKey ?? '').length,
    ).toBeGreaterThanOrEqual(16);

    expect(firstCall?.[0]).toBe('/api/corridas/solicitar');
  });
});