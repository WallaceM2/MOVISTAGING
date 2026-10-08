-- Movi canonical base schema.
-- Safe for a fresh Supabase database. Existing tables are preserved by CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(320) NOT NULL,
  senha_hash TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ativo',
  ultimo_login_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passageiros (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  sobrenome VARCHAR(120),
  email VARCHAR(320) NOT NULL,
  telefone VARCHAR(30),
  senha_hash TEXT NOT NULL,
  data_nascimento DATE,
  nacionalidade VARCHAR(80),
  cpf VARCHAR(11),
  rg VARCHAR(30),
  cnh VARCHAR(30),
  regiao VARCHAR(120),
  estado CHAR(2),
  cidade VARCHAR(120),
  status_conta VARCHAR(30) NOT NULL DEFAULT 'ativa',
  conta_verificada BOOLEAN NOT NULL DEFAULT FALSE,
  foto_perfil_url TEXT,
  rg_foto_url TEXT,
  cnh_foto_url TEXT,
  nota_media NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_avaliacoes INTEGER NOT NULL DEFAULT 0,
  debito_pendente NUMERIC(12,2) NOT NULL DEFAULT 0,
  ultimo_login_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS motoristas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  sobrenome VARCHAR(120),
  email VARCHAR(320) NOT NULL,
  telefone VARCHAR(30),
  senha_hash TEXT NOT NULL,
  data_nascimento DATE,
  nacionalidade VARCHAR(80),
  cpf VARCHAR(11),
  rg VARCHAR(30),
  cnh VARCHAR(30),
  regiao VARCHAR(120),
  estado CHAR(2),
  cidade VARCHAR(120),
  categoria VARCHAR(20),
  status_cadastro VARCHAR(30) NOT NULL DEFAULT 'em_analise',
  status_conta VARCHAR(30) NOT NULL DEFAULT 'ativa',
  ear_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
  antecedentes_verificados BOOLEAN NOT NULL DEFAULT FALSE,
  documento_veiculo_url TEXT,
  documento_veiculo_tipo VARCHAR(50),
  foto_perfil_url TEXT,
  rg_foto_url TEXT,
  cnh_foto_url TEXT,
  nota_media NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_avaliacoes INTEGER NOT NULL DEFAULT 0,
  saldo_carteira NUMERIC(12,2) NOT NULL DEFAULT 0,
  bloqueado_dinheiro BOOLEAN NOT NULL DEFAULT FALSE,
  online BOOLEAN NOT NULL DEFAULT FALSE,
  disponivel BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_lat NUMERIC(10,7),
  ultima_lng NUMERIC(10,7),
  ultima_localizacao_em TIMESTAMPTZ,
  ultimo_login_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corridas (
  id SERIAL PRIMARY KEY,
  passageiro_id INTEGER NOT NULL,
  motorista_id INTEGER,
  categoria VARCHAR(20),
  origem VARCHAR(300) NOT NULL,
  destino VARCHAR(300) NOT NULL,
  origem_lat NUMERIC(10,7) NOT NULL,
  origem_lng NUMERIC(10,7) NOT NULL,
  destino_lat NUMERIC(10,7) NOT NULL,
  destino_lng NUMERIC(10,7) NOT NULL,
  distancia_km NUMERIC(10,3),
  tempo_minutos INTEGER,
  dinamica_multiplicador NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  valor NUMERIC(12,2) NOT NULL,
  ganho_motorista NUMERIC(12,2) NOT NULL,
  ganho_app NUMERIC(12,2) NOT NULL,
  percentual_comissao_app NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  percentual_repasse_motorista NUMERIC(5,2) NOT NULL DEFAULT 85.00,
  forma_pagamento VARCHAR(30) NOT NULL DEFAULT 'dinheiro',
  status_pagamento VARCHAR(30) NOT NULL DEFAULT 'pendente',
  valor_recebido_motorista NUMERIC(12,2),
  observacao_pagamento VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'solicitada',
  cancelada_por_tipo VARCHAR(30),
  cancelada_por_id INTEGER,
  motivo_cancelamento VARCHAR(300),
  solicitada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aceita_em TIMESTAMPTZ,
  iniciada_em TIMESTAMPTZ,
  finalizada_em TIMESTAMPTZ,
  cancelada_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id SERIAL PRIMARY KEY,
  corrida_id INTEGER,
  avaliado_tipo VARCHAR(30) NOT NULL,
  avaliado_id INTEGER NOT NULL,
  avaliador_tipo VARCHAR(30) NOT NULL,
  avaliador_id INTEGER NOT NULL,
  nota NUMERIC(2,1) NOT NULL,
  tag VARCHAR(80),
  comentario VARCHAR(1000),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS denuncias (
  id SERIAL PRIMARY KEY,
  corrida_id INTEGER,
  denunciante_tipo VARCHAR(30) NOT NULL,
  denunciante_id INTEGER NOT NULL,
  denunciado_id INTEGER,
  motivo VARCHAR(80) NOT NULL,
  descricao VARCHAR(2000),
  status VARCHAR(30) NOT NULL DEFAULT 'em_analise',
  analisada_em TIMESTAMPTZ,
  analisada_por INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacoes_motoristas (
  id BIGSERIAL PRIMARY KEY,
  motorista_id INTEGER NOT NULL,
  corrida_id INTEGER,
  tipo VARCHAR(50) NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  saldo_anterior NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_atual NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia_externa VARCHAR(200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ocorrencias_pagamento (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL,
  motorista_id INTEGER,
  passageiro_id INTEGER NOT NULL,
  valor_devido NUMERIC(12,2) NOT NULL,
  valor_recebido NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferenca_debito NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'aberta',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS corrida_ofertas (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL,
  motorista_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ofertada',
  distancia_km NUMERIC(10,3),
  oferecida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  respondida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corrida_id, motorista_id)
);

CREATE TABLE IF NOT EXISTS movi_schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum CHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
