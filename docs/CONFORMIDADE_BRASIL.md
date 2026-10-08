# Movi — Matriz de conformidade Brasil

> Material técnico-operacional para orientar implementação. Não é parecer jurídico.

| Tema | Referência/risco | O que o produto deve fazer |
|---|---|---|
| Transporte privado individual | Lei 13.640/2018 / Lei 12.587 | Tratar autorização e fiscalização por Município/DF; manter requisitos locais por área de operação. |
| Motorista | Lei 13.640/2018, art. 11-B | Validar CNH com EAR, veículo conforme regras locais, CRLV e antecedentes, além dos requisitos municipais. |
| Seguro | Lei setorial + regras atuais | Não hardcodar uma conclusão sobre DPVAT/SPVAT; validar seguros obrigatórios e coberturas com jurídico/seguradora e município. |
| Consumidor | CDC | Informar preço, características, riscos, regras de cobrança, cancelamento e canais de atendimento de modo claro. |
| LGPD | Lei 13.709/2018 | Inventário de dados, bases legais, minimização, acesso restrito, retenção, contratos com operadores, direitos do titular e segurança. |
| Incidentes | Resolução CD/ANPD nº 15/2024 | Ter plano de resposta e fluxo para avaliação/comunicação de incidentes relevantes. |
| Encarregado | Resolução CD/ANPD nº 18/2024 | Definir canal e atribuições do encarregado conforme enquadramento da empresa. |
| Transferência internacional | Resolução CD/ANPD nº 19/2024 | Mapear fornecedores estrangeiros e aplicar mecanismo legal apropriado. |
| Registros de acesso | Marco Civil, art. 15 | Manter os registros de acesso à aplicação pelo prazo legal, sob sigilo e segurança, observadas as regras aplicáveis. |
| Pagamentos | Provedor de pagamento + regras contratuais | Não confiar no app; confirmar por backend/webhook e manter ledger/idempotência. |
| Tributos/fiscal | Município/União | Definir estrutura societária, emissão fiscal, ISS e obrigações do modelo com contador. |

## Ponto crítico sobre operação nacional

A Lei 13.640/2018 atribui exclusivamente aos Municípios e ao Distrito Federal a regulamentação e fiscalização do transporte remunerado privado individual em seus territórios. Portanto, "nacional" deve significar uma arquitetura capaz de operar várias cidades, mas cada nova cidade precisa passar por uma etapa própria de habilitação/regulação.

A legislação federal também estabelece diretrizes relacionadas a tributos, seguro e inscrição do motorista como contribuinte individual do INSS, além dos requisitos de habilitação, veículo, CRLV e antecedentes previstos no art. 11-B. O município pode estabelecer requisitos adicionais.

## Seguro: cuidado com versões antigas

A Lei 13.640/2018 contém referência ao DPVAT. O cenário federal mudou posteriormente: a LC 207/2024 instituiu o SPVAT, mas a LC 211/2024 revogou a LC 207/2024. Por isso, o Movi não deve publicar uma promessa contratual baseada simplesmente em um texto antigo; a cobertura efetivamente exigida deve ser confirmada com jurídico, seguradora e município da operação.
