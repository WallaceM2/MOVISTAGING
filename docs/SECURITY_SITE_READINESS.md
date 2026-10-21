# MOVI — Segurança e prontidão do site

Verificado em 19/10/2026. Este relatório registra o estado do código; não comprova configuração dos serviços externos nem substitui validação operacional e jurídica.

## Correções aplicadas

- Painel administrativo do V3 agora mantém a sessão em cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção e com escopo `/api/admin`; logout expira o cookie. O frontend deixa de armazenar JWT e valida a origem em operações mutáveis autenticadas por cookie.
- Removidos sinks `innerHTML` no painel; conteúdo do dashboard é construído com APIs DOM e texto escapado. A rota visual administrativa declara `noindex`.
- MTA e PSG validam a URL da API; builds Android desativam backup geral e bloqueiam `SYSTEM_ALERT_WINDOW`.
- Atualizações compatíveis de dependências aplicadas sem `npm audit fix --force`: overrides direcionados para `decode-uri-component` e `uuid`; `expo-asset` adicionado como peer exigido pelo `expo-audio`; removida a instalação direta de `expo-modules-core` no PSG e a opção redundante `newArchEnabled` (RN atual sempre usa a Nova Arquitetura).
- O rodapé público agora exibe apenas o link “Termos de uso”, conforme solicitado. A página permite escolher o perfil; os documentos continuam vindo do V3.

## Verificações executadas

- V3: 57 testes passaram; `npm run check` e `npm run security:check` passaram. O smoke HTTP validou página, JS, CSS, logo, health e 404. Permanecem avisos de dependências transitivas e um warning de dependência circular durante testes.
- MTA: typecheck, 3 contratos de suporte, 3 contratos financeiros e `expo install --check` passaram; Expo Doctor 20/21, com aviso remanescente de diretórios nativos Android junto de configuração Expo não sincronizada (revisar manualmente antes de release).
- PSG: estrutura, typecheck, 13 testes Jest, 3 contratos de suporte, lint e `expo install --check` passaram; Expo Doctor 21/21. Os testes usam URL sintética; nenhum valor de `.env` foi exibido.
- Configuração Expo resolvida: `allowBackup=false` e `SYSTEM_ALERT_WINDOW` bloqueado nos dois apps.
- Auditoria completa atual (`npm audit`): MTA 19 (19 altas) e PSG 55 (50 altas, 5 moderadas), sem críticas. Com `--omit=dev`: MTA 19 e PSG 51; esses totais contam vários pacotes da cadeia para os mesmos avisos. Os avisos únicos remanescentes são `braces` (GHSA-vfj7-8cjw-p6xm) e `node-forge` (GHSA-86w9-cpqp-85rv) no MTA; o PSG também tem `sprintf-js` (GHSA-hp3w-g68c-fv3c). Em 19/10/2026, nenhum deles tinha versão corrigida publicada no npm/GitHub Advisory Database. `npm audit fix` compatível foi executado; `--force` foi evitado porque propõe mudanças incompatíveis de React Native/Jest/Worklets. Reavaliar os avisos quando os mantenedores publicarem patches e antes de liberar os toolchains.

## Site: o que falta antes de publicar

1. Substituir e aprovar juridicamente as minutas atuais de termos e privacidade; remover avisos `[PREENCHER]` e só então publicar os documentos definitivos. O backend mantém textos/versionamento por perfil; o rodapé único não funde esses documentos.
2. Registrar domínio oficial, DNS, TLS, redirecionamento HTTP→HTTPS, proteção da origem e configuração do CDN/WAF.
3. Configurar o domínio de produção em `CORS_ORIGINS`, URLs dos apps e configuração do V3; confirmar que credenciais são fornecidas pelo secret manager do host, nunca pelo `.env` local.
4. Publicar os apps e substituir destinos/QR/deep links ainda vazios ou de placeholder pelos links oficiais; validar fallback em Android/iOS e QR em desktop. Se os apps ainda não forem publicados, manter chamadas claramente identificadas como pré-lançamento.
5. Definir canal público real de contato/privacidade/LGPD e atendimento humano; a triagem automática do site não abre chamado nem substitui suporte.
6. Revisar e publicar artigos da FAQ, conferir cada chamada do site em desktop e celular e executar smoke test no domínio de staging/produção.
7. Manter `noindex` durante a preparação. Na publicação: habilitar indexação, sitemap, `robots.txt`, canonical e metadados sociais com o domínio oficial.
8. Configurar monitoramento, alertas, backups/restauração e rollback do host que servirá o site e o V3.

## Antes de operar corridas com público

Além do site, concluir o checklist `LANCA_PUBLICO_CHECKLIST.md`: conformidade municipal e jurídica em Caruaru, seguros, documentos e operação de suporte/incident response, staging, teste ponta a ponta nos aparelhos, carga/concorrência e preparação de pagamentos/saques conforme decisão do produto. O site informativo pode ser publicado antes das lojas apenas se os documentos e contatos públicos estiverem prontos e o conteúdo deixar explícito que o serviço/app ainda não está disponível.
