CREATE TABLE IF NOT EXISTS movi_suporte_chamados (
  id BIGSERIAL PRIMARY KEY,
  solicitante_tipo VARCHAR(20) NOT NULL CHECK (solicitante_tipo IN ('passageiro', 'motorista')),
  solicitante_id INTEGER NOT NULL CHECK (solicitante_id > 0),
  corrida_id INTEGER REFERENCES corridas(id) ON DELETE SET NULL,
  categoria VARCHAR(30) NOT NULL CHECK (categoria IN ('corrida', 'pagamento', 'conta', 'seguranca', 'outro')),
  assunto VARCHAR(160) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_atendimento', 'aguardando_usuario', 'resolvido', 'fechado')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'alta', 'critica')),
  resposta_prevista_min_em TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  resposta_prevista_max_em TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
  primeira_resposta_em TIMESTAMPTZ,
  resolvido_em TIMESTAMPTZ,
  fechado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resposta_prevista_max_em >= resposta_prevista_min_em)
);

CREATE TABLE IF NOT EXISTS movi_suporte_mensagens (
  id BIGSERIAL PRIMARY KEY,
  chamado_id BIGINT NOT NULL REFERENCES movi_suporte_chamados(id) ON DELETE CASCADE,
  autor_tipo VARCHAR(20) NOT NULL CHECK (autor_tipo IN ('passageiro', 'motorista', 'admin', 'bot')),
  autor_id INTEGER,
  mensagem TEXT NOT NULL CHECK (char_length(trim(mensagem)) BETWEEN 1 AND 4000),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((autor_tipo = 'bot' AND autor_id IS NULL) OR (autor_tipo <> 'bot' AND autor_id IS NOT NULL AND autor_id > 0))
);

CREATE INDEX IF NOT EXISTS idx_movi_suporte_chamados_solicitante
  ON movi_suporte_chamados (solicitante_tipo, solicitante_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_movi_suporte_chamados_fila
  ON movi_suporte_chamados (prioridade, criado_em ASC)
  WHERE status IN ('aberto', 'em_atendimento', 'aguardando_usuario');

CREATE INDEX IF NOT EXISTS idx_movi_suporte_chamados_sla
  ON movi_suporte_chamados (resposta_prevista_max_em ASC)
  WHERE primeira_resposta_em IS NULL AND status NOT IN ('resolvido', 'fechado');

CREATE INDEX IF NOT EXISTS idx_movi_suporte_mensagens_chamado
  ON movi_suporte_mensagens (chamado_id, criado_em ASC, id ASC);
