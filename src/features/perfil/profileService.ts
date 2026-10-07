import { apiFetch } from '@/api/http';
import type { ExtratoResponse, Passenger } from '@/types/api';

export async function getProfile() { return apiFetch<{ passageiro: Passenger }>('/api/passageiros/perfil'); }
export async function getExtrato(limit = 20, offset = 0) { return apiFetch<ExtratoResponse>(`/api/extrato?limit=${limit}&offset=${offset}`); }
