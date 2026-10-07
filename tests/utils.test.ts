import { describe, expect, it } from '@jest/globals';

import { brl, km, minutes } from '@/utils/format';
import { createIdempotencyKey } from '@/utils/idempotency';
import {canCancelRide,isTerminalRide,rideStatusCopy,} from '@/features/corrida/rideState';

describe('utils do MOVI Passageiro', () => {
  it('formata BRL, distância e duração', () => {
    expect(brl(5.5)).toContain('5,50');
    expect(km(1.77)).toBe('1,77 km');
    expect(minutes(6.4)).toBe('6 min');
  });

  it('gera chave de idempotência suficientemente longa e segura para header', () => {
    const key = createIdempotencyKey('corrida solicitar');
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('aplica máquina visual de estados da corrida', () => {
    expect(canCancelRide('solicitada')).toBe(true);
    expect(canCancelRide('aceita')).toBe(true);
    expect(canCancelRide('em_andamento')).toBe(false);
    expect(isTerminalRide('concluida')).toBe(true);
    expect(isTerminalRide('cancelada')).toBe(true);
    expect(rideStatusCopy('aceita').title).toBe('Motorista a caminho');
  });
});
