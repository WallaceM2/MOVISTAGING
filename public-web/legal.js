const profileSelect = document.querySelector('#legal-profile');
const documentSelect = document.querySelector('#legal-document');
const documentTitle = document.querySelector('#document-title');
const documentVersion = document.querySelector('#document-version');
const documentContent = document.querySelector('#document-content');
const legalState = document.querySelector('#legal-state');
const pageTitle = document.querySelector('#legal-title');

const params = new URLSearchParams(window.location.search);
if (['passageiro', 'motorista'].includes(params.get('perfil'))) profileSelect.value = params.get('perfil');
if (['termos_uso', 'aviso_privacidade', 'seguranca_confianca'].includes(params.get('documento'))) documentSelect.value = params.get('documento');

async function loadLegalDocument() {
  const profile = profileSelect.value;
  const selectedType = documentSelect.value;
  documentContent.hidden = true;
  documentContent.textContent = '';
  legalState.hidden = false;
  legalState.textContent = 'Buscando a versão pública no MOVI V3…';

  try {
    const response = await fetch(`/api/legal/publicos/${encodeURIComponent(profile)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`V3 respondeu ${response.status}`);
    const payload = await response.json();
    const doc = Array.isArray(payload.documentos) ? payload.documentos.find((item) => item.documentoTipo === selectedType) : null;
    if (!doc) throw new Error('O documento solicitado não está disponível para este perfil.');

    documentTitle.textContent = doc.titulo || 'Documento MOVI';
    documentVersion.textContent = `Versão ${doc.versao || 'não informada'} · minuta`;
    documentContent.textContent = doc.conteudo || '';
    documentContent.hidden = false;
    legalState.hidden = true;
    pageTitle.textContent = doc.titulo || 'Documentos MOVI';
    document.title = `${doc.titulo || 'Documento'} — MOVI · Minuta`;
    params.set('perfil', profile);
    params.set('documento', selectedType);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  } catch {
    documentTitle.textContent = 'Documento indisponível';
    documentVersion.textContent = '';
    legalState.textContent = 'Não foi possível carregar a versão pública do V3. Abra esta página pelo servidor do MOVI e tente novamente.';
  }
}

profileSelect.addEventListener('change', loadLegalDocument);
documentSelect.addEventListener('change', loadLegalDocument);
loadLegalDocument();
