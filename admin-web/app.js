const SESSION_TOKEN = 'movi_admin_access_token';
const SESSION_ADMIN = 'movi_admin_profile';

const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const dashboardContent = document.querySelector('#dashboard-content');
const loadingState = document.querySelector('#loading-state');
const pageError = document.querySelector('#page-error');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const state = { search: '' };

const iconMarkup = {
  car: '<path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11l1.5 1.4V19h-2v-2H5.5v2h-2v-6.6z"/><path d="M6 11h12M7 14.5h.1m9.8 0h.1"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.7-.8-1.7-1.2-3.1-1.2-1.6 0-2.7.8-2.7 2s1 1.7 2.9 2c1.8.3 2.8.9 2.8 2.1 0 1.3-1.2 2.2-3 2.2-1.4 0-2.6-.5-3.3-1.4M12 5.5v13"/>',
  chart: '<path d="M12 3v9l7.8 4.5A9 9 0 1 1 12 3Z"/><path d="M14 3.3A9 9 0 0 1 20.7 10H14z"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5.2 20c.5-3.5 2.8-5.4 6.8-5.4s6.3 1.9 6.8 5.4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  ride: '<path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11l1.5 1.4V19h-2v-2H5.5v2h-2v-6.6z"/><path d="M6 11h12M7 14.5h.1m9.8 0h.1"/>',
  payment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  withdrawal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-5 4h2"/>',
  incident: '<path d="m10.3 4.3-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  cancel: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
};

function svgIcon(name, className = '') {
  const paths = iconMarkup[name] || iconMarkup.incident;
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function MoviLogo({ compact = false } = {}) {
  return `<img src="/admin/assets/movi-logo-oficial.png" alt="" decoding="async">${compact ? '' : '<span class="wordmark">MOVI</span>'}`;
}

document.querySelectorAll('[data-movi-logo]').forEach((element) => {
  element.classList.toggle('movi-logo--symbol', element.dataset.moviLogo === 'symbol');
  element.innerHTML = MoviLogo({ compact: element.dataset.moviLogo === 'symbol' });
});

function showLogin() {
  dashboardView.hidden = true;
  loginView.hidden = false;
  dashboardContent.hidden = true;
  loadingState.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const whole = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0));
const precise = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value || 0));

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function shortDate(value) {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00-03:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit' }).format(date);
}

function cell(row, value, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = value == null || value === '' ? '—' : String(value);
  row.append(td);
}

function pill(row, status) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  const normalized = String(status || '').toLowerCase();
  const danger = ['cancelada', 'rejeitado', 'rejeitada', 'falhou', 'nao_pago', 'não pago'].includes(normalized);
  const neutral = ['solicitado', 'pendente', 'em_processamento', 'em processamento', 'aberta', 'em_analise', 'em análise'].includes(normalized);
  const warning = ['parcial', 'pago_parcial', 'em_analise', 'em análise'].includes(normalized);
  const progress = ['aceita', 'em_andamento', 'em processamento'].includes(normalized);
  span.className = `state-pill${danger ? ' danger' : warning ? ' warning' : neutral ? ' neutral' : progress ? ' progress' : ''}`;
  span.textContent = humanStatus(status);
  td.append(span);
  row.append(td);
}

function humanStatus(status) {
  const labels = {
    solicitada: 'Solicitada', aceita: 'Aceita', em_andamento: 'Em andamento', concluida: 'Finalizada', cancelada: 'Cancelada', expirou: 'Expirada',
    pago: 'Pago', pago_parcial: 'Parcial', parcial: 'Parcial', nao_pago: 'Não pago', pendente: 'Pendente', solicitado: 'Solicitado',
    em_processamento: 'Em processamento', em_analise: 'Em análise', resolvida: 'Resolvida', rejeitada: 'Rejeitada', concluido: 'Concluído',
  };
  const normalized = String(status || '').toLowerCase();
  return labels[normalized] || (normalized ? normalized.replaceAll('_', ' ').replace(/^\p{L}/u, (char) => char.toUpperCase()) : '—');
}

function addSummaryCard({ icon, label, value, delta, foot }) {
  const card = document.createElement('article');
  card.className = 'summary-card';
  const graphic = document.createElement('span');
  graphic.className = 'summary-icon';
  graphic.setAttribute('aria-hidden', 'true');
  graphic.innerHTML = svgIcon(icon);
  const title = document.createElement('span');
  title.className = 'summary-label';
  title.textContent = label;
  const amount = document.createElement('strong');
  amount.className = 'summary-value';
  amount.textContent = value;
  const detail = document.createElement('span');
  detail.className = 'summary-foot';
  if (delta != null) {
    const change = document.createElement('strong');
    change.textContent = `${Number(delta) >= 0 ? '↑' : '↓'} ${Math.abs(Number(delta)).toFixed(1).replace('.', ',')}%`;
    detail.append(change, document.createTextNode(' vs. período anterior'));
  } else detail.textContent = foot || 'Sem comparação disponível';
  card.append(graphic, title, amount, detail);
  document.querySelector('#summary-grid').append(card);
}

