const APP_DESTINATIONS = Object.freeze({
  passageiro: Object.freeze({
    deepLink: 'movi://',
    androidStore: null,
    iosStore: null,
    qrImage: null,
  }),
  parceiro: Object.freeze({
    deepLink: 'movi-motorista://',
    androidStore: null,
    iosStore: null,
    qrImage: null,
  }),
});

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-navigation');

if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Abrir navegação' : 'Fechar navegação');
    navigation.classList.toggle('is-open', !isOpen);
  });

  navigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Abrir navegação');
      navigation.classList.remove('is-open');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir navegação');
    navigation.classList.remove('is-open');
  });
}

const isMobileDevice = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const mobilePlatform = /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : null;

function appStatusFor(link) {
  const section = link.closest('.hero, .audience-copy, .closing-section, .support-panel');
  return section?.querySelector('[data-app-status]') || document.querySelector('[data-app-status]');
}

function showAppAccess(appKey, status, message) {
  const card = document.querySelector(`[data-app-card="${appKey}"]`);
  const placeholder = card?.querySelector('.qr-placeholder');
  if (placeholder && APP_DESTINATIONS[appKey]?.qrImage) placeholder.textContent = 'QR Code oficial';
  if (status) {
    status.textContent = message;
    status.hidden = false;
  }
  document.querySelector('#apps')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function configureAppDistribution() {
  document.querySelectorAll('[data-app-card]').forEach((card) => {
    const destination = APP_DESTINATIONS[card.dataset.appCard];
    if (!destination) return;
    const android = card.querySelector('[data-store="android"]');
    const ios = card.querySelector('[data-store="ios"]');
    const qr = card.querySelector('.qr-slot img');
    const placeholder = card.querySelector('.qr-placeholder');

    [[android, destination.androidStore], [ios, destination.iosStore]].forEach(([link, url]) => {
      if (!link || !url) return;
      link.href = url;
      link.hidden = false;
    });

    if (qr && destination.qrImage) {
      qr.src = destination.qrImage;
      qr.hidden = false;
      if (placeholder) placeholder.hidden = true;
    }

    if (destination.androidStore || destination.iosStore) {
      card.querySelector('.app-prelaunch')?.setAttribute('hidden', '');
    }
  });
}

configureAppDistribution();

document.querySelectorAll('[data-app-launch]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const appKey = link.dataset.appLaunch;
    const destination = APP_DESTINATIONS[appKey];
    const status = appStatusFor(link);
    if (!destination) return;

    if (!isMobileDevice) {
      event.preventDefault();
      showAppAccess(appKey, status, 'Os apps ainda não foram publicados nas lojas. Os links oficiais e o QR Code serão adicionados aqui quando estiverem disponíveis.');
      return;
    }

    event.preventDefault();
    let fallbackStarted = false;
    const fallbackTimer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      const storeUrl = mobilePlatform === 'android' ? destination.androidStore : mobilePlatform === 'ios' ? destination.iosStore : null;
      if (storeUrl) {
        fallbackStarted = true;
        window.location.assign(storeUrl);
        return;
      }
      showAppAccess(appKey, status, 'Não foi possível abrir o aplicativo. Os links oficiais para instalação serão publicados quando os apps chegarem às lojas.');
    }, 1300);

    window.location.assign(destination.deepLink);
    window.addEventListener('pagehide', () => window.clearTimeout(fallbackTimer), { once: true });
    window.addEventListener('blur', () => window.clearTimeout(fallbackTimer), { once: true });
    window.addEventListener('focus', () => {
      if (fallbackStarted) return;
      window.clearTimeout(fallbackTimer);
    }, { once: true });
  });
});

const faqList = document.querySelector('#faq-list');
const faqSearch = document.querySelector('#faq-search');
let faqArticles = [];

function renderFaq(articles) {
  if (!faqList) return;
  const term = (faqSearch?.value || '').trim().toLocaleLowerCase('pt-BR');
  const filtered = articles.filter((article) => `${article.titulo} ${article.resposta}`.toLocaleLowerCase('pt-BR').includes(term));
  faqList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'faq-state';
    empty.textContent = term ? 'Nenhum artigo do V3 corresponde à busca.' : 'A Central de Ajuda ainda não tem artigos publicados.';
    faqList.append(empty);
    return;
  }

  filtered.forEach((article, index) => {
    const details = document.createElement('details');
    details.className = 'faq-item';
    if (index === 0) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = article.titulo;
    const answer = document.createElement('p');
    answer.textContent = article.resposta;
    details.append(summary, answer);
    faqList.append(details);
  });
}

async function loadFaq() {
  if (!faqList) return;
  try {
    const response = await fetch('/api/suporte/faq', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`V3 respondeu ${response.status}`);
    const payload = await response.json();
    faqArticles = Array.isArray(payload.artigos) ? payload.artigos : [];
    renderFaq(faqArticles);
  } catch {
    faqList.replaceChildren();
    const message = document.createElement('p');
    message.className = 'faq-state faq-state-error';
    message.textContent = 'Não foi possível conectar à Central de Ajuda do MOVI V3. Abra esta página pelo servidor do MOVI para carregar os artigos oficiais.';
    faqList.append(message);
  }
}

faqSearch?.addEventListener('input', () => renderFaq(faqArticles));
loadFaq();

const triageForm = document.querySelector('#support-triage');
triageForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = document.querySelector('#triage-result');
  const submit = triageForm.querySelector('button[type="submit"]');
  const pergunta = String(new FormData(triageForm).get('pergunta') || '').trim();
  if (!result || !submit) return;
  submit.disabled = true;
  result.hidden = false;
  result.textContent = 'Consultando a orientação disponível…';

  try {
    const response = await fetch('/api/suporte/triagem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pergunta }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.erro || 'Não foi possível consultar a orientação.');
    result.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = payload.titulo || 'Orientação MOVI';
    const answer = document.createElement('p');
    answer.textContent = payload.resposta || 'Não encontramos uma orientação para esta pergunta.';
    const note = document.createElement('small');
    note.textContent = 'Esta resposta é uma orientação automática e não abre nem resolve um chamado. Para análise individual, use o suporte no aplicativo.';
    result.append(title, answer, note);
  } catch (error) {
    result.textContent = `${error.message} Para abrir um chamado, use o suporte no MOVI ou no MOVI Drive.`;
  } finally {
    submit.disabled = false;
  }
});

const currentYear = document.querySelector('#current-year');
if (currentYear) currentYear.textContent = String(new Date().getFullYear());
