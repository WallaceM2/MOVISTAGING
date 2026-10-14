import { apiFetch, idempotencyKey } from '@/api/http';

export type SupportCategory = 'corrida' | 'pagamento' | 'conta' | 'seguranca' | 'outro';
export type SupportStatus = 'aberto' | 'em_atendimento' | 'aguardando_usuario' | 'resolvido' | 'fechado';

export type SupportArticle = { id: string; categoria: SupportCategory; titulo: string; resposta: string };
export type SupportMessage = { id: number; autor_tipo: 'passageiro' | 'motorista' | 'admin'; mensagem: string; criado_em: string };
export type SupportTicket = {
  id: number; corrida_id: number | null; categoria: SupportCategory; assunto: string; status: SupportStatus;
  prioridade: string; criado_em: string; atualizado_em?: string; ultima_mensagem?: string; mensagens?: SupportMessage[];
};
export type SupportTriage = {
  artigo_id: string; categoria_sugerida: SupportCategory; titulo: string; resposta: string;
  sugerir_chamado: boolean; resolvido_pelo_bot: false;
};

export function listSupportFaq() {
  return apiFetch<{ artigos: SupportArticle[] }>('/api/suporte/faq');
}

export function triageSupportQuestion(pergunta: string) {
  return apiFetch<SupportTriage>('/api/suporte/triagem', { method: 'POST', body: JSON.stringify({ pergunta }) });
}

export function listSupportTickets() {
  return apiFetch<{ dados: SupportTicket[]; pagina: { limit: number; offset: number } }>('/api/suporte/chamados');
}

export function getSupportTicket(id: number) {
  return apiFetch<{ chamado: SupportTicket }>(`/api/suporte/chamados/${id}`);
}

export function createSupportTicket(input: { categoria: SupportCategory; assunto: string; mensagem: string; corrida_id?: number }) {
  return apiFetch<{ mensagem: string; chamado: SupportTicket; previsao_resposta_humana_horas: { minimo: number; maximo: number } }>('/api/suporte/chamados', {
    method: 'POST', body: JSON.stringify(input), idempotencyKey: idempotencyKey('support-ticket'),
  });
}

export function sendSupportMessage(id: number, mensagem: string) {
  return apiFetch<{ mensagem: string }>(`/api/suporte/chamados/${id}/mensagens`, {
    method: 'POST', body: JSON.stringify({ mensagem }), idempotencyKey: idempotencyKey('support-message'),
  });
}
