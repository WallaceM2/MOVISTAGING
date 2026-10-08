# MOVI — Migração e conferência do Supabase

## Ordem

O runner aplica automaticamente, em ordem lexicográfica, todas as migrations `.sql` ainda não registradas. O conjunto atual vai de `000` até `008`:

```text
000_initial_schema.sql
001_production_hardening.sql
002_canonical_data_model.sql
003_vehicle_consent_model.sql
004_production_data_integrity.sql
005_security_runtime_hardening.sql
006_driver_document_reverification.sql
007_secure_boarding_code.sql
008_push_and_trip_sharing.sql
```

O runner lê `MIGRATIONS_DATABASE_URL` (ou `DATABASE_URL` se a primeira estiver vazia), grava nome do arquivo + SHA-256 em `movi_schema_migrations` e usa advisory lock para impedir duas migrações concorrentes. Ele não reaplica migrations já registradas e interrompe se o hash de uma migration aplicada tiver mudado.

## Ambiente de testes

Configure `DATABASE_URL` e, se necessário, `MIGRATIONS_DATABASE_URL` no `.env` do backend. Use primeiro um banco de desenvolvimento/staging; não aponte para produção durante os testes. Execute na pasta `MOVI V3`:

```bash
npm run migrate
npm run db:check
```

`npm run migrate` deve imprimir cada migration aplicada. Se disser que não há novas migrations, confira a tabela `movi_schema_migrations`. `npm run db:check` deve concluir sem erros antes de ligar os aplicativos a esse banco.

O `db:check` valida tabelas essenciais, colunas centrais, tarifas, divisão 15/85, corridas ativas duplicadas e compatibilidade de categoria de veículos.

## Importante em banco já usado

A migração adiciona constraints e índices que podem revelar dados antigos inconsistentes. Isso é desejável: o sistema não deve apagar, escolher ou corrigir silenciosamente uma operação financeira/operacional ambígua.

Exemplos de bloqueios que devem ser corrigidos antes de um novo deploy:

- passageiro com duas corridas ativas;
- motorista associado a duas corridas ativas;
- veículo com categoria diferente da categoria aprovada do motorista;
- CPF, CNH, email ou placa duplicados;
- tarifa sem divisão 15/85;
- valores financeiros que não fecham entre bruto, taxa e repasse.

## Supabase

O aplicativo móvel não deve possuir acesso direto à Service Role Key. O backend é o componente autorizado a acessar banco e Storage privado.

Para produção real, crie backup antes da primeira migração de um banco existente e faça a execução primeiro em staging com uma cópia representativa dos dados. No Supabase/Render, use uma conexão PostgreSQL compatível com sessões (Session Pooler quando aplicável), conforme a configuração do provedor; mantenha banco e segredos apenas no backend.
