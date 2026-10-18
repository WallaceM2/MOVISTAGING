import { create } from "zustand";

export type Driver = {
  id: number;
  nome?: string;
  sobrenome?: string;
  email?: string;
  status_conta?: string;
  status_cadastro?: string;
  categoria?: "moto" | "carro";
  telefone?: string;
  categoria_cnh?: string;
  rg_foto_url?: string | null;
  cnh_foto_url?: string | null;
  documento_veiculo_url?: string | null;
  foto_perfil_url?: string | null;
  ultima_lat?: number | null;
  ultima_lng?: number | null;
  nota_media?: number | null;
  total_avaliacoes?: number | null;
  criado_em?: string;
  desempenho?: {
    limite_amostra: number;
    aceitas: number;
    ofertas_consideradas: number;
    taxa_aceitacao_pct: number | string | null;
    concluidas: number;
    corridas_consideradas: number;
    taxa_finalizacao_pct: number | string | null;
    calculado_em: string;
  };
  saldo_carteira?: number | null;
  bloqueado_dinheiro?: boolean;
  veiculo?: { id: number; categoria: "moto" | "carro"; placa: string; marca?: string | null; modelo?: string | null; cor?: string | null; ano_modelo?: number | null; status: string } | null;
};

type State = {
  accessToken: string | null;
  motorista: Driver | null;
  hydrated: boolean;

  setSession: (
    accessToken: string,
    motorista?: Driver | null
  ) => void;

  clearSession: () => void;

  setHydrated: (value: boolean) => void;
  setDriver: (motorista: Driver) => void;
};

export const useAuthStore = create<State>((set) => ({
  accessToken: null,
  motorista: null,
  hydrated: false,

  setSession: (accessToken, motorista) =>
    set((state) => ({ accessToken, motorista: motorista === undefined ? state.motorista : motorista })),

  clearSession: () =>
    set({
      accessToken: null,
      motorista: null,
    }),

  setHydrated: (value) =>
    set({
      hydrated: value,
    }),

  setDriver: (motorista) => set({ motorista }),
}));
