const ARTICLES = [
  {
    id: 'corrida_andamento', categoria: 'corrida',
    titulo: 'Acompanhar ou finalizar uma corrida',
    palavras: ['corrida', 'viagem', 'motorista', 'passageiro', 'atraso', 'localizacao', 'mapa', 'rota', 'embarque'],
    resposta: 'Abra a corrida ativa no app para acompanhar o status. O motorista só inicia depois de validar o código de embarque. Se o status não atualizar, atualize a tela e tente novamente; se continuar, abra um chamado informando o número da corrida.',
  },
  {
    id: 'pagamento_dinheiro', categoria: 'pagamento',
    titulo: 'Pagamento e valores da corrida',
    palavras: ['pagamento', 'dinheiro', 'pix', 'cartao', 'cobranca', 'cobrado', 'valor', 'preco', 'tarifa', 'carteira', 'ganho', 'comissao'],
    resposta: 'Confira o valor e a forma de pagamento na corrida. No pagamento em dinheiro, o motorista registra o valor que recebeu; o ganho das corridas concluídas e a carteira são itens separados no extrato. Para contestar um valor, abra um chamado com o número da corrida e o valor envolvido.',
  },
  {
    id: 'cancelamento', categoria: 'corrida',
    titulo: 'Cancelar uma corrida',
    palavras: ['cancelar', 'cancelamento', 'desistir', 'desisti'],
    resposta: 'As opções de cancelamento dependem do status atual da corrida. Consulte a tela da viagem; se o app não permitir ou houver cobrança que você deseja contestar, abra um chamado e informe o número da corrida.',
  },
  {
    id: 'conta_acesso', categoria: 'conta',
    titulo: 'Acesso ou situação da conta',
    palavras: ['conta', 'senha', 'login', 'acesso', 'bloqueada', 'suspensa', 'cadastro', 'documento', 'aprovacao'],
    resposta: 'Confira se o e-mail e a senha estão corretos e se os documentos solicitados estão atualizados. Se sua conta estiver indisponível ou você não conseguir entrar, abra um chamado de conta; o suporte humano poderá verificar seu caso.',
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
    resposta: 'Não encontrei uma orientação segura para essa dúvida. Abra um chamado para a equipe MOVI e informe o que aconteceu, quando ocorreu e, se houver, o número da corrida.',
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
