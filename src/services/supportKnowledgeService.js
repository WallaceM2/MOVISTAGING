const ARTICLES = [
  {
    id: 'corrida_andamento', categoria: 'corrida',
    titulo: 'Acompanhar ou finalizar uma corrida',
    palavras: ['corrida', 'viagem', 'motorista', 'passageiro', 'atraso', 'localizacao', 'mapa', 'rota', 'embarque'],
    resposta: 'Abra a corrida ativa no app para acompanhar o status. O motorista só inicia depois de validar o código de embarque. Se o status não atualizar, atualize a tela e tente novamente. Se o problema continuar, abra um chamado e informe o código da corrida.',
  },
  {
    id: 'conferir_valor_corrida', categoria: 'pagamento',
    titulo: 'Onde posso conferir o valor da corrida?',
    palavras: ['conferir', 'valor da corrida', 'forma de pagamento', 'detalhes da corrida'],
    resposta: 'Confira o valor e a forma de pagamento exibidos nos detalhes da corrida no aplicativo.',
  },
  {
    id: 'pagamento_dinheiro', categoria: 'pagamento',
    titulo: 'Como funciona o pagamento em dinheiro?',
    palavras: ['dinheiro', 'valor recebido', 'motorista registra'],
    resposta: 'Quando a corrida é paga em dinheiro, o motorista registra o valor recebido no aplicativo.',
  },
  {
    id: 'consultar_ganhos', categoria: 'pagamento',
    titulo: 'Onde posso consultar meus ganhos?',
    palavras: ['ganhos', 'extrato', 'carteira interna'],
    resposta: 'Consulte o extrato para acompanhar os ganhos das corridas concluídas. Os valores registrados na carteira interna são apresentados separadamente.',
  },
  {
    id: 'contestar_valor', categoria: 'pagamento',
    titulo: 'Como posso contestar um valor?',
    palavras: ['contestar', 'contestacao', 'lancamento', 'nao reconhece', 'nao reconheco', 'valor em questao'],
    resposta: 'Se identificar uma cobrança ou um lançamento que não reconhece, entre em contato com o suporte pelo aplicativo e informe o código da corrida e o valor em questão. A equipe poderá analisar o caso.',
  },
  {
    id: 'cancelamento', categoria: 'corrida',
    titulo: 'O que acontece se eu cancelar uma corrida?',
    palavras: ['cancelar', 'cancelamento', 'desistir', 'desisti'],
    resposta: 'Se um motorista já aceitou e você cancelar 180 segundos ou mais depois do aceite, será registrada uma taxa de R$ 3,00. Antes de confirmar, o app informa essa cobrança. Sem motorista aceito, a taxa não se aplica. Para contestar um lançamento, abra um chamado com o código da corrida.',
  },
  {
    id: 'conta_acesso', categoria: 'conta',
    titulo: 'O que fazer se eu não conseguir acessar minha conta?',
    palavras: ['conta', 'senha', 'login', 'acesso', 'bloqueada', 'suspensa', 'cadastro', 'documento', 'aprovacao'],
    resposta: 'Confira se o e-mail e a senha estão corretos e se os documentos solicitados estão atualizados. Se sua conta estiver indisponível ou você não conseguir entrar, abra um chamado sobre sua conta. O suporte humano poderá verificar o caso em até 24 horas.',
  },
  {
    id: 'seguranca', categoria: 'seguranca',
    titulo: 'Segurança durante uma corrida',
    palavras: ['seguranca', 'perigo', 'ameaca', 'assedio', 'agressao', 'acidente', 'roubo', 'violencia'],
    resposta: 'Se houver perigo imediato, procure os serviços de emergência locais. Para relatar uma ocorrência ao MOVI, use a opção de denúncia vinculada à corrida e descreva o que aconteceu. O chatbot não investiga nem decide medidas de segurança; o caso precisa de análise humana.',
  },
  {
    id: 'sem_resposta', categoria: 'outro',
    titulo: 'Falar com o suporte',
    palavras: [],
    resposta: 'Não encontrei uma orientação segura para essa dúvida. Abra um chamado para a equipe MOVI e informe o que aconteceu, quando ocorreu e, se houver, o código da corrida.',
  },
];

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function triage(question) {
  const normalized = normalize(question);
  const ordered = [...ARTICLES].sort((left, right) => Number(right.id === 'seguranca') - Number(left.id === 'seguranca'));
  const article = ordered.find((candidate) => candidate.palavras.some((word) => normalized.includes(word))) || ARTICLES.find(({ id }) => id === 'sem_resposta');
  return {
    artigo_id: article.id,
    categoria_sugerida: article.categoria,
    titulo: article.titulo,
    resposta: article.resposta,
    sugerir_chamado: true,
    resolvido_pelo_bot: false,
  };
}

function listArticles() {
  return ARTICLES.filter(({ id }) => id !== 'sem_resposta').map(({ id, categoria, titulo, resposta }) => ({ id, categoria, titulo, resposta }));
}

module.exports = { triage, listArticles };
