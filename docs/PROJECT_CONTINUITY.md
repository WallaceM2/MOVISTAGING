# MOVI — continuidade do trabalho

Última atualização: 11 de outubro de 2026.

## Objetivo do produto

Preparar Passageiro (PSG), Motorista (MTA) e Backend (V3) como um único serviço de transporte, primeiro para Caruaru e depois com possibilidade de expansão nacional. Prioridades: segurança, operação correta, corrida ponta a ponta, registro financeiro correto e validação antes de trabalho visual.

O fluxo de aceite esperado é: passageiro solicita em dinheiro → motorista recebe/aceita → valida código de embarque → conclui → ganhos das últimas 24 horas sobem → a carteira continua separada. O ganho móvel foi escolhido pelo usuário como soma de corridas concluídas nas últimas 24 horas, em janela móvel. Pagamento digital/saques ficam fora até integração de provedor real.

## Repositórios

| Pasta | Branch / commit observado | Estado inicial |
|---|---|---|
| MOVI PSG | `passageiro` / `d4d1d3a` | Commit de recuperação de status/localização enviado a origin |
| MOVI MTA | `motorista` / `d15f2da` | Ganhos móveis e atualização de ofertas enviados a origin |
| MOVI V3 | `backend` / `8000c5c` | Central de suporte e migration 009 enviadas a origin |

O PostgreSQL de desenvolvimento configurado agora tem 10 migrations (`000` a `009`); `db:check` retornou `ok: true`, sem problemas.

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
- PSG, MTA e V3: commits `d4d1d3a`, `d15f2da` e `a77a2b0` foram enviados para as branches `passageiro`, `motorista` e `backend` do GitHub.
- V3: primeira versão da central de suporte implementada com FAQ/triagem determinística, chamados e mensagens, fila administrativa, controle de acesso por participante, auditoria sem texto da conversa e estimativa de primeira resposta humana em 24–48 horas corridas.
- V3: migration `009_support_center.sql` aplicada ao banco de desenvolvimento. `db:check` retornou 10 migrations, `ok: true`.
- V3: migration runner normaliza CRLF para LF antes de calcular checksums, evitando divergência entre Windows e Unix sem enfraquecer a validação de mudanças reais nos arquivos.
- V3: revisão de fluxo encontrou e corrigiu o retorno à fila quando o usuário responde a um chamado em `aguardando_usuario`; respostas também reabrem chamados `resolvido`, e chamados `fechado` continuam bloqueados.
- V3: teste HTTP de suporte percorre autenticação, validação, isolamento entre usuários, fila/resposta administrativa, transições e auditoria sem texto da conversa. Teste integrado com PostgreSQL de desenvolvimento confirmou os mesmos fluxos com dados sintéticos, removidos ao final.
- V3: finalização financeira agora rejeita o estado interno `pendente` e pagamento parcial com recebimento zero, mesmo se chamada fora da validação HTTP.
- V3: `npm run test:all` passou com 26 testes, análise sintática e `security:check`. `db:check` confirmou as 10 migrations após a 009.

## Pendências e bloqueios

1. O E2E cobriu pagamento integral em dinheiro. Corridas parcialmente pagas/não pagas e a atribuição do ganho diário nesses estados ainda precisam de decisão e validação antes da operação real.
2. PSG e MTA mantêm alertas de dependências apontados em auditorias anteriores; o usuário pediu para tratar essa etapa depois da validação de fluxo. Não aplicar `--force` sem planejar migração incompatível.
3. O backend ainda não tem provedor de pagamento digital; pagamentos digitais e saques permanecem fora do fluxo validado.
4. O teste usou AVDs e backend/Supabase de teste, não uma publicação, APK de produção ou operação real em Caruaru. Revisar requisitos legais, monitoramento, suporte e operação antes do lançamento.
5. A pasta V3 já tinha mudanças locais do usuário em `package.json` e `tests/unit.test.js`; preservar essas mudanças ao continuar.

## Próxima sequência

1. Integrar os endpoints de suporte nos apps e criar uma fila/painel para atendimento humano; definir operação real para cumprir a estimativa de 24–48 horas.
2. Definir como registrar ganho do motorista, comissão e dívida quando o passageiro paga parcialmente ou não paga. Hoje o resumo móvel soma o ganho integral de toda corrida concluída; o débito do passageiro guarda o valor faltante, mas não existe provedor nem fluxo administrativo para liquidá-lo.
3. Validar corrida parcialmente paga/não paga e os limites de carteira depois da definição da regra financeira.
4. Tratar alertas de dependências nas pastas PSG e MTA com atualização compatível, validando bundles, typecheck, testes e APKs.
5. Confirmar requisito de expiração móvel das 24 horas em cenário controlado por teste.
6. Só declarar pronto para operação após revisão de segurança, requisitos legais/operacionais e estratégia de observabilidade.

## Privacidade

Não incluir neste documento `.env`, tokens, senhas, dados pessoais reais, credenciais Supabase ou códigos de embarque reais.
