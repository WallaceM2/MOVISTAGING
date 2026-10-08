import type { RideStatus } from '@/types/api';

export function rideStatusCopy(status: RideStatus) {
  const copy: Record<RideStatus, { title: string; description: string }> = {
    solicitada: { title: 'Procurando motorista', description: 'Estamos procurando um parceiro disponível perto da sua origem.' },
    aceita: { title: 'Motorista a caminho', description: 'Sua corrida foi aceita e o motorista está a caminho.' },
    em_andamento: { title: 'Corrida em andamento', description: 'Você está a caminho do destino.' },
    concluida: { title: 'Corrida finalizada', description: 'Você chegou ao destino.' },
    cancelada: { title: 'Corrida cancelada', description: 'Esta corrida foi cancelada.' },
    expirada: { title: 'Solicitação expirada', description: 'Não encontramos um motorista dentro do tempo disponível.' },
  };
  return copy[status];
}

export function canCancelRide(status: RideStatus): boolean {
  return status === 'solicitada' || status === 'aceita';
}

export function isTerminalRide(status: RideStatus): boolean {
  return status === 'concluida' || status === 'cancelada' || status === 'expirada';
}
