# Deploy do MOVI — Render + Supabase

## 1. Supabase PostgreSQL

Use uma conexão de banco compatível com o runtime da Render. Para ambientes Render sem conectividade IPv6, prefira o Session Pooler IPv4 do Supabase.

Configure na Render:

```text
DATABASE_URL=<session-pooler-ou-conexao-apropriada>
MIGRATIONS_DATABASE_URL=<conexao-apropriada-para-ddl>
```

Depois do primeiro deploy, confirme em `movi_schema_migrations` que a migration foi aplicada.

## 2. Supabase Storage

Crie o bucket privado:

```text
movi-private
```

Nunca publique esse bucket. O backend usa a Service Role Key somente no servidor e gera URLs assinadas de curta duração.

## 3. Redis

Use um Redis gerenciado e configure:

```text
REDIS_URL=rediss://...
```

Quando o provedor fornecer TLS, use `rediss://`.

## 4. Render Web Service

O `render.yaml` cria `movi-api` com:

```text
Build:      npm ci
Pre-deploy: npm run migrate
Start:      npm start
Health:     /health/ready
```

## 5. Render Background Worker

O `render.yaml` também cria `movi-worker`:

```text
Build: npm ci
Start: npm run worker
```

O worker trata expiração/redispatch de ofertas e manutenção de tokens/idempotência.

## 6. Variáveis obrigatórias do Web Service

```text
NODE_ENV=production
SERVICE_KIND=web
NODE_VERSION=24.21.0
DATABASE_URL=...
MIGRATIONS_DATABASE_URL=...
REDIS_URL=...
JWT_SECRET=<segredo-aleatorio-com-32+-caracteres>
MAPBOX_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=movi-private
CORS_ORIGINS=<origens-web-se-existirem>
PAYMENT_PROVIDER=none
```

## 7. Variáveis obrigatórias do Worker

```text
NODE_ENV=production
SERVICE_KIND=worker
NODE_VERSION=24.21.0
DATABASE_URL=...
REDIS_URL=...
RUN_OFFER_WORKER=true
```

## 8. Pagamentos

O código entregue bloqueia Pix/cartão quando `PAYMENT_PROVIDER=none` e não considera pagamento digital como confirmado sem a confirmação do provedor.

Antes de habilitar pagamentos digitais, implemente:

```text
criação server-side da cobrança
→ webhook autenticado/assinado
→ evento externo idempotente
→ atualização transacional
→ conciliação
```

## 9. Homologação obrigatória

Teste com pelo menos dois motoristas e dois passageiros:

- duas tentativas simultâneas de aceitar a mesma corrida;
- motorista recusando oferta;
- oferta expirando;
- motorista reconectando e recuperando oferta;
- nenhum motorista disponível;
- motorista ficando offline no meio da busca;
- cancelamento por passageiro e por motorista;
- finalização duplicada;
- pagamento em dinheiro pago/parcial/não pago;
- tentativa de alterar corrida de outro usuário;
- avaliação de corrida não participante;
- acesso a documento de outro usuário;
- refresh token concorrente;
- suspensão/banimento administrativo;
- falha do Redis;
- falha do Mapbox;
- teste de carga antes do lançamento público.
