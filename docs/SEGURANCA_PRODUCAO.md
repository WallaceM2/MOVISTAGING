# MOVI — Segurança de produção

O objetivo é reduzir drasticamente a superfície de ataque. Nenhum software pode ser considerado absolutamente imune a ataques; o controle correto é por camadas, monitoramento e resposta.

## Aplicação

- JWT curto + refresh token rotativo e revogável.
- Algoritmo JWT fixado no backend.
- Senhas com hash lento (`bcrypt` com custo 12 na versão atual).
- Rate limit distribuído via Redis; autenticação falha fechado se o Redis de rate limit estiver indisponível.
- Helmet e limite de body.
- Validação de entrada com Zod.
- Erros internos não retornam stack trace em produção.
- Idempotência nas operações sensíveis.
- Auditoria de alterações administrativas.

## Corridas

- A categoria da corrida deve ser igual à categoria do veículo/motorista.
- Ofertas são individualizadas por motorista.
- Aceitação é protegida por lock e índice único.
- Motorista só pode manter uma corrida ativa.
- Passageiro só pode manter uma corrida ativa.
- Estados só podem seguir transições permitidas.
- O motorista só pode alterar uma corrida da qual participa.

## Realtime

- Socket.IO exige JWT válido.
- O ID do usuário vem do token; não do payload de localização.
- Localização de viagem só é aceita para motorista autenticado e vinculado à corrida.
- Presença usa TTL/heartbeat.
- Redis não é a fonte permanente de dados financeiros ou cadastrais.

## Dados sensíveis

- Documentos devem ficar em bucket privado.
- A API entrega somente URLs temporárias e autorizadas.
- Não guardar documentos em disco efêmero da infraestrutura.
- Não registrar CPF, CNH, token ou conteúdo documental em logs.

## Banco

- Queries parametrizadas.
- Foreign keys.
- Índices únicos para invariantes críticas.
- CHECK constraints para domínio e divisão financeira.
- Transações para alterações financeiras.
- Ledger de transações do motorista.

## Infraestrutura futura recomendada

- DNS/CDN/WAF na frente da API.
- TLS obrigatório.
- Segredos somente no secret manager da hospedagem.
- Banco sem exposição pública desnecessária.
- Redis com TLS e senha/ACL.
- Backups automáticos e teste periódico de restauração.
- Alertas para picos de erro, login, criação de conta, pagamentos e incidentes.
- Separação entre API HTTP e worker.
- CI com testes, lint, dependency audit e secret scanning.

## Conta administrativa

Para produção pública, administração deve receber MFA, sessão curta, trilha de auditoria e princípio do menor privilégio. O recurso deve ser concluído antes de qualquer operação administrativa em massa.

## Resposta a incidentes

Manter registro de incidentes, responsáveis, evidências, medidas de contenção e comunicação. A empresa deve ter procedimento compatível com a LGPD e com a Resolução CD/ANPD nº 15/2024.
