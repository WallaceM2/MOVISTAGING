# Preparação de saques do MOVI Drive

Esta etapa prepara o cadastro do destino Pix/conta bancária e o PIN de saque. Ela **não transfere dinheiro** e não habilita solicitações de saque: `PAYOUT_PROVIDER=none` continua sendo o padrão até existir provedor configurado, integração de liquidação e confirmação de transferência.

## Contratos adicionados

- `GET /api/motoristas/recebimento`: retorna somente os dados mascarados, se há PIN e se o saque está habilitado.
- `PUT /api/motoristas/recebimento`: salva a chave Pix e a conta do próprio motorista.
- `PUT /api/motoristas/saques/pin`: cria ou altera o PIN de 4 dígitos. Para alteração, exige o PIN atual.

As duas operações de escrita exigem autenticação de motorista, conta ativa, validação estrita e `Idempotency-Key`. A chave Pix e os dados bancários são cifrados com AES-256-GCM antes de persistir; existe decifragem autenticada apenas para uso interno do backend futuro, sem endpoint que revele o destino ao app. O PIN é guardado como hash bcrypt e bloqueia novas tentativas por 30 minutos após cinco erros. Auditoria não inclui os dados sensíveis, e gravação do destino e auditoria são atômicas.

## Ativação do cadastro

1. Aplicar `migrations/020_driver_payout_setup.sql` no banco de desenvolvimento/staging.
2. Configurar `FINANCIAL_DATA_ENCRYPTION_KEY` com uma chave aleatória de 32 bytes codificada em hexadecimal (64 caracteres) ou Base64. Exemplo para gerar localmente: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Guardar a chave em um gerenciador de segredos; não versioná-la, não enviá-la ao app e não registrar seu valor em logs.

## O que ainda precisa do provedor

- Criar solicitação de saque reservando saldo de forma atômica e idempotente.
- Enviar transferência Pix ao provedor e validar webhook assinado/consulta autenticada.
- Conciliação, estados de falha/cancelamento, devolução do saldo reservado e comprovante.
- Só informar “Pix enviado” depois de confirmação verificável da liquidação.

Até esses itens existirem, a tela do app mantém “Solicitar saque” indisponível mesmo que a conta e o PIN estejam cadastrados. O saldo exibido continua sendo operacional; não é promessa de valor sacável.
