CREATE TABLE IF NOT EXISTS movi_chat_corrida_mensagens (
  id BIGSERIAL PRIMARY KEY,
  corrida_id INTEGER NOT NULL REFERENCES corridas(id) ON DELETE CASCADE,
  remetente_tipo VARCHAR(20) NOT NULL CHECK (remetente_tipo IN ('passageiro', 'motorista')),
  remetente_id INTEGER NOT NULL CHECK (remetente_id > 0),
  client_message_id VARCHAR(100) NOT NULL CHECK (char_length(client_message_id) BETWEEN 16 AND 100),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('texto', 'imagem', 'audio')),
  mensagem TEXT CHECK (mensagem IS NULL OR char_length(mensagem) <= 1000),
  midia_storage_path TEXT,
  midia_mime_type VARCHAR(80),
  midia_tamanho_bytes INTEGER CHECK (midia_tamanho_bytes IS NULL OR midia_tamanho_bytes BETWEEN 1 AND 8388608),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (corrida_id, remetente_tipo, remetente_id, client_message_id),
  CHECK (
    (tipo = 'texto' AND mensagem IS NOT NULL AND char_length(trim(mensagem)) BETWEEN 1 AND 1000 AND midia_storage_path IS NULL AND midia_mime_type IS NULL AND midia_tamanho_bytes IS NULL)
    OR
    (tipo = 'imagem' AND midia_storage_path IS NOT NULL AND midia_mime_type IN ('image/jpeg', 'image/png') AND midia_tamanho_bytes IS NOT NULL)
    OR
    (tipo = 'audio' AND midia_storage_path IS NOT NULL AND midia_mime_type = 'audio/mp4' AND midia_tamanho_bytes IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_movi_chat_corrida_created
  ON movi_chat_corrida_mensagens (corrida_id, criado_em DESC, id DESC);
