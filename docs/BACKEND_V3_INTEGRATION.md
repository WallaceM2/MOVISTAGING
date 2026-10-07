# MOVI Passageiro — contrato de integração com o Backend V3

Este aplicativo é uma camada cliente do MOVI Backend V3. A regra de negócio permanece no backend.

## REST consumido

### Público
- `POST /api/passageiros`
- `POST /api/passageiros/login`
- `POST /api/auth/refresh`
- `GET /api/legal/publicos/passageiro`

### Autenticado
- `GET /api/passageiros/perfil`
- `POST /api/passageiros/documentos`
- `POST /api/passageiros/quitar-debito`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `GET /api/legal/documentos`
- `POST /api/legal/aceites`
- `POST /api/corridas/estimar`
- `POST /api/corridas/solicitar`
- `GET /api/corridas/:id`
- `POST /api/corridas/:id/cancelar`
- `GET /api/extrato`
- `POST /api/avaliacoes`
- `POST /api/denuncias`
- `GET /api/documentos/:tipo/:id/:documento`
- `POST /api/notificacoes/dispositivo` e `DELETE /api/notificacoes/dispositivo` (registro/remoção do token Expo do aparelho autenticado)
- `POST /api/corridas/:id/compartilhamento` e `DELETE /api/corridas/:id/compartilhamento` (criar/rotacionar e revogar link seguro temporário)
- `GET /compartilhar/:token` (página pública de leitura, expira em 24h e pode ser revogada)

## Realtime

O backend V3 autentica Socket.IO usando o access token em `handshake.auth.token`. O passageiro consome:

- `corrida_solicitada`
- `corrida_aceita`
- `corrida_iniciada`
- `corrida_finalizada`
- `corrida_cancelada`
- `motorista_em_movimento`

O cliente também envia `heartbeat` periódico enquanto a sessão estiver ativa.

## Regras que pertencem ao backend

- preço e dinâmica;
- comissão/repasse;
- escolha e matching de motorista;
- estado oficial da corrida;
- autorização;
- aceite legal;
- quitação financeira;
- persistência de documentos;
- controle de idempotência.

O app somente apresenta, solicita ou reage ao estado retornado.

## Identidade e embarque seguro

- `GET /api/corridas/:id` e o evento `corrida_aceita` incluem identidade pública do motorista e dados do veículo somente se o veículo estiver aprovado.
- O passageiro recebe `codigo_embarque` apenas enquanto a corrida está aceita; apresenta o código de seis caracteres ao motorista.
- `POST /api/corridas/:id/iniciar` envia `{ "codigo_embarque": "ABC123" }`. O backend limita tentativas incorretas, bloqueia temporariamente novos erros e nunca retorna o código ao motorista.
- O código e os contadores internos não são expostos na solicitação, cancelamento, finalização nem na sessão do motorista.

## Forma de pagamento neste snapshot

O V3 enviado para integração usa `PAYMENT_PROVIDER=none`; por isso a UI mantém `dinheiro` habilitado e deixa cartão/Pix bloqueados até existir um provedor real no backend.

## Push notifications

Os dois apps registram e removem tokens Expo em endpoints autenticados. O backend envia mensagens genéricas de corrida e guarda tickets para consultar recibos pelo worker. Payloads push não incluem endereço, telefone nem dados de documentos. Em produção, configure as credenciais EAS/FCM/APNs e monitore recibos e tokens inválidos; a entrega do serviço push é best-effort.