function renderSummary(totals = {}) {
  const grid = document.querySelector('#summary-grid');
  grid.replaceChildren();
  addSummaryCard({ icon: 'car', label: 'Total de corridas', value: whole(totals.corridas), delta: totals.variacao_corridas });
  addSummaryCard({ icon: 'coins', label: 'Valor total das tarifas', value: money(totals.tarifas), delta: totals.variacao_tarifas });
  addSummaryCard({ icon: 'chart', label: 'Comissão MOVI (15%)', value: money(totals.comissao), delta: totals.variacao_comissao });
  addSummaryCard({ icon: 'user', label: 'Repasse motoristas (85%)', value: money(totals.repasse), delta: totals.variacao_repasse });
}

function smoothPath(points) {
  if (points.length < 2) return '';
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function renderChart(series = []) {
  const target = document.querySelector('#finance-chart');
  const legend = document.querySelector('#chart-legend');
  legend.replaceChildren();
  const names = [['Tarifas', 'fares'], ['Comissão MOVI', 'commission'], ['Repasse Motoristas', 'driver']];
  for (const [label, className] of names) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('i');
    dot.className = `legend-dot ${className}`;
    const text = document.createElement('span');
    text.textContent = label;
    item.append(dot, text);
    legend.append(item);
  }

  const width = 600;
  const height = 192;
  const left = 66;
  const right = 8;
  const top = 8;
  const bottom = 25;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const pointsData = series.length ? series : [{ data: new Date().toISOString(), tarifas: 0, comissao: 0, repasse: 0 }];
  const maxValue = Math.max(10, ...pointsData.flatMap((item) => [Number(item.tarifas || 0), Number(item.comissao || 0), Number(item.repasse || 0)])) * 1.12;
  const x = (index) => left + (pointsData.length === 1 ? chartWidth / 2 : (chartWidth * index) / (pointsData.length - 1));
  const y = (value) => top + chartHeight - (Number(value || 0) / maxValue) * chartHeight;
  const lines = [];
  for (let i = 0; i <= 4; i += 1) {
    const lineY = top + (chartHeight * i) / 4;
    const labelValue = maxValue * (4 - i) / 4;
    const formatted = money(labelValue).replace(/,00$/, '');
    lines.push(`<line class="chart-grid-line" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"/><text class="chart-axis-label" x="${left - 8}" y="${lineY + 3}" text-anchor="end">${formatted}</text>`);
  }
  const dateStep = Math.max(1, Math.ceil(pointsData.length / 7));
  const dateIndices = pointsData.map((_, index) => index).filter((index) => index % dateStep === 0 || index === pointsData.length - 1);
  const verticalGrid = dateIndices.map((index) => `<line class="chart-grid-line chart-grid-vertical" x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${top + chartHeight}"/>`).join('');
  const axisDates = dateIndices.map((index) => `<text class="chart-axis-label" x="${x(index)}" y="${height - 6}" text-anchor="middle">${shortDate(pointsData[index].data)}</text>`).join('');
  const keys = [['tarifas', 'fares'], ['comissao', 'commission'], ['repasse', 'driver']];
  const paths = keys.map(([key, cls]) => {
    const points = pointsData.map((item, index) => ({ x: x(index), y: y(item[key]) }));
    const line = smoothPath(points);
    const area = `${line} L ${points.at(-1).x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z`;
    return `<path class="chart-area ${cls}" d="${area}"/><path class="chart-line ${cls}" d="${line}"/>`;
  }).join('');
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}${verticalGrid}${axisDates}${paths}</svg>`;
}

const paymentColors = ['#00dfa3', '#00bfe3', '#008ce0', '#82acc9'];
const paymentLabels = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', cartao_credito: 'Cartão', cartao_debito: 'Cartão', credito: 'Cartão', debito: 'Cartão' };

function renderPayments(methods = []) {
  const total = methods.reduce((sum, method) => sum + Number(method.valor || 0), 0);
  document.querySelector('#payment-total').textContent = money(total);
  const donut = document.querySelector('#payment-donut');
  const legend = document.querySelector('#payment-legend');
  legend.replaceChildren();
  let angle = 0;
  const segments = methods.map((method, index) => {
    const share = total > 0 ? Number(method.valor || 0) / total * 360 : 0;
    const segment = `${paymentColors[index % paymentColors.length]} ${angle}deg ${angle + share}deg`;
    angle += share;
    return segment;
  });
  donut.style.background = total > 0 ? `conic-gradient(${segments.join(', ')})` : '#123039';
  for (const [index, method] of methods.entries()) {
    const row = document.createElement('div');
    row.className = 'payment-legend-row';
    const dot = document.createElement('i');
    dot.className = 'payment-caption-dot';
    dot.style.background = paymentColors[index % paymentColors.length];
    const label = document.createElement('span');
    label.textContent = paymentLabels[method.metodo] || humanStatus(method.metodo);
    const percentage = document.createElement('span');
    percentage.textContent = `${total ? Math.round(Number(method.valor || 0) / total * 100) : 0}%`;
    const amount = document.createElement('strong');
    amount.textContent = money(method.valor);
    row.append(dot, label, percentage, amount);
    legend.append(row);
  }
  if (!methods.length) legend.textContent = 'Sem tarifas concluídas neste período.';
}

function renderRides(rides = []) {
  const body = document.querySelector('#rides-body');
  body.replaceChildren();
  document.querySelector('#empty-rides').hidden = rides.length > 0;
  for (const ride of rides) {
    const row = document.createElement('tr');
    cell(row, `#${ride.id}`);
    cell(row, ride.passageiro_nome || 'Passageiro');
    cell(row, ride.motorista_nome || '—');
    cell(row, ride.categoria === 'moto' ? 'Moto' : ride.categoria === 'carro' ? 'Carro' : '—');
    cell(row, money(ride.valor));
    pill(row, ride.status);
    cell(row, humanStatus(ride.status_pagamento));
    cell(row, dateTime(ride.solicitada_em));
    body.append(row);
  }
}

