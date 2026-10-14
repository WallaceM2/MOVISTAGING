# Preparação da integração de pagamentos MOVI

Atualizado em 13/10/2026.

## Decisão de produto registrada

- A tarifa da corrida é a base financeira oficial.
- O motorista recebe 85% e a MOVI contabiliza 15% de comissão sobre essa tarifa.
- O custo do meio de pagamento digital varia conforme o método escolhido e será incluído no total cobrado do passageiro, discriminado separadamente antes da confirmação da solicitação. Ele não altera a tarifa-base nem reduz a divisão econômica de 85% para o motorista e 15% para a MOVI.
- Pagamento em dinheiro não recebe tarifa de processamento digital.
- Pix/cartão permanecem desabilitados até que um provedor real esteja integrado, validado e configurado. `PAYMENT_PROVIDER=none` continua sendo o padrão.

## Estado verificado no repositório

- `.env.example` e `src/config/env.js` mantêm `PAYMENT_PROVIDER=none`.
- `src/controllers/corridaController.js` bloqueia métodos digitais quando não há provedor configurado.
- `src/controllers/passageiroController.js` não permite quitar débito sem liquidação confirmada pelo provedor.
- O esquema atual tem `movi_pagamentos`, `movi_lancamentos_financeiros` e `movi_saques_motoristas`; o dicionário de dados define `movi_pagamentos` como estado externo do gateway e o ledger como trilha financeira idempotente.
- A tarifa da corrida e a divisão 85/15 são configuradas no V3; nenhum percentual deve ser recalculado nos apps.

## Fluxo de preço desejado para PSG

1. O passageiro informa origem e destino; o V3 calcula a tarifa-base por categoria (carro e moto).
2. Antes da solicitação final, o passageiro escolhe o método de pagamento. A tela apresenta, para cada categoria, tarifa da corrida, custo do pagamento daquele método e total a pagar. Dinheiro não recebe custo de processamento digital.
3. O passageiro confirma uma combinação de categoria + método + valor total. O V3 recalcula ou valida a cotação e grava um snapshot financeiro imutável; o app nunca calcula a taxa do provedor.
4. A comissão MOVI é 15% da tarifa-base e o valor econômico do motorista é o restante (85%), com divisão em centavos que preserve a soma exata da tarifa-base. O custo de pagamento é contabilizado à parte.
5. A cobrança e o despacho precisam respeitar o estado real do pagamento. O momento de cobrar, autorizar ou capturar, e o tratamento de falha, motorista não encontrado, cancelamento e reembolso dependem do contrato do provedor e serão definidos antes da ativação.

O custo por método só pode ser exibido como valor exato quando a MOVI tiver uma tabela comercial confirmada e versionada para as condições aplicáveis. Até lá, o provedor permanece desativado e nenhum custo estimado deve ser apresentado como cobrança confirmada.

## Acesso e produtos para avaliar

### Stripe

- Criar conta: https://dashboard.stripe.com/register
- Stripe Connect para marketplace: https://stripe.com/br/connect
- Preços de Connect: https://stripe.com/br/connect/pricing
- A conta brasileira pede identificação fiscal e bancária, endereço e informações do representante. Ver os requisitos oficiais: https://support.stripe.com/questions/brazil-specific-information-to-open-a-stripe-account?locale=pt-BR
- Ao criar a conta, avaliar com a Stripe qual modelo Connect suporta a MOVI, onboarding/KYC de motoristas, split, responsabilidade por tarifas e estornos, e calendário/custo de repasses.

### Mercado Pago

- Criar/entrar na conta: https://www.mercadopago.com.br/
- Primeiros passos para integração: https://www.mercadopago.com.br/developers/pt/docs/getting-started
- Painel de aplicações: https://www.mercadopago.com.br/developers/panel
- Documentação de split para marketplace: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/how-tos/integrate-marketplace?scope=prod
- O split 1:1 documentado usa Checkout Pro ou Checkout Transparente e exige conta de vendedor com KYC nível 6 e OAuth por vendedor. O modelo 1:N tem disponibilidade comercial restrita; confirmar elegibilidade com o Mercado Pago.
- Confirmar tarifa real por método, prazo de recebimento, split, estorno e repasse diretamente no painel/proposta comercial. A página pública não basta para fechar o custo MOVI.

## Ordem de trabalho

