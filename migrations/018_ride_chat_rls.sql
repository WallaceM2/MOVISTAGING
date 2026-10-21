-- Chat data is served only by the authenticated MOVI API. Supabase client roles
-- must not read or write ride messages directly.
ALTER TABLE movi_chat_corrida_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE movi_chat_corrida_mensagens FROM anon, authenticated;
REVOKE ALL ON SEQUENCE movi_chat_corrida_mensagens_id_seq FROM anon, authenticated;
