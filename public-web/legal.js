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

function appendInlineText(parent, text) {
  const parts = String(text).split(/((?<!\*)\*\*(?!\*)[^*]+(?<!\*)\*\*(?!\*))/g);
  parts.forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else if (part) {
      parent.append(document.createTextNode(part));
    }
  });
}

function renderDocumentContent(source) {
  documentContent.replaceChildren();
  let currentList = null;
  let skippedTitle = false;

  String(source || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      currentList = null;
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      currentList = null;
      if (heading[1] === '#' && !skippedTitle) {
        skippedTitle = true;
        return;
      }
      const element = document.createElement(heading[1].length === 2 ? 'h3' : 'h4');
      appendInlineText(element, heading[2]);
      documentContent.append(element);
      return;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const type = unordered ? 'ul' : 'ol';
      if (!currentList || currentList.tagName.toLowerCase() !== type) {
        currentList = document.createElement(type);
        documentContent.append(currentList);
      }
      const item = document.createElement('li');
      appendInlineText(item, (unordered || ordered)[1]);
      currentList.append(item);
      return;
    }

    currentList = null;
    const paragraph = document.createElement('p');
    appendInlineText(paragraph, trimmed);
    documentContent.append(paragraph);
  });
}

async function loadLegalDocument() {
  const profile = profileSelect.value;
  const selectedType = documentSelect.value;
  documentContent.hidden = true;
  documentContent.replaceChildren();
  legalState.hidden = false;
  legalState.textContent = 'Carregando a versão disponível…';

  try {
    const response = await fetch('/api/legal/publicos/' + encodeURIComponent(profile), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Resposta ' + response.status);
    const payload = await response.json();
    const doc = Array.isArray(payload.documentos) ? payload.documentos.find((item) => item.documentoTipo === selectedType) : null;
    if (!doc) throw new Error('O documento solicitado não está disponível para este perfil.');

    documentTitle.textContent = doc.titulo || 'Documento MOVI';
    documentVersion.textContent = 'Versão ' + (doc.versao || 'não informada') + ' · minuta';
    renderDocumentContent(doc.conteudo || '');
    documentContent.hidden = false;
    legalState.hidden = true;
    pageTitle.textContent = doc.titulo || 'Documentos MOVI';
    document.title = (doc.titulo || 'Documento') + ' — MOVI · Minuta';
    params.set('perfil', profile);
    params.set('documento', selectedType);
    window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
  } catch {
    documentTitle.textContent = 'Documento indisponível';
    documentVersion.textContent = '';
    legalState.textContent = 'Não foi possível carregar este documento agora. Tente novamente mais tarde.';
  }
}

profileSelect.addEventListener('change', loadLegalDocument);
documentSelect.addEventListener('change', loadLegalDocument);
loadLegalDocument();