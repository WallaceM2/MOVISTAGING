# MOVI — Checklist antes de tornar público

## Jurídico e regulatório

- [ ] Pessoa jurídica, contratos e CNPJ definidos.
- [ ] Cada Município/DF da operação validado.
- [ ] Área de operação configurada e validada para a cidade/UF.
- [ ] Requisitos de motorista e veículo conferidos localmente.
- [ ] Interpretar com AMC/assessoria jurídica o efeito das Leis Municipais 7.356/2025 (motociclistas e identificação de apps) e 7.357/2025 (áreas de táxi) para o modelo MOVI.
- [ ] Seguros e coberturas confirmados com seguradora/jurídico.
- [ ] Política tributária e emissão fiscal definida.
- [ ] Termos de usuário publicados e versionados.
- [ ] Termos do motorista publicados e versionados.
- [ ] Aceite de termos/política de privacidade versionado e registrado no backend.
- [ ] Aviso de privacidade publicado.
- [ ] Encarregado/DPO e canal LGPD definidos.
- [ ] Procedimento de incidente definido.

## Segurança

- [ ] Segredos fora do Git.
- [ ] MFA administrativo implementado.
- [ ] WAF/CDN e proteção de origem definidos.
- [ ] Backups testados e restauração validada.
- [ ] Logs e alertas ativos.
- [ ] Rotação de secrets validada.
- [ ] Testes de carga executados.
- [ ] Testes de concorrência de corridas executados.
- [ ] Testes de pagamento duplicado executados.

## Financeiro

- [ ] Provedor de pagamento escolhido.
- [ ] KYC/KYB dos parceiros definido.
- [ ] Split/repasse validado.
- [ ] Webhooks assinados e idempotentes.
- [ ] Ledger conciliado com o provedor.
- [ ] Saques implementados e auditados.
- [ ] Regras para dinheiro, débito, contestação e reembolso publicadas.

## Produto e segurança do passageiro

- [x] Identidade do motorista e veículo aprovado exibida no app do passageiro após aceite.
- [x] Código de embarque validado no servidor, com limite de tentativas.
- [x] Compartilhamento de viagem com link temporário, revogável e sem localização após encerramento.
- [ ] Configurar `SHARE_PUBLIC_BASE_URL` HTTPS e testar envio/abertura do link em Android e iOS.
- [x] Registro e envio de push Expo com conteúdo mínimo e desativação de tokens inválidos.
- [ ] Configurar credenciais de push no EAS e validar tickets/recibos nos dois sistemas operacionais.
- [x] Localização do motorista em segundo plano enviada por endpoint autenticado; backend aceita somente motorista aprovado, ativo, online ou vinculado a corrida ativa.
- [ ] Validar permissão “Sempre”, tela bloqueada, perda de rede, recuperação, encerramento pelo sistema e revogação de permissão em dispositivos Android/iOS.
- [ ] Canal de suporte disponível.
- [x] Envio de relato de incidente pelo passageiro e motorista, vinculado à corrida e sujeito a análise administrativa.
- [ ] Plantão/canal operacional de resposta a incidentes definido e testado.
- [ ] Categoria carro/moto validada de ponta a ponta.
- [ ] Corrida expirada/sem motorista tratada no frontend.