function renderDebts(debts = []) {
  const body = document.querySelector('#debts-body');
  body.replaceChildren();
  document.querySelector('#empty-debts').hidden = debts.length > 0;
  for (const debt of debts) {
    const row = document.createElement('tr');
    cell(row, debt.passageiro_nome);
    cell(row, money(debt.valor), 'value-danger');
    cell(row, whole(debt.quantidade_corridas));
    cell(row, dateTime(debt.ultima_ocorrencia_em));
    body.append(row);
  }
}

function renderWithdrawals(withdrawals = []) {
  const body = document.querySelector('#withdrawals-body');
  body.replaceChildren();
  document.querySelector('#empty-withdrawals').hidden = withdrawals.length > 0;
  for (const item of withdrawals) {
    const row = document.createElement('tr');
    cell(row, item.motorista_nome);
    cell(row, money(item.valor_solicitado));
    cell(row, '—');
    cell(row, '—'); // The current V3 has no confirmed transfer record/provider.
    if (String(item.status || '').toLowerCase() === 'concluido') {
      const td = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'state-pill neutral';
      badge.textContent = 'Registrado';
      td.append(badge);
      row.append(td);
    } else pill(row, item.status);
    cell(row, dateTime(item.solicitado_em));
    body.append(row);
  }
}

function renderIncidents(incidents = []) {
  const body = document.querySelector('#incidents-body');
  body.replaceChildren();
  document.querySelector('#empty-incidents').hidden = incidents.length > 0;
  for (const item of incidents) {
    const row = document.createElement('tr');
    cell(row, `#${item.id}`);
    cell(row, item.tipo || 'Pagamento não recebido');
    cell(row, item.corrida_id ? `#${item.corrida_id}` : '—');
    cell(row, money(item.valor));
    pill(row, item.status);
    cell(row, dateTime(item.criado_em));
    body.append(row);
  }
}

function renderActivity(events = []) {
  const list = document.querySelector('#activity-list');
  list.replaceChildren();
  document.querySelector('#empty-activity').hidden = events.length > 0;
  const icons = { corrida: ['check', ''], pagamento: ['payment', ''], saque: ['withdrawal', ''], ocorrencia: ['incident', 'warning'], cancelamento: ['cancel', 'danger'], motorista: ['user', ''] };
  for (const event of events) {
    const item = document.createElement('article');
    item.className = 'activity-item';
    const [symbol, typeClass] = icons[event.tipo] || ['incident', ''];
    const icon = document.createElement('span');
    icon.className = `activity-icon ${typeClass}`;
    icon.innerHTML = svgIcon(symbol);
    const copy = document.createElement('div');
    copy.className = 'activity-copy';
    const title = document.createElement('strong');
    title.textContent = event.titulo || 'Atividade MOVI';
    const detail = document.createElement('span');
    detail.textContent = event.detalhe || '';
    copy.append(title, detail);
    if (event.valor != null) {
      const value = document.createElement('small');
      value.textContent = money(event.valor);
      copy.append(value);
    }
    const time = document.createElement('time');
    time.className = 'activity-time';
    time.dateTime = event.data || '';
    time.textContent = dateTime(event.data).split(', ').at(-1) || '—';
    item.append(icon, copy, time);
    list.append(item);
  }
}

