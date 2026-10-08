const { URL } = require('url');
const TripShare = require('../models/TripShare');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function getShareBase() {
  if (!env.SHARE_PUBLIC_BASE_URL) throw new AppError('O link público de compartilhamento ainda não foi configurado.', 503, 'SHARE_URL_NOT_CONFIGURED');
  const base = new URL(env.SHARE_PUBLIC_BASE_URL);
  if (!['https:', 'http:'].includes(base.protocol) || (env.isProduction && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash) {
    throw new AppError('A configuração do link público é inválida.', 503, 'SHARE_URL_INVALID');
  }
  return base.origin;
}

async function criar(req, res) {
  const origin = getShareBase();
  const result = await TripShare.create(req.usuario.id, req.params.id);
  res.status(201).json({ url: `${origin}/compartilhar/${result.token}`, expira_em: result.expira_em });
}

async function revogar(req, res) {
  await TripShare.revoke(req.usuario.id, req.params.id);
  res.json({ sucesso: true });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function paginaPublica(req, res) {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw new AppError('Link inválido ou expirado.', 404, 'SHARE_NOT_FOUND');
  const ride = await TripShare.lookup(token);
  if (!ride) throw new AppError('Este link foi revogado ou expirou.', 404, 'SHARE_NOT_FOUND');
  res.set({ 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  const active = ['aceita', 'em_andamento'].includes(ride.status);
  const title = active ? 'Acompanhamento de viagem MOVI' : 'Viagem encerrada';
  const status = ride.status === 'aceita' ? 'Motorista a caminho do embarque' : ride.status === 'em_andamento' ? 'Corrida em andamento' : 'Esta viagem foi encerrada';
  const driver = active && ride.motorista_id ? `<section><h2>Motorista</h2><p>${escapeHtml(ride.motorista_nome || 'Motorista MOVI')} · ★ ${escapeHtml(Number(ride.nota_media || 0).toFixed(1))}</p><p>${escapeHtml([ride.marca, ride.modelo, ride.cor].filter(Boolean).join(' '))}</p><p class="plate">${escapeHtml(ride.placa || '')}</p></section>` : '';
  const route = active ? `<section><h2>Trajeto</h2><p><b>Embarque:</b> ${escapeHtml(ride.origem)}</p><p><b>Destino:</b> ${escapeHtml(ride.destino)}</p></section>` : '';
  const hasLocation = active && Number.isFinite(Number(ride.ultima_lat)) && Number.isFinite(Number(ride.ultima_lng))
    && ride.ultima_localizacao_em && Date.now() - new Date(ride.ultima_localizacao_em).getTime() < 120_000;
  const map = hasLocation ? `<a class="button" rel="noreferrer noopener" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${ride.ultima_lat},${ride.ultima_lng}`)}">Ver localização atual no mapa</a><p class="sub">Última posição enviada: ${escapeHtml(new Date(ride.ultima_localizacao_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Recife' }))}</p>` : active ? '<p class="sub">Aguardando a próxima atualização de localização do motorista.</p>' : '';
  const refresh = active ? '<meta http-equiv="refresh" content="20">' : '';
  res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}<title>${title}</title><style>body{font:16px system-ui,sans-serif;background:#f1f5f2;color:#14231b;margin:0;padding:24px}.wrap{max-width:560px;margin:auto}.card{background:white;border:1px solid #dfe7e1;border-radius:20px;padding:22px;margin:14px 0}.brand{font-weight:900;color:#176743;letter-spacing:.12em}.status{font-size:23px;font-weight:850;margin:0}.sub{color:#52645a;line-height:1.5}.plate{font-size:21px;font-weight:900;letter-spacing:.12em}.button{display:block;text-align:center;background:#176743;color:white;padding:14px;border-radius:13px;text-decoration:none;font-weight:800}h1{font-size:25px}h2{font-size:14px;color:#52645a}</style></head><body><main class="wrap"><p class="brand">MOVI · COMPARTILHAMENTO SEGURO</p><h1>${title}</h1><section class="card"><p class="status">${escapeHtml(status)}</p><p class="sub">Corrida #${Number(ride.id)}</p>${map}</section>${driver ? `<section class="card">${driver}</section>` : ''}${route ? `<section class="card">${route}</section>` : ''}<p class="sub">Este link é privado. Compartilhe somente com pessoas de confiança. A localização deixa de ser exibida quando a corrida termina, o link é revogado ou expira.</p></main></body></html>`);
}

module.exports = { criar, revogar, paginaPublica };
