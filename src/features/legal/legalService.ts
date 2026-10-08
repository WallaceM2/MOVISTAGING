import { apiFetch, idempotencyKey } from "@/api/http";

export type LegalDocument = { documentoTipo: string; versao: string; titulo: string; conteudo: string };

export function getPublicDriverLegal() {
  return apiFetch<{ usuario_tipo: "motorista"; documentos: LegalDocument[] }>("/api/legal/publicos/motorista", { retryAuth: false });
}

export function getCurrentLegal() {
  return apiFetch<{ documentos: Array<{ documentoTipo: string; versao: string; conteudoHash: string }> }>("/api/legal/documentos");
}

export function acceptLegal(documents: Array<{ documento_tipo: string; versao: string }>) {
  return apiFetch<{ sucesso: boolean; mensagem: string }>("/api/legal/aceites", {
    method: "POST",
    body: JSON.stringify({ documentos: documents }),
    idempotencyKey: idempotencyKey("legal-accept"),
  });
}
