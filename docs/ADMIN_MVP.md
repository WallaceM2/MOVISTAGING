# MOVI Admin MVP

## Objetivo

O primeiro painel é uma área web interna, servida pelo V3 em `/admin/`. O dashboard é somente de consulta: mostra indicadores operacionais e financeiros agregados e as oito corridas mais recentes, sem endereços ou nomes de passageiros e motoristas.

## Abrir a prévia

1. Com o backend disponível, abra `http://localhost:3000/admin/` no navegador ou no painel de navegador do VS Code.
2. Entre com uma conta administrativa já cadastrada no V3. Contas comuns de passageiro e motorista não autenticam neste painel.

Para a moldura de celular, abra `http://localhost:3000/admin/phone-preview.html`. Os controles ajustam a largura do viewport e recarregam o painel real dentro do aparelho. Use o mesmo host e porta do V3; caso esteja na porta 3001, por exemplo, troque `3000` por `3001`.

## Criar uma conta administrativa própria

O V3 não oferece cadastro público de administradores. Em um terminal PowerShell aberto na pasta do V3, execute `node.exe .\scripts\createAdmin.js`. O comando pede nome, e-mail e senha em modo interativo; a senha fica oculta, exige no mínimo 12 caracteres e é armazenada apenas como hash bcrypt. O script recusa e-mails que já existam e nunca substitui senhas.

O script usa a conexão `DATABASE_URL` configurada no ambiente local, portanto confira se o `.env` aponta para o banco MOVI pretendido antes de executá-lo. Não cole senha, token ou URL do banco no chat.

O painel usa os mesmos arquivos servidos pelo backend e adapta o layout para telas estreitas. Após salvar alterações em HTML, CSS ou JavaScript, atualize a página para ver a versão nova. A prévia não usa servidor público nem expõe o app à rede local.

## Dados apresentados

- Corridas solicitadas, concluídas e canceladas no dia, mês e ano de Caruaru (`America/Fortaleza`).
- Tarifa contratada das corridas concluídas, comissão gravada no ledger e adiantamentos previstos ainda marcados como pendentes.
- Corridas ativas, motoristas disponíveis, passageiros ativos, ocorrências abertas e débitos pendentes.
- Corridas recentes com identificador, categoria, situação, método de pagamento, valor e horário.

Tarifas e comissões são valores operacionais persistidos pelo V3. Enquanto o provedor não estiver habilitado, o painel informa que esses números não provam liquidação, caixa recebido pela MOVI ou disponibilidade para saque.

## Segurança e limites desta etapa

- O frontend não inclui link do painel em páginas públicas; o endpoint de dados exige token administrativo do V3, conta ativa e resposta `Cache-Control: no-store`.
- A interface é somente leitura. Não há ações para ajustar carteira, estado de pagamento, corrida ou lançamento do ledger.
- A moldura móvel é uma prévia responsiva do site no navegador, não é um emulador Android e não valida sensores, teclado nativo, notificações ou comportamento de AVD.
- A hierarquia detalhada de cargos e permissões por função ainda precisa ser implementada antes de criar acessos para uma equipe. Nesta versão vale a barreira existente de conta do tipo `admin`; não usar o painel como autorização de produção multiusuário até essa etapa estar pronta.
- O token de acesso fica somente em `sessionStorage` e é apagado ao sair/fechar a sessão do navegador. Para publicação, revisar o modelo de sessão web e aplicar MFA às contas administrativas.
- A API continua sendo a fonte da verdade; ocultar controles no navegador nunca substitui autorização no backend.
