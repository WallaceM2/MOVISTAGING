import { beforeEach, describe, expect, it } from '@jest/globals';
import { useAuthStore } from '@/store/authStore';

describe('sessão em memória', () => {
  beforeEach(() => useAuthStore.getState().clearSession());

  it('mantém access token somente no store de memória e limpa a sessão', () => {
    useAuthStore.getState().setSession('access-token', { id: 9, nome: 'Wallace', sobrenome: 'Teste', email: 'teste@example.com', status_conta: 'ativa' });
    expect(useAuthStore.getState().accessToken).toBe('access-token');
    expect(useAuthStore.getState().passenger?.id).toBe(9);
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().passenger).toBeNull();
  });
});
