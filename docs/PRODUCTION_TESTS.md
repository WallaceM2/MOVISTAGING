# MOVI — bateria automatizada de produção

## Validação local

- `npm ci`
- `npm test`
- `npm run check`
- `npm run security:check`
- `npm run test:all`

## Smoke HTTP sem dependências externas

A suíte `tests/http.smoke.test.js` valida `/health/live`, `404`, `X-Request-Id` e bloqueio de origem CORS não autorizada.

## Matching

A suíte de unidade cobre GEO por categoria e também a reconstrução do índice GEO a partir de PostgreSQL quando Redis perde o índice.

## Limites desta suíte

Testes contra Supabase/PostgreSQL/Redis Cloud e Mapbox exigem credenciais/rede disponíveis no ambiente de execução. A suíte não substitui teste de carga, pentest externo, revisão legal ou certificação de segurança.
