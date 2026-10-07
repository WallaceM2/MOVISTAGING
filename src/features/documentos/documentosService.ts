import { apiFetch } from '@/api/http';

export type PassengerDocumentType = 'rg' | 'cnh' | 'foto_perfil';

export async function uploadPassengerDocuments(files: Partial<Record<PassengerDocumentType, { uri: string; name: string; mimeType: string }>>) {
  const form = new FormData();
  for (const [field, file] of Object.entries(files)) {
    if (!file) continue;
    form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  return apiFetch<{ mensagem: string; passageiro: Record<string, unknown>; documentos: Record<string, string> }>('/api/passageiros/documentos', {
    method: 'POST',
    body: form,
  });
}

export function getPassengerDocumentUrl(passengerId: number, document: PassengerDocumentType) {
  return apiFetch<{ url: string; expires_in: number }>(`/api/documentos/passageiro/${passengerId}/${document}?expires_in=300`);
}
