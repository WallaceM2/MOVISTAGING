# MOVI — hardening da base para produção

## O que foi consolidado

- modelo canônico de PostgreSQL e migrations 000–004;
- fonte de verdade de preços em `movi_tarifas`;
- snapshot da tarifa dentro da corrida;
- divisão econômica 15% Movi / 85% parceiro;
- proteção de piso líquido por quilômetro;
- isolamento completo de despacho `carro` x `moto`;
- ofertas individualizadas com expiração e redispatch;
- integridade de categoria no PostgreSQL;
- veículo operacional separado do cadastro documental legado;
- consentimento legal versionado com hash do documento;
- armazenamento privado de documentos;
- ledger financeiro e estrutura de pagamentos preparada;
- health/readiness, rate limiting e auditoria;
- verificação administrativa do motorista;
- ferramenta `npm run db:check` para homologação do Supabase;
- testes unitários da máquina de estados e divisão financeira.

## O que continua deliberadamente condicionado ao lançamento real

- gateway de Pix/cartão e webhooks assinados;
- saque/payout efetivo do parceiro;
- MFA de administração;
- definição e validação das áreas municipais de operação;
- regras locais de transporte, seguros, tributos e contratos;
- revisão jurídica final das minutas legais;
- pentest, teste de carga e teste de disaster recovery;
- observabilidade e alertas de produção;
- política final de retenção/descarte de dados.

## 2026-09-20 — Aceite legal obrigatório no cadastro

- `POST /api/passageiros` e `POST /api/motoristas` agora exigem `aceita_termos: true`.
- A criação da conta e o registro das versões atuais dos documentos legais ocorrem na mesma transação PostgreSQL.
- Se o registro do consentimento falhar, a conta não é criada.
- Adicionada API pública `GET /api/legal/publicos/passageiro` e `GET /api/legal/publicos/motorista` para o frontend exibir os documentos antes do cadastro.
- O endpoint autenticado de renovação de consentimento continua disponível para versões futuras dos documentos.
