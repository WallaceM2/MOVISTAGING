import {beforeEach,describe,expect,it,jest,} from '@jest/globals';
import { apiFetch } from '@/api/http';
import {
  estimateRide,
  requestRide,
} from '@/features/corrida/corridaService';
import { contestCancellationFee, getCashDebts, respondToCashDebt } from '@/features/perfil/debtService';

jest.mock('@/api/http', () => ({
  apiFetch: jest.fn(),
}));

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
        cotacao_token: 'signed-quote-test-token',
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

    const result = await requestRide({ ...ride, cotacao_token: 'signed-quote-test-token' });
    expect(result.corrida.id).toBe(7);
    const firstCall = apiFetchMock.mock.calls[0];
    const options = firstCall?.[1];

    expect(options?.method).toBe('POST');
    expect(options?.idempotencyKey).toBeTruthy();
    expect(
      (options?.idempotencyKey ?? '').length,
    ).toBeGreaterThanOrEqual(16);

    expect(firstCall?.[0]).toBe('/api/corridas/solicitar');
    expect(JSON.parse(String(options?.body)).cotacao_token).toBe('signed-quote-test-token');
  });
});

describe('integração de consulta e resposta de débito', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('consulta débitos por corrida no V3', async () => {
    apiFetchMock.mockResolvedValueOnce({ debitos: [], taxas_cancelamento: [], total_pendente: 0 } as never);
    await expect(getCashDebts()).resolves.toEqual({ debitos: [], taxas_cancelamento: [], total_pendente: 0 });
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe('/api/passageiros/debitos');
  });

  it('envia contestação com relato e chave de idempotência', async () => {
    apiFetchMock.mockResolvedValueOnce({ mensagem: 'Resposta registrada.', corrida_id: 73, resposta_passageiro: 'contestada', suporte_chamado_id: 501 } as never);
    await respondToCashDebt(73, { decisao: 'contestar', descricao: 'Discordo do valor; paguei a diferença por Pix ao motorista.' });
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/passageiros/debitos/73/resposta');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ decisao: 'contestar', descricao: 'Discordo do valor; paguei a diferença por Pix ao motorista.' });
    expect(options?.idempotencyKey).toMatch(/^debito-73-contestar-/);
  });

  it('contesta uma taxa de cancelamento pelo contrato V3 com idempotência', async () => {
    apiFetchMock.mockResolvedValueOnce({ mensagem: 'Contestação encaminhada.', corrida_id: 73, status: 'contestada', suporte_chamado_id: 502, debito_preservado: true } as never);
    await contestCancellationFee(73, 'Discordo da taxa porque o aceite ocorreu depois do horário informado.');
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/passageiros/taxas-cancelamento/73/contestar');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ descricao: 'Discordo da taxa porque o aceite ocorreu depois do horário informado.' });
    expect(options?.idempotencyKey).toMatch(/^taxa-cancelamento-73-contestar-/);
  });
});
