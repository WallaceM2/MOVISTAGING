# MOVI — continuidade do trabalho

Última atualização: 11 de outubro de 2026.

## Objetivo do produto

Preparar Passageiro (PSG), Motorista (MTA) e Backend (V3) como um único serviço de transporte, primeiro para Caruaru e depois com possibilidade de expansão nacional. Prioridades: segurança, operação correta, corrida ponta a ponta, registro financeiro correto e validação antes de trabalho visual.

O fluxo de aceite esperado é: passageiro solicita em dinheiro → motorista recebe/aceita → valida código de embarque → conclui → ganhos das últimas 24 horas sobem → a carteira continua separada. O ganho móvel foi escolhido pelo usuário como soma de corridas concluídas nas últimas 24 horas, em janela móvel. Pagamento digital/saques ficam fora até integração de provedor real.

## Repositórios

| Pasta | Branch / commit observado | Estado inicial |
|---|---|---|
| MOVI PSG | `passageiro` / `1ba7d1a` | Limpo e alinhado com origin |
| MOVI MTA | `motorista` / `0ad0fb8` | Limpo e alinhado com origin |
| MOVI V3 | `backend` / `6796185` | Já tinha alterações locais do usuário em `package.json` e `tests/unit.test.js`; preservar |

O PostgreSQL configurado foi consultado sem escrita: `db:check` retornou `ok: true`, 9 migrations aplicadas e nenhum problema. Os arquivos são `000` a `008`.

## Trabalho feito nesta sessão

- V3: resposta de `GET /api/extrato` ganhou `ganhos_ultimas_24h`, calculado sobre corridas concluídas pela coluna `finalizada_em`; `saldo_total` continua separado como saldo de carteira.
- MTA: painel usa o novo campo para ganhos das últimas 24 horas e identifica `saldo_total` como carteira. O histórico continua exibindo ganhos acumulados.
- V3: testes cobrem a consulta das últimas 24 horas e a finalização em dinheiro, incluindo taxa de app debitada na carteira separada do repasse do motorista.
- PSG: removidos 12 avisos de ESLint sem alterar os fluxos.
- PSG: `expo-linking` foi alinhado a `57.0.12` para manter compatibilidade com `expo-router 57.0.25`; `npm audit fix` sem `--force` atualizou transitivas compatíveis.
- MTA: `npm audit fix` sem `--force` atualizou transitivas compatíveis do Expo SDK 57; os arquivos Android versionados foram restaurados após o prebuild de validação.
- V3: `npm audit fix` compatível atualizou dependências transitivas; o `proxy-addr` crítico foi corrigido. `npm audit --omit=dev` ficou com zero vulnerabilidades. A auditoria completa ainda aponta avisos de desenvolvimento via `nodemon`/`braces`.
- APKs Android de debug de PSG e MTA foram compilados com sucesso. Os arquivos estão em `android/app/build/outputs/apk/debug/app-debug.apk` em cada pasta. A validação exigiu `JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED` porque o host está usando Java 25.
- `expo prebuild` regenerou Android para a compilação. O caminho SDK foi configurado em `android/local.properties` (ignorado pelo Git); alterações Android rastreadas do MTA foram restauradas ao estado original antes da compilação final.
- E2E real nos AVDs PSG (`emulator-5554`) e MTA (`emulator-5556`): estimativa em Caruaru, solicitação, oferta com categoria correta, aceite pelo motorista, validação do código e finalização em dinheiro pelo app MTA.
- O E2E encontrou e corrigiu três erros que revertiam a finalização financeira: ordem de parâmetros no insert do ledger; parâmetro de status inferido como `text` e `varchar` na mesma query; `ON CONFLICT` sem o predicado do índice único parcial. As mudanças estão em `src/models/Corrida.js` e cobertas em `tests/unit.test.js`.
- PSG: a tela de status agora consulta a corrida a cada 10 segundos enquanto não terminal, mesmo após o aceite, com teste da regra. Isso permite recuperar atualização perdida pelo socket. No AVD, a tela acabou sincronizando para “Corrida finalizada” e mostrou ações de avaliação/retorno.

## Validações concluídas

- PSG: `npm run verify` passou: estrutura, TypeScript, 5 suítes / 10 testes e ESLint; cobertura de statements 67,21%.
- MTA: `npm run typecheck` passou.
- V3: `npm run test:all` passou com 19 testes, análise sintática e `security:check`, após os três fixes encontrados no E2E.
- V3: `npm run db:check` passou com as 9 migrations no PostgreSQL.
- Builds Gradle de PSG e MTA passaram e geraram APKs.
- V3: `npm audit --omit=dev` foi confirmado novamente com zero vulnerabilidades.
- Backend local respondeu `/health` com API, PostgreSQL e Redis `UP` durante o E2E.
- Corrida sintética #13 concluiu: total R$ 5,50; recebido R$ 5,50; ganho do motorista R$ 4,67; comissão R$ 0,83. Banco confirmou `concluida`/`pago`, ledger com corrida bruta +R$ 5,50, repasse -R$ 4,67 e comissão -R$ 0,83, carteira -R$ 0,83 e ganhos móveis +R$ 4,67 em uma corrida nas últimas 24 horas. A tela MTA mostrou os ganhos e a carteira separados.

## Pendências e bloqueios

1. O E2E cobriu pagamento integral em dinheiro. Corridas parcialmente pagas/não pagas e a atribuição do ganho diário nesses estados ainda precisam de decisão e validação antes da operação real.
2. PSG e MTA mantêm alertas de dependências apontados em auditorias anteriores; o usuário pediu para tratar essa etapa depois da validação de fluxo. Não aplicar `--force` sem planejar migração incompatível.
3. O backend ainda não tem provedor de pagamento digital; pagamentos digitais e saques permanecem fora do fluxo validado.
4. O teste usou AVDs e backend/Supabase de teste, não uma publicação, APK de produção ou operação real em Caruaru. Revisar requisitos legais, monitoramento, suporte e operação antes do lançamento.
5. A pasta V3 já tinha mudanças locais do usuário em `package.json` e `tests/unit.test.js`; preservar essas mudanças ao continuar.

## Próxima sequência

1. Depois do E2E de dinheiro integral, validar corrida parcialmente paga/não paga e os limites de carteira com regras de produto definidas.
2. Tratar os alertas de dependências com atualização compatível, validando novamente bundles, typecheck, testes e APKs.
3. Confirmar requisito de expiração móvel das 24 horas em cenário controlado por teste (sem manipular relógio/dados de operação).
4. Só declarar pronto para operação após revisão de segurança, requisitos legais/operacionais e estratégia de observabilidade/suporte.

## Privacidade

Não incluir neste documento `.env`, tokens, senhas, dados pessoais reais, credenciais Supabase ou códigos de embarque reais.
