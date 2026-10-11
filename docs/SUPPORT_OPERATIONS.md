# Central de suporte MOVI — primeira versão

## Experiência prevista

- A triagem automática responde dúvidas frequentes com conteúdo versionado no código. Ela não usa modelo generativo, não acessa dados pessoais e não executa alterações em contas, corridas ou pagamentos.
- A qualquer momento o usuário pode abrir um chamado para uma pessoa da equipe.
- O chamado exige categoria, assunto e descrição do ocorrido. A corrida relacionada é opcional e, quando informada, o backend confirma que quem abriu participou dela.
- A primeira resposta humana tem uma previsão de 24 a 48 horas corridas a partir da abertura. Isso é uma estimativa de resposta inicial, não uma promessa de resolução nesse prazo.
- Segurança é priorizada na fila. A triagem não deve sugerir que a equipe MOVI substitui serviços de emergência nem concluir que uma ocorrência foi investigada.
- Usuário consulta somente os próprios chamados. A equipe autenticada como `admin` pode consultar a fila, responder e alterar estados válidos.

## Estados do chamado

`aberto → em_atendimento → aguardando_usuario → em_atendimento → resolvido → fechado`

Chamados resolvidos podem ser reabertos quando o usuário responde; chamados fechados exigem a abertura de outro. Cada transição administrativa é registrada no log de auditoria sem copiar o texto da conversa.

## Limites desta versão

- Mensagens são texto simples, com até 4.000 caracteres. Não há anexos, envio de documentos ou imagens nesta etapa.
- A fila administrativa e a API estão disponíveis; o painel humano, chatbot nas telas, notificações e integração com e-mail ainda não foram construídos.
- O FAQ é uma triagem por palavras-chave, não um assistente de IA. Casos financeiros, de conta e de segurança sempre oferecem encaminhamento humano.
- O prazo é calculado em horas corridas. Horário de atendimento, feriados, capacidade de equipe e regras finais de resposta precisam ser definidos antes do lançamento.

## Endpoints da primeira versão

- `GET /api/suporte/faq`
- `POST /api/suporte/triagem`
- `POST /api/suporte/chamados`
- `GET /api/suporte/chamados`
- `GET /api/suporte/chamados/:id`
- `POST /api/suporte/chamados/:id/mensagens`
- `GET /api/admin/suporte/chamados`
- `GET /api/admin/suporte/chamados/:id`
- `POST /api/admin/suporte/chamados/:id/mensagens`
- `PATCH /api/admin/suporte/chamados/:id/status`

As rotas de usuário exigem autenticação e continuam acessíveis para contas suspensas ou restritas, para que a pessoa consiga pedir ajuda.
