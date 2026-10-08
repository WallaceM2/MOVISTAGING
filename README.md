# MOVI Backend

Backend da plataforma MOVI, preparado para execução em ambiente gerenciado (Render + Supabase + Redis) e para evolução do aplicativo móvel.

## Arquitetura

- Node.js + Express 5
- PostgreSQL (Supabase) com pool de conexões
- Redis para presença, geolocalização, rate limiting e eventos distribuídos
- Socket.IO para realtime
- Supabase Storage para documentos privados
- Mapbox Directions para cálculo de rota e estimativa
- JWT de acesso curto (15 min por padrão) + refresh token rotativo
- Migrations versionadas
- Worker separado para despacho/expiração de ofertas
- Auditoria e idempotência para operações críticas

## Estrutura

```text
src/
  config/
  controllers/
  errors/
  jobs/
  middlewares/
  models/
  routes/
  services/
  utils/
  validators/
  server.js
  worker.js
migrations/
scripts/
tests/
docs/
```

## Desenvolvimento local

```bash
npm ci
cp .env.example .env
npm run migrate
npm test
npm run check
npm run dev
```

Para desenvolvimento, tenha um PostgreSQL e um Redis disponíveis e preencha o `.env`.

## Deploy na Render

O `render.yaml` define dois serviços:

1. `movi-api`: serviço HTTP/WebSocket.
2. `movi-worker`: worker de despacho e manutenção.

Comandos do serviço HTTP:

```text
Build:      npm ci
Pre-deploy: npm run migrate
Start:      npm start
Health:     /health/ready
```

Comando do worker:

```text
Start: npm run worker
```

Não coloque credenciais diretamente no repositório. Configure os valores secretos nos Environment Variables da Render.

## Supabase PostgreSQL

Defina `DATABASE_URL` com uma conexão apropriada ao ambiente da Render e `MIGRATIONS_DATABASE_URL` para executar migrations.

Como a Render possui limitações de conectividade IPv4, a conexão compartilhada do Supabase em Session Mode é a alternativa quando a conexão direta IPv6 não estiver disponível. Não use o Transaction Pooler para este backend, porque a aplicação usa recursos de sessão/consultas transacionais que são mais adequados ao Session Mode.

## Redis

`REDIS_URL` é obrigatório em produção. Pode apontar para um Redis gerenciado compatível com Redis URL, usando `rediss://` quando TLS for exigido pelo provedor.

O Redis é usado para:

- presença online/offline;
- disponibilidade de motoristas;
- busca geográfica;
- demanda para dinâmica;
- rate limiting distribuído;
- publicação de eventos realtime entre instâncias.

## Supabase Storage

Crie um bucket privado chamado `movi-private` (ou altere `SUPABASE_STORAGE_BUCKET`).

O backend usa a Service Role Key somente no servidor para:

- enviar documentos;
- gerar URLs temporárias assinadas;
- excluir arquivos antigos substituídos.

A Service Role Key nunca deve ser colocada no aplicativo móvel.

## Variáveis de ambiente essenciais

Veja `.env.example`.

Produção Web exige:

```text
NODE_ENV=production
SERVICE_KIND=web
DATABASE_URL=...
MIGRATIONS_DATABASE_URL=...
REDIS_URL=...
JWT_SECRET=...
MAPBOX_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGINS=...
```

Produção Worker exige apenas as variáveis utilizadas pelo processo do worker, principalmente `DATABASE_URL`, `REDIS_URL`, `NODE_ENV` e `SERVICE_KIND=worker`.

## Banco de dados

O modelo canônico está em `migrations/000_initial_schema.sql` até `migrations/008_push_and_trip_sharing.sql`. Depois de aplicar as migrations, rode `npm run db:check` para conferir a estrutura e as regras financeiras/operacionais. Consulte `docs/DB_DICIONARIO.md` e `docs/DB_MIGRATION.md`.

## Operações críticas protegidas

- autenticação JWT e autorização por tipo de usuário;
- conta suspensa/banida bloqueada em operações sensíveis;
- Socket.IO autenticado;
- transições de corrida controladas por estado;
- aceitação de corrida vinculada ao motorista ofertado;
- uma única oferta ativa por corrida;
- timeout e redispatch de ofertas;
- idempotência para mutações críticas, incluindo solicitação, aceitação, início, finalização, cancelamento, denúncias, aceite legal e troca/logout de sessão;
- rotação atômica de refresh token;
- documentos privados;
- auditoria administrativa;
- bloqueio de corrida em dinheiro para motorista com saldo operacional insuficiente.

## Preço e repasse

A configuração inicial aplica 15% de comissão do Movi e 85% de repasse econômico ao motorista/motoqueiro. O piso líquido configurado é R$ 1,00/km para moto e R$ 1,50/km para carro, com meta de R$ 2,00/km para carro. Como a comissão é 15%, o valor bruto por km precisa ser superior ao piso líquido. A fonte de verdade é a tabela `movi_tarifas`, não o frontend.

Consulte `docs/REGRAS_DE_PRECO.md` e `docs/DESPACHO_CARRO_MOTO.md`.

## Pagamentos

`PAYMENT_PROVIDER=none` mantém o ambiente em modo sem pagamento digital real.

O backend não zera débitos apenas porque o aplicativo informou que houve pagamento. Para liberar Pix/cartão em produção, é obrigatório integrar um provedor, criar cobranças e processar o webhook assinado do provedor antes de marcar a operação como `pago`.

## Documentos legais e confiança

As minutas ficam em `legal/`. Elas precisam ser revisadas e preenchidas com os dados da empresa antes de publicação.

## Antes do lançamento público

Código e infraestrutura não substituem as etapas operacionais e jurídicas do serviço. Para uma operação real no Brasil, finalize pelo menos:

- integração de pagamentos e conciliação financeira;
- termos de uso e política de privacidade;
- processo LGPD para titulares, retenção e descarte de dados;
- resposta a incidentes de segurança;
- regras de operação e atendimento;
- requisitos municipais aplicáveis ao transporte privado individual remunerado;
- revisão de documentos/condutores e critérios de aprovação;
- monitoramento, alertas e backup/recuperação do banco;
- testes de carga e teste de falha do Redis/Mapbox/Supabase;
- publicação do app e configuração de domínio/HTTPS.
