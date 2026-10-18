import { apiFetch, idempotencyKey } from '@/api/http';

export type RideChatMessage = {
  id: number;
  corrida_id: number;
  remetente_tipo: 'motorista' | 'passageiro';
  remetente_id: number;
  client_message_id: string;
  tipo: 'texto' | 'imagem' | 'audio';
  mensagem: string | null;
  midia_mime_type: string | null;
  midia_url: string | null;
  criado_em: string;
};

export function getRideChat(rideId: number) {
  return apiFetch<{ mensagens: RideChatMessage[]; proximo_before_id: number | null }>(`/api/corridas/${rideId}/chat?limit=50`);
}

export function sendRideChatText(rideId: number, text: string, operationKey = idempotencyKey('ride-chat')) {
  return apiFetch<{ mensagem: RideChatMessage }>(`/api/corridas/${rideId}/chat`, {
    method: 'POST', body: JSON.stringify({ client_message_id: operationKey, tipo: 'texto', mensagem: text }), idempotencyKey: operationKey,
  });
}

export function sendRideChatMedia(rideId: number, media: { uri: string; name: string; mimeType: string; type: 'imagem' | 'audio' }, operationKey = idempotencyKey('ride-chat')) {
  const form = new FormData();
  form.append('client_message_id', operationKey);
  form.append('tipo', media.type);
  form.append('arquivo', { uri: media.uri, name: media.name, type: media.mimeType } as unknown as Blob);
  return apiFetch<{ mensagem: RideChatMessage }>(`/api/corridas/${rideId}/chat`, { method: 'POST', body: form, idempotencyKey: operationKey });
}
