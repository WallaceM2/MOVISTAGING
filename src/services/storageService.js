const crypto = require('crypto');
const AppError = require('../errors/AppError');
const env = require('../config/env');

function assertConfigured() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError('Armazenamento de documentos não está configurado.', 503, 'STORAGE_NOT_CONFIGURED');
  }
}

function extensionForMime(mimetype) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'application/pdf') return '.pdf';
  throw new AppError('Tipo de arquivo não permitido.', 400, 'INVALID_FILE_TYPE');
}

function encodePath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

async function uploadPrivateFile({ buffer, mimetype, tipoUsuario, usuarioId, campo }) {
  assertConfigured();
  const extension = extensionForMime(mimetype);
  const safeCampo = String(campo).replace(/[^a-zA-Z0-9_-]/g, '_');
  const objectPath = `${tipoUsuario}/${usuarioId}/${safeCampo}-${crypto.randomUUID()}${extension}`;
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodePath(env.SUPABASE_STORAGE_BUCKET)}/${encodePath(objectPath)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': mimetype,
      'x-upsert': 'false',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AppError(`Falha ao armazenar arquivo (${response.status}).`, 502, 'STORAGE_UPLOAD_FAILED', { provider: text.slice(0, 300) });
  }

  return { bucket: env.SUPABASE_STORAGE_BUCKET, path: objectPath, storagePath: `storage://${env.SUPABASE_STORAGE_BUCKET}/${objectPath}` };
}

async function createSignedUrl(storagePath, expiresIn = 3600) {
  assertConfigured();
  const match = String(storagePath || '').match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new AppError('Documento inválido.', 400, 'INVALID_STORAGE_PATH');
  const bucket = match[1];
  const objectPath = match[2];
  if (bucket !== env.SUPABASE_STORAGE_BUCKET) throw new AppError('Documento inválido.', 400, 'INVALID_STORAGE_BUCKET');

  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/sign/${encodePath(bucket)}/${encodePath(objectPath)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) throw new AppError('Falha ao gerar acesso temporário ao documento.', 502, 'STORAGE_SIGN_FAILED');
  const body = await response.json();
  const signed = body.signedURL || body.signedUrl || body.signed_url;
  if (!signed) throw new AppError('O provedor não retornou uma URL temporária.', 502, 'STORAGE_SIGN_FAILED');
  return signed.startsWith('http') ? signed : `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${signed}`;
}


async function deletePrivateFile(storagePath) {
  assertConfigured();
  const match = String(storagePath || '').match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!match) return false;
  const bucket = match[1];
  const objectPath = match[2];
  if (bucket !== env.SUPABASE_STORAGE_BUCKET) return false;
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodePath(bucket)}/${encodePath(objectPath)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new AppError('Falha ao remover arquivo antigo do armazenamento.', 502, 'STORAGE_DELETE_FAILED');
  }
  return true;
}

module.exports = { uploadPrivateFile, createSignedUrl, deletePrivateFile };
