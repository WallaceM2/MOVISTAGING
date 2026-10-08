# Auditoria e endurecimento do MOVI Backend

## Escopo

Esta versão foi revisada para um cenário real com aplicativo móvel, API HTTP/WebSocket, Render, Supabase PostgreSQL/Storage, Redis e Mapbox.

## Principais correções

- Autenticação JWT unificada, autorização por tipo e bloqueio de contas indisponíveis.
- Access token curto e refresh token rotativo, persistido somente como hash.
- Proteção contra refresh concorrente.
- Idempotência persistente para operações críticas.
- Socket.IO autenticado; identidade vem do token, não de IDs confiados no payload.
- Presença e disponibilidade de motoristas com TTL/heartbeat.
- Redis GEO separado por categoria de veículo.
- Redis Pub/Sub para realtime entre múltiplas instâncias.
- Máquina de estados de corrida e verificação de propriedade.
- Aceitação condicionada à oferta daquele motorista e proteção concorrente.
- Timeout/redispatch das ofertas e recuperação de ofertas após reconexão.
- Corridas sem motorista podem permanecer em busca por período limitado antes de expirar.
- Finalização financeira transacional e protegida contra processamento duplicado.
- Pagamento digital não é considerado pago somente por declaração do app.
- Documentos armazenados em bucket privado do Supabase e expostos somente por URL assinada temporária.
- Upload com limite, allowlist de MIME e validação de assinatura de arquivo.
- Auditoria de ações administrativas.
- Avaliação e denúncia vinculadas à participação real na corrida.
- Dados de conta e documentos não ficam em endpoints públicos.
- Worker separado para despacho, expiração e manutenção.
- Migrations versionadas com checksum para detectar alteração de migration já aplicada.
- Health checks liveness/readiness.
- Logs com request ID.
- Configuração explícita de ambiente para Render/Supabase/Redis.
- Remoção de artefatos legados de upload e autenticação.

## Validações executadas

- 6 testes unitários passando.
- Checagem de sintaxe JavaScript passando.
- 60 módulos JavaScript importados sem erro no ambiente de validação.
- Blueprint do Render validado estruturalmente.
- Arquivos secretos/credenciais excluídos do pacote final.

## Estado para lançamento

O backend está endurecido para staging e preparação de produção. O lançamento público ainda depende de etapas externas ao código: executar a migration no Supabase de produção, configurar Redis/Render/Storage, integrar um provedor de pagamentos para Pix/cartão, realizar testes de carga/falha, e concluir as obrigações operacionais, contratuais e regulatórias aplicáveis ao serviço.
