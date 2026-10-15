# MOVI V3 — checklist operacional de produção

## Estado verificado em 15/10/2026

- V3: `npm run test:all` passou (47 testes; análise sintática e `security:check` também passaram).
- PSG: `npm run verify` passou (13 testes em 5 suítes, typecheck, contratos de suporte e lint; cobertura de linhas observada: 71,29%).
- MTA: `npm run typecheck`, `npm run test:support-contract` (3 contratos) e `npm run test:finance-contract` (1 contrato) passaram. A pasta ainda não tem uma suíte de integração de corridas/AVD; isso fica na etapa final acordada.
- Banco indicado pelo `.env` de desenvolvimento: `npm run db:check` retornou `ok: true`, 16 migrations aplicadas e sem problemas de esquema. Isso não comprova que a base seja staging ou produção.
- O extrato do parceiro agora separa `repasse_pendente` do saldo de carteira. O MTA informa que acertos de corridas parciais/não pagas ainda não estão disponíveis na carteira.
- `bundleRelease` passou em PSG e MTA e gerou AAB assinado (aprox. 107,9 MB e 110,2 MB; assinaturas verificadas). São artefatos de QA: o `.env` dos dois apps aponta para uma API sem HTTPS, então não publicar esses bundles.
- O Render YAML descreve API e worker separados em Ohio, mas o repositório não comprova serviços provisionados, staging, domínio, TLS, alertas ou backups.

## Ordem de trabalho acordada

1. Agora: fechar contabilidade parcial/não paga, validar migrations, fortalecer verificações do MTA, revisar infraestrutura e releases.
2. Depois: suporte e questões operacionais/jurídicas, a serem discutidos antes de implementar.
3. Por último: ciclo visual completo nos AVDs, integração de pagamentos digitais e saques.

Este documento separa o que o repositório configura do que ainda depende dos provedores e do operador. Não contém credenciais.

## Já configurado no código

- Render declara um serviço web e um worker separados em `render.yaml`.
- A publicação executa `npm ci`, aplica migrations no pre-deploy e usa `/health/ready` como health check.
- `/health/live` verifica o processo; `/health/ready` exige banco e Redis, sem devolver detalhes internos de conexão.
- O backend registra eventos em JSON e limita tamanho e duração das requisições.
- `PAYMENT_PROVIDER=none` mantém o pagamento digital desativado.
- O worker e o web service recebem variáveis de conexão como referências secretas do Render (`sync: false`).

## Obrigatório antes de produção

1. Confirmar que banco e Redis são instâncias de produção, com acesso de rede restrito e TLS validado. Nunca usar o `.env` local como fonte de configuração de deploy.
2. Configurar backups automáticos/PITR no provedor PostgreSQL conforme o plano contratado, retenção aprovada e um procedimento de restauração. Fazer e registrar um teste de restore antes de receber dados reais.
3. Configurar alertas para indisponibilidade de `/health/ready`, falhas repetidas de banco/Redis, reinícios de worker e erros 5xx; revisar retenção e acesso aos logs JSON.
4. Validar migrations em staging com snapshot restaurável; o pre-deploy aplica todas as migrations pendentes e não deve apontar para uma base de produção não revisada.
5. Rever CORS, TLS, domínio, política de privacidade, termos, atendimento e requisitos legais/operacionais de Caruaru antes de abrir cadastro público.
6. O `render.yaml` está configurado para a região `ohio`; medir latência real para Caruaru e confirmar a região de hospedagem antes de publicar.
7. Publicar primeiro em staging; validar `/health/live`, `/health/ready`, login, suporte, solicitações em dinheiro e recuperação de débitos; manter o release anterior disponível para rollback.

## Pagamentos — decisão de arquitetura ainda não implantada

PIX e cartão permanecem desabilitados enquanto não houver integração de provedor homologada e conciliada. Quando esse trabalho começar, os fluxos aprovados são:

- PIX escolhido antes da solicitação: criar cobrança e mostrar QR/copia-e-cola com validade de 5 minutos. Só buscar motorista após confirmação autenticada do provedor. Se não houver motorista em 10 minutos de busca, solicitar o estorno e aguardar a confirmação do provedor antes de marcar o estorno como concluído.
- Na chegada ao destino, o motorista toca em “Finalizar corrida”. Essa ação encerra o ciclo operacional, mas abre primeiro uma etapa financeira pendente: exibir o valor integral da tarifa; um QR/copia-e-cola PIX com validade de 180 segundos; e o resumo `Pagamento DINHEIRO: R$ X`, `Ganho do parceiro: R$ Y (85%)` e `Ganho da MOVI: R$ Z (15%)`. O item DINHEIRO representa o valor da tarifa da corrida originalmente solicitada em dinheiro; se o QR for pago, o registro da transação deve indicar PIX como método efetivamente recebido.
- A corrida só terá pagamento confirmado depois da confirmação autenticada do provedor. A expiração ou uma ação no app não pode marcá-la como paga. Depois da confirmação do PIX, mostrar “Corrida paga com sucesso” e permitir voltar. Na carteira, o parceiro vê somente sua parcela, sem confundir tarifa bruta com valor líquido; o estado de repasse/transferência continua separado da confirmação do pagamento.
- Evento externo deve ser autenticado, correlacionado ao pagamento/corrida e idempotente. O split 85/15 continua aplicado somente à tarifa. Recuperação de débito antigo é uma operação separada destinada à MOVI.

## Itens que este repositório não consegue confirmar

- Estado do plano contratado e dos backups/PITR do banco e Redis.
- Domínio, certificados, regras de firewall, alertas, retenção de logs e teste real de restauração.
- Aprovação do Mercado Pago para marketplace/OAuth, split, taxas, reembolsos e prazos de liquidação.
- Assinatura/publicação dos aplicativos nas lojas e validação final nos AVDs.

Não considerar o sistema pronto para tráfego público até que os itens obrigatórios acima sejam evidenciados e os testes ponta a ponta com os provedores estejam aprovados.