function applySearch(query) {
  state.search = query.trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('#dashboard-content tbody tr, #activity-list .activity-item').forEach((row) => {
    row.hidden = state.search !== '' && !row.textContent.toLocaleLowerCase('pt-BR').includes(state.search);
  });
}

function renderDashboard(data) {
  renderSummary(data.totais);
  renderChart(data.serie_financeira);
  renderPayments(data.pagamentos_por_metodo);
  renderRides(data.corridas_recentes);
  renderDebts(data.debitos_passageiros);
  renderWithdrawals(data.saques_recentes);
  renderIncidents(data.ocorrencias_recentes);
  renderActivity(data.atividade_recente);
  document.querySelector('#notification-count').textContent = whole(data.operacao?.ocorrencias_abertas || 0);
  document.querySelector('#finance-note').textContent = data.observacao_financeira || '';
  document.querySelector('#updated-at').textContent = `Atualizado ${dateTime(data.atualizado_em)}`;
  applySearch(state.search);
}

async function api(path, options = {}) {
  const token = sessionStorage.getItem(SESSION_TOKEN);
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.erro || payload.mensagem || 'Não foi possível carregar os dados.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadDashboard() {
  showDashboard();
  pageError.hidden = true;
  dashboardContent.hidden = true;
  loadingState.hidden = false;
  try {
    const period = document.querySelector('#period-filter').value;
    const data = await api(`/api/admin/dashboard?periodo=${encodeURIComponent(period)}`);
    renderDashboard(data);
    dashboardContent.hidden = false;
    const profile = JSON.parse(sessionStorage.getItem(SESSION_ADMIN) || '{}');
    document.querySelector('#admin-name').textContent = profile.nome || 'Admin MOVI';
  } catch (error) {
    loadingState.hidden = true;
    if (error.status === 401 || error.status === 403) {
      sessionStorage.removeItem(SESSION_TOKEN);
      sessionStorage.removeItem(SESSION_ADMIN);
      showLogin();
      loginError.textContent = 'Sua sessão expirou ou não tem acesso administrativo. Entre novamente.';
      loginError.hidden = false;
      return;
    }
    pageError.textContent = error.message;
    pageError.hidden = false;
  } finally {
    loadingState.hidden = true;
  }
}

function updateClock() {
  const now = new Date();
  document.querySelector('#current-date').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: 'long', year: 'numeric' }).format(now);
  document.querySelector('#current-time').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' }).format(now);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = document.querySelector('#login-button');
  button.disabled = true;
  try {
    const form = new FormData(loginForm);
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), senha: form.get('senha') }),
    });
    if (!result.token || !result.admin) throw new Error('Resposta de autenticação inválida.');
    sessionStorage.setItem(SESSION_TOKEN, result.token);
    sessionStorage.setItem(SESSION_ADMIN, JSON.stringify(result.admin));
    loginForm.reset();
    await loadDashboard();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#refresh-button').addEventListener('click', loadDashboard);
document.querySelector('#period-filter').addEventListener('change', loadDashboard);
document.querySelector('#global-search').addEventListener('input', (event) => applySearch(event.target.value));
document.querySelector('#logout-button').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_TOKEN);
  sessionStorage.removeItem(SESSION_ADMIN);
  pageError.hidden = true;
  loginError.hidden = true;
  showLogin();
});
document.querySelector('#profile-button').addEventListener('click', () => document.querySelector('#logout-button').click());
document.querySelector('.notification-button').addEventListener('click', () => document.querySelector('#ocorrencias').scrollIntoView({ behavior: 'smooth' }));
document.querySelector('#menu-button').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('is-open'));
document.querySelectorAll('#sidebar a[href^="#"]').forEach((link) => link.addEventListener('click', () => document.querySelector('#sidebar').classList.remove('is-open')));

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

document.querySelector('#generate-report').addEventListener('click', () => {
  const sections = [...document.querySelectorAll('.dashboard-main-column .table-panel table')];
  const lines = [];
  for (const table of sections) {
    for (const row of table.rows) lines.push([...row.cells].map((item) => csvValue(item.textContent.trim())).join(';'));
    lines.push('');
  }
  if (!lines.length) return;
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `movi-corridas-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
});

updateClock();
setInterval(updateClock, 60_000);
if (sessionStorage.getItem(SESSION_TOKEN)) loadDashboard();
else showLogin();
