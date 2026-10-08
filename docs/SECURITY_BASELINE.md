# MOVI — baseline de segurança

- JWT HS256 com algoritmo fixado, issuer/audience e tolerância de relógio pequena.
- Access token curto por padrão e refresh token rotacionado com família/reuso detectável.
- Rate limiting de autenticação com comportamento fail-closed quando Redis é necessário.
- CORS por allowlist explícita e `x-powered-by` desabilitado.
- Helmet, limites HTTP/JSON, timeouts e `maxHttpBufferSize` do Socket.IO.
- Socket.IO autenticado e limitado por evento sensível.
- GEO de motorista separado por categoria, com reconstrução defensiva a partir do banco.
- Idempotência em operações mutáveis críticas.
- Upload com limite, allowlist de MIME, validação de assinatura e limpeza de arquivos órfãos.
- Storage privado por padrão.
- Snapshot financeiro validado no backend e ledger por corrida com referências únicas.
- Consistência de sessão, aprovação documental e estados críticos reforçada no banco por migrações.
- Logs de erro sem impressão de secrets, tokens ou query strings.

A base reduz classes conhecidas de falha, mas não torna software invulnerável. Produção ainda exige gestão de secrets, rotação de chaves, backup/restauração testados, monitoramento, dependências atualizadas, pentest e revisão jurídica/compliance.
