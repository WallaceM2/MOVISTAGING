import { apiFetch, idempotencyKey } from "@/api/http";
import type { Driver } from "@/store/authStore";

export async function getDriverProfile() {
  const response = await apiFetch<{ motorista: Driver }>("/api/motoristas/perfil");
  return response.motorista;
}

export function changePassword(senha_atual: string, nova_senha: string) {
  return apiFetch<{ sucesso: boolean; mensagem: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ senha_atual, nova_senha }),
    idempotencyKey: idempotencyKey("password-change"),
  });
}

export type DriverDocument = "rg" | "cnh" | "foto_perfil" | "documento_veiculo";

export async function uploadDriverDocuments(files: Partial<Record<DriverDocument, { uri: string; name: string; mimeType: string }>>) {
  const form = new FormData();
  for (const [field, file] of Object.entries(files)) {
    if (file) form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  return apiFetch<{ mensagem: string; motorista: Driver }>("/api/motoristas/documentos", {
    method: "POST",
    body: form,
  });
}

export function getDriverDocumentUrl(driverId: number, document: DriverDocument) {
  return apiFetch<{ url: string; expires_in: number }>(`/api/documentos/motorista/${driverId}/${document}?expires_in=300`);
}
