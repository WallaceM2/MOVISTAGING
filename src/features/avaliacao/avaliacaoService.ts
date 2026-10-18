import { apiFetch } from "@/api/http";

export type DriverRating = {
  id: number;
  corrida_id: number | null;
  nota: number | string;
  tags: string[];
  criado_em: string;
};

export function listDriverRatings(driverId: number, limit = 100) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return apiFetch<DriverRating[]>(`/api/avaliacoes/motorista/${driverId}?limit=${safeLimit}`);
}
