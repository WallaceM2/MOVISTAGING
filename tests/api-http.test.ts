import {afterEach, beforeEach, describe, expect, it, jest,} from '@jest/globals';
import { apiFetch } from '@/api/http';
import { tokenStore } from '@/auth/tokenStore';
import { useAuthStore } from '@/store/authStore';

type MockResponseBody = Record<string, unknown>;

function mockResponse(
  body: MockResponseBody,
  ok: boolean,
  status: number,
): Response {
  const serialized = JSON.stringify(body);

  return {
    ok,
    status,
    text: async () => serialized,
    json: async () => body,
  } as Response;
}

describe('cliente HTTP do MOVI', () => {
  const fetchMock = jest.fn(
  async (..._args: Parameters<typeof fetch>): Promise<Response> =>
    mockResponse({ ok: true }, true, 200),
);

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    useAuthStore.getState().clearSession();
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true }, true, 200),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envia Bearer, Request-Id e Idempotency-Key', async () => {
    useAuthStore.getState().setSession('access-123');

    await apiFetch('/api/corridas/solicitar', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
      idempotencyKey: 'corrida-test-20260925-0001',
    });

    const firstCall = fetchMock.mock.calls[0];
    const init = firstCall?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    const headers = init?.headers as Headers;

    expect(headers.get('Authorization')).toBe('Bearer access-123');
    expect(headers.get('Idempotency-Key')).toBe(
      'corrida-test-20260925-0001',
    );
    expect(headers.get('X-Request-Id')).toMatch(/^movi-/);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('renova a sessão uma vez e repete a requisição depois de 401', async () => {
    jest
      .spyOn(tokenStore, 'getRefreshToken')
      .mockResolvedValue('refresh-token-123456789012345');

    jest
      .spyOn(tokenStore, 'setRefreshToken')
      .mockResolvedValue(undefined);

    useAuthStore.getState().setSession('old-token');

    fetchMock
      .mockResolvedValueOnce(
        mockResponse(
          { erro: 'token expirado' },
          false,
          401,
        ),
      )
      .mockResolvedValueOnce(
        mockResponse(
          {
            token: 'new-token',
            refresh_token: 'new-refresh-token-123456789012345',
          },
          true,
          200,
        ),
      )
      .mockResolvedValueOnce(
        mockResponse(
          { result: 'ok' },
          true,
          200,
        ),
      );

    const result = await apiFetch<{ result: string }>(
      '/api/passageiros/perfil',
    );

    expect(result.result).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().accessToken).toBe('new-token');
  });
});