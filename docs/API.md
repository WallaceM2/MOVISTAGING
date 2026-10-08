# MOVI API — superfície atual

### Cadastro e aceite legal

`POST /api/passageiros` e `POST /api/motoristas` exigem `aceita_termos: true`. O backend registra, na mesma transação da criação da conta, o aceite das versões atuais dos Termos de Uso, Aviso de Privacidade e Política de Segurança e Confiança. Se qualquer etapa falhar, a conta não é criada.

O frontend deve apresentar uma caixa de seleção obrigatória imediatamente antes do botão de criação, com links para os documentos legais. A API mantém uma rota pública para o conteúdo vigente antes do login:

```text
GET /api/legal/publicos/passageiro
GET /api/legal/publicos/motorista
```

> Marcar a caixa no frontend é requisito de UX; a validação `aceita_termos === true` no backend é a barreira de segurança.

## Público

```text
POST /api/motoristas
POST /api/motoristas/login
POST /api/passageiros
POST /api/passageiros/login
POST /api/admin/login
POST /api/auth/refresh
GET  /health/live
GET  /health/ready
```

## Autenticado

```text
POST /api/auth/logout
POST /api/auth/change-password
GET  /api/motoristas/perfil
GET  /api/passageiros/perfil
POST /api/motoristas/documentos
POST /api/motoristas/localizacao   # motorista online/corrida ativa; localização em segundo plano autenticada
POST /api/passageiros/documentos
POST /api/notificacoes/dispositivo # registrar token Expo do aparelho autenticado
DELETE /api/notificacoes/dispositivo
GET  /api/documentos/:tipo/:id/:documento
POST /api/corridas/estimar
POST /api/corridas/solicitar
GET  /api/corridas/ofertas           # motorista: ofertas pendentes para recuperação após reconexão
POST /api/corridas/:id/recusar      # motorista: recusa de oferta e redispatch
GET  /api/corridas/:id
POST /api/corridas/:id/aceitar
POST /api/corridas/:id/iniciar
POST /api/corridas/:id/finalizar
POST /api/corridas/:id/cancelar
POST /api/corridas/:id/compartilhamento       # passageiro: criar/rotacionar link temporário
DELETE /api/corridas/:id/compartilhamento     # passageiro: revogar links da corrida
GET  /api/extrato
POST /api/avaliacoes
GET  /api/avaliacoes/:tipo/:id
POST /api/denuncias
POST /api/passageiros/quitar-debito
```

O link público `GET /compartilhar/:token` é aleatório, contém 256 bits de entropia e só é armazenado no banco como hash. Ele funciona como uma credencial de acesso: qualquer pessoa que receba o link poderá ver os dados limitados da viagem. Acesso não autenticado é somente de leitura; mostra motorista, veículo aprovado, trajeto e posição recente enquanto a corrida estiver ativa. O link expira em 24 horas, pode ser revogado pelo passageiro e deixa de expor os dados da viagem quando a corrida termina. Compartilhe apenas com pessoas de confiança. Configure `SHARE_PUBLIC_BASE_URL` com a origem HTTPS pública da API.

O motorista envia atualizações de localização em segundo plano ao endpoint autenticado. O servidor aceita essa posição somente se a conta estiver aprovada e ativa e o motorista estiver online ou vinculado à corrida ativa. Pushes carregam apenas o tipo de evento e o ID da corrida; não incluem endereços, telefone ou dados de documentos. Recibos Expo são verificados pelo worker, tokens marcados como não registrados são desativados e um token ativo não pode ser transferido para outra conta sem ser desativado primeiro.

## Administrativo

```text
GET   /api/admin/motoristas
GET   /api/admin/motoristas/:id
PATCH /api/admin/motoristas/:id/verificacao
PATCH /api/admin/motoristas/:id/status
GET   /api/admin/passageiros
GET   /api/admin/passageiros/:id
PATCH /api/admin/passageiros/:id/status
```

Operações de mutação sensíveis que podem ser repetidas pelo aplicativo usam `Idempotency-Key` quando definido na rota.

`POST /api/corridas/:id/iniciar` exige `codigo_embarque` com 6 caracteres hexadecimais. O servidor limita erros consecutivos e bloqueia novas tentativas temporariamente. O código só é devolvido ao passageiro enquanto a corrida estiver aceita; respostas destinadas ao motorista nunca incluem o código nem os contadores internos. Durante corridas aceitas/em andamento, cada lado recebe somente a identidade pública necessária da outra conta: o motorista vê primeiro nome e reputação do passageiro, e o passageiro vê nome, reputação e veículo aprovado do motorista.

## Segurança

Denúncias graves ficam, por padrão, para análise administrativa. A suspensão automática é opcional via `AUTO_SUSPEND_ON_SERIOUS_REPORT=true`.

## Legal / consentimento

```text
GET  /api/legal/documentos   # lista versões atuais exigidas para passageiro/motorista
POST /api/legal/aceites      # registra aceite das versões atuais
```

O backend calcula o SHA-256 dos arquivos legais publicados no servidor e grava o hash junto ao aceite. Em produção, endpoints protegidos para passageiro/motorista exigem que os documentos vigentes estejam aceitos.
