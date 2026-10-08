# Checklist de Produção — MOVI

## Render

- [ ] Conectar o repositório e usar `render.yaml`.
- [ ] Confirmar serviço `movi-api` como Web Service.
- [ ] Confirmar serviço `movi-worker` como Background Worker.
- [ ] Configurar `NODE_ENV=production`.
- [ ] Configurar `NODE_VERSION=24.21.0`.
- [ ] Configurar Environment Groups ou Environment Variables sem versionar segredos.
- [ ] Confirmar `/health/ready` como health check.
- [ ] Configurar domínio customizado e HTTPS.
- [ ] Verificar logs após deploy.

## Supabase Database

- [ ] Criar/confirmar projeto PostgreSQL.
- [ ] Preferir Session Pooler IPv4 quando necessário para a Render.
- [ ] Configurar `DATABASE_URL`.
- [ ] Configurar `MIGRATIONS_DATABASE_URL`.
- [ ] Executar a migration `001_production_hardening.sql` pelo comando `npm run migrate`.
- [ ] Confirmar índices e tabelas `movi_*`.
- [ ] Configurar estratégia de backup e recuperação.

## Supabase Storage

- [ ] Criar bucket privado `movi-private`.
- [ ] Nunca transformar documentos pessoais em bucket público.
- [ ] Configurar `SUPABASE_URL`.
- [ ] Configurar `SUPABASE_SERVICE_ROLE_KEY` somente na Render.
- [ ] Testar upload, URL assinada e substituição de documento.

## Redis

- [ ] Criar Redis gerenciado.
- [ ] Configurar `REDIS_URL`.
- [ ] Usar TLS quando fornecido pelo provedor.
- [ ] Testar presença de motorista.
- [ ] Testar expiração de presença.
- [ ] Testar dispatch/redispatch.
- [ ] Testar eventos Socket.IO com duas instâncias da API.

## Segurança

- [ ] Gerar novo `JWT_SECRET` aleatório com pelo menos 32 caracteres.
- [ ] Configurar CORS somente para origens realmente usadas.
- [ ] Confirmar que não existe `.env` no Git.
- [ ] Confirmar que a Service Role Key nunca chega ao aplicativo móvel.
- [ ] Confirmar bucket de documentos privado.
- [ ] Testar tentativas de acesso a corrida de outro usuário.
- [ ] Testar aceitação da mesma corrida por dois motoristas.
- [ ] Testar replay do mesmo `Idempotency-Key`.
- [ ] Testar refresh token usado simultaneamente em duas requisições.
- [ ] Testar conta suspensa/banida.

## Pagamentos

- [ ] Escolher provedor.
- [ ] Criar adapter de pagamento.
- [ ] Criar cobrança server-side.
- [ ] Validar webhook assinado.
- [ ] Persistir ID da cobrança e evento externo.
- [ ] Tornar o webhook idempotente.
- [ ] Confirmar pagamento antes de concluir a corrida digital.
- [ ] Implementar conciliação.
- [ ] Implementar quitação de débito somente após confirmação do provedor.

## Operação e LGPD

- [ ] Definir responsável pelo tratamento de dados/atendimento ao titular.
- [ ] Publicar política de privacidade e termos.
- [ ] Definir prazos de retenção para documentos e localização.
- [ ] Definir processo de exclusão/anonymização quando juridicamente possível.
- [ ] Definir processo de resposta a incidentes.
- [ ] Configurar monitoramento e alertas.
- [ ] Testar restauração de backup.

## Go-live

Somente liberar pagamentos digitais e operação pública após os itens de segurança, infraestrutura, financeiro e conformidade terem sido validados em ambiente de homologação.
