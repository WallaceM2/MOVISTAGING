# MOVI — Dicionário de dados e fonte de verdade

Este arquivo descreve as tabelas centrais do MOVI. A aplicação deve tratar o PostgreSQL como fonte de verdade para estado, dinheiro, tarifas, identidade operacional e auditoria.

## Identidade

### `passageiros`
Usuários passageiros. Dados cadastrais, conta, documentos privados referenciados por `storage://`, rating e débito.

### `motoristas`
Parceiros/motoristas. Dados cadastrais, categoria aprovada (`carro`/`moto`), verificação documental, presença operacional, saldo e bloqueio de dinheiro.

### `admins`
Contas administrativas. Nunca devem ser usadas pelo aplicativo do passageiro/motorista.

## Operação

### `movi_veiculos`
Veículo operacional vinculado a um motorista. Um motorista pode ter histórico de veículos, mas apenas um veículo ativo por vez. A categoria do veículo precisa ser igual à categoria aprovada do motorista.

### `movi_areas_operacao`
Áreas/cidades onde o MOVI está habilitado. Cada área pode habilitar carro e/ou moto e precisa ser validada com os requisitos locais antes do lançamento.

### `movi_tarifas`
Fonte de verdade das tarifas. Pode existir uma tarifa global e tarifas específicas por área. Toda corrida deve guardar um snapshot da tarifa aplicada para auditoria histórica.

## Corridas e despacho

### `corridas`
Contrato operacional da viagem. Guarda origem/destino, categoria, motorista, status, distância, tempo, valor bruto, taxa do MOVI, repasse do parceiro, forma/status de pagamento, código de embarque, área de operação e snapshot da tarifa.

### `corrida_ofertas`
Ofertas individualizadas para motoristas. A corrida nunca deve ser considerada aceita só porque o ID da corrida foi informado; a oferta e o motorista precisam corresponder.

## Financeiro

### `movi_pagamentos`
Estado do pagamento externo. Esta tabela representa o ciclo do gateway e não deve ser alterada diretamente pelo frontend.

### `movi_lancamentos_financeiros`
Ledger financeiro de dupla referência. Toda movimentação financeira relevante deve ter uma referência única quando a operação precisar ser idempotente.

### `transacoes_motoristas`
Extrato operacional legado/compatível da carteira do motorista, usado enquanto o ledger completo é consolidado.

### `movi_saques_motoristas`
Solicitações de saque do saldo do parceiro.

### `ocorrencias_pagamento`
Diferenças de pagamentos, principalmente corridas em dinheiro com valor recebido inferior ao contratado.

## Segurança, confiança e conformidade

### `movi_aceites_termos`
Evidência de aceite de termos/políticas com versão, hash, IP, user-agent e timestamp.

### `movi_contatos_confianca`
Contatos de confiança definidos pelo usuário para recursos de segurança.

### `movi_eventos_seguranca`
Eventos de segurança relacionados a corridas/usuários.

### `movi_incidentes_seguranca`
Registro interno de incidentes e plano de resposta.

### `movi_solicitacoes_titular`
Solicitações relacionadas aos direitos dos titulares de dados.

## Regras econômicas atuais

- MOVI: **15% do valor bruto**.
- Parceiro: **85% do valor bruto**.
- Piso líquido inicial da moto: **R$ 1,00/km**.
- Piso líquido inicial do carro: **R$ 1,50/km**.
- Meta comercial configurada para carro: **R$ 2,00/km**.

Esses pisos são tratados como piso líquido do parceiro. Portanto, com 15% de comissão, o bruto necessário é maior que o piso líquido. A aplicação calcula o valor bruto e grava o resultado na corrida.

## Segurança do modelo

O banco também protege:

- uma corrida ativa por passageiro;
- uma corrida ativa por motorista;
- uma oferta ativa por corrida;
- categoria da corrida × categoria do motorista;
- categoria do veículo × categoria do motorista;
- divisão 15/85;
- unicidade de CPF/CNH/email;
- unicidade de referências financeiras;
- auditoria e consentimentos versionados.
