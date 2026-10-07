export type Passenger = {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
  rg?: string | null;
  cnh?: string | null;
  rg_foto_url?: string | null;
  cnh_foto_url?: string | null;
  status_conta: string;
  conta_verificada?: boolean;
  foto_perfil_url?: string | null;
  nota_media?: number | null;
  total_avaliacoes?: number;
  debito_pendente?: number | string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type AuthResponse = {
  token: string;
  refresh_token: string;
  passageiro: Pick<Passenger, 'id' | 'nome' | 'sobrenome' | 'email' | 'status_conta'>;
};

export type RegistrationInput = {
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  senha: string;
  data_nascimento: string;
  nacionalidade?: string;
  cpf: string;
  rg?: string;
  cnh?: string;
  regiao?: string;
  estado: string;
  cidade?: string;
  aceita_termos: true;
};

export type Coordinates = { lat: number; lng: number };
export type RideCategory = 'moto' | 'carro';
export type PaymentMethod = 'dinheiro' | 'cartao' | 'pix';
export type RideStatus = 'solicitada' | 'aceita' | 'em_andamento' | 'concluida' | 'cancelada' | 'expirada';

export type Estimate = {
  tarifaId: number;
  tarifaVersao: number;
  tarifaSnapshot: Record<string, unknown>;
  distanciaKm: number;
  tempoMin: number;
  dinamicaAplicada: string;
  multiplicadorDinamica: number;
  tarifaMinimaAplicada: boolean;
  pisoLiquidoAplicado: boolean;
  valorBaseCliente: number;
  valorDinamicaCliente: number;
  valorPassageiro: number;
  ganhoMotorista: number;
  ganhoApp: number;
  percentualComissaoApp: number;
  percentualRepasseMotorista: number;
  pisoLiquidoMotoristaKm: number;
  pisoLiquidoMotoristaMetaKm: number;
  geometria?: { type: 'LineString'; coordinates: [number, number][] };
  enderecoOrigem?: string;
  enderecoDestino?: string;
};

export type Ride = {
  id: number;
  passageiro_id: number;
  motorista_id?: number | null;
  origem: string;
  destino: string;
  origem_lat: number | string;
  origem_lng: number | string;
  destino_lat: number | string;
  destino_lng: number | string;
  categoria: RideCategory;
  distancia_km: number | string;
  tempo_minutos: number | string;
  dinamica_multiplicador?: number | string;
  valor: number | string;
  ganho_motorista?: number | string;
  ganho_app?: number | string;
  forma_pagamento: PaymentMethod;
  status: RideStatus;
  status_pagamento: string;
  codigo_embarque?: string;
  motorista?: {
    id: number;
    nome: string;
    sobrenome?: string;
    categoria?: RideCategory;
    nota_media?: number | string | null;
    total_avaliacoes?: number | null;
    marca?: string | null;
    modelo?: string | null;
    cor?: string | null;
    placa?: string | null;
  } | null;
  solicitado_em?: string;
  criado_em?: string;
  aceita_em?: string;
  iniciada_em?: string;
  finalizada_em?: string;
  cancelada_em?: string;
  atualizado_em?: string;
};

export type LegalDocument = {
  documentoTipo: 'termos_uso' | 'aviso_privacidade' | 'seguranca_confianca';
  versao: string;
  sha256?: string;
  conteudoHash?: string;
  titulo?: string;
  conteudo?: string;
  obrigatorio?: boolean;
};

export type LegalPublicResponse = { usuario_tipo: 'passageiro'; documentos: LegalDocument[] };
export type LegalDocumentsResponse = { documentos: LegalDocument[] };

export type ExtratoResponse = {
  saldo_total: string | null;
  total_viagens: number;
  corridas_concluidas: number;
  valor_total_corridas: string;
  historico: Array<Pick<Ride, 'id' | 'origem' | 'destino' | 'valor' | 'forma_pagamento' | 'status' | 'status_pagamento' | 'criado_em' | 'finalizada_em'>>;
  pagina: { limit: number; offset: number };
};

export type EvaluationInput = { corrida_id: number; avaliado_tipo: 'motorista' | 'passageiro'; avaliado_id: number; nota: number; tag?: string; comentario?: string };
export type ReportInput = { corrida_id: number; denunciado_id: number; motivo: 'direcao_perigosa' | 'assedio' | 'agressao' | 'roubo' | 'fraude' | 'outro'; descricao?: string };

export type ApiErrorShape = {erro?: string;mensagem?: string;codigo?: string;request_id?: string;detalhes?: Array<{campo?: string;mensagem?: string;}>;};

export type SocketEventPayload = {
  corrida_solicitada: { corrida_id: number; status: RideStatus; oferta_enviada: boolean };
  corrida_aceita: Ride;
  corrida_iniciada: Ride;
  corrida_finalizada: { mensagem: string; corrida: Ride; financeiro?: Record<string, unknown> };
  corrida_cancelada: { corrida_id: number; corrida: Ride };
  motorista_em_movimento: { corrida_id: number; lat: number; lng: number; direcao: number };
};