1. Criar contas/aplicações e obter **somente credenciais de teste**.
2. Comparar as propostas com foco em marketplace, split, custo total de cartão/Pix, repasses, estornos, chargebacks, KYC e suporte.
3. Escolher um provedor e um modelo de cobrança/split, sem misturar credenciais ou eventos de provedores diferentes.
4. Fechar o contrato de API e o snapshot financeiro: tarifa, percentual de comissão, custo do pagamento, valor total apresentado, pagamento confirmado, dívida, repasse e estorno.
5. Apresentar o custo exato ao passageiro antes de solicitar a corrida; validar a comunicação de preço por método com orientação jurídica brasileira.
6. Implementar no V3 primeiro: criação server-side, chaves de idempotência, webhook autenticado, conciliação de valor/moeda/corrida, transições permitidas e lançamentos reversores. Só depois adaptar PSG/MTA às respostas do V3.
7. Validar em sandbox, incluindo evento repetido, evento atrasado, falha, cancelamento, pagamento parcial/pendente, estorno e divergência de valor. Produção continua desligada até aprovação dos critérios e configuração segura.

## Segurança de credenciais

- Usar credenciais de teste durante desenvolvimento; não enviar tokens, segredos, chaves privadas ou dados de cartão por chat.
- Guardar segredos apenas no `.env` local ignorado pelo Git ou no gerenciador de segredos do ambiente hospedado; nunca em `.env.example`, app móvel, logs, screenshots ou commits.
- Não ativar pagamentos reais nem alterar dados financeiros de produção durante o desenvolvimento.

## Implementação inicial do Mercado Pago (sandbox)

- A aplicação MOVI Marketplace Payments Sandbox está registrada para Checkout Transparente / Payments API.
- O V3 agora possui rotas de vinculação OAuth por motorista aprovado, com `state` de uso único, PKCE S256 e credenciais de vendedor criptografadas em repouso via AES-256-GCM.
- O cliente de Payments usa o token OAuth do motorista, e a assinatura de webhook usa HMAC-SHA256; o webhook consulta o pagamento na API e compara recebedor, valor, moeda e referência antes de atualizar o estado MOVI.
- Variáveis locais opcionais: `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `MP_TOKEN_ENCRYPTION_KEY` (32 bytes em hex/base64), `MP_ENVIRONMENT=sandbox` e `MP_WEBHOOK_URL`.
- Rotas: `POST /api/motoristas/mercadopago/vinculacao`, `GET /api/motoristas/mercadopago/vinculacao`, `GET /api/pagamentos/mercadopago/oauth/callback`, `POST /api/pagamentos/mercadopago/webhook`.
- O pagamento digital continua desabilitado por um bloqueio fixo no backend; nenhuma variável de ambiente consegue habilitá-lo neste estágio. A camada atual não define tarifa exata do provedor nem captura tokenização de cartão/Pix nos apps, e não automatiza reembolso/chargeback. `PAYMENT_PROVIDER=none` continua sendo o valor documentado no exemplo de ambiente.
- O MTA tem a entrada de vinculação na tela Conta. Ela abre o consentimento OAuth no Mercado Pago e mostra apenas o estado de vínculo, sem armazenar credenciais no aparelho.
- A tokenização mobile para Payments API exige os Core Methods nativos Android/iOS do Mercado Pago; os apps Expo atuais ainda não incluem esses SDKs. O PSG precisa de uma ponte nativa compatível e de um checkout mobile antes de enviar token ao V3.
- Como o split OAuth usa o token do vendedor, a conta do motorista precisa estar conhecida antes de criar a cobrança. O fluxo de solicitação atual despacha a corrida antes de conhecer o motorista; o produto precisa cobrar após o aceite ou obter confirmação documentada do Mercado Pago para uma estratégia de autorização/captura que preserve o split.
- Reembolso total/parcial e chargeback são registrados para revisão operacional; não alteram silenciosamente ledger nem corrida. Não lançar a migration 012 em banco compartilhado/produção sem revisar o plano de migração e backup.

## Próxima informação necessária para implementação

Depois de criar as contas, registrar no painel qual produto/modelo de marketplace está habilitado e a tabela de tarifas aplicável. Compartilhar apenas nomes dos produtos, valores e identificadores não secretos. Credenciais de teste devem ser configuradas localmente no V3; não precisam ser coladas nesta conversa.
