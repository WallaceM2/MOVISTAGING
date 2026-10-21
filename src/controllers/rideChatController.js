const RideChat = require('../models/RideChat');
const { uploadRideChatMedia, createSignedUrl, deletePrivateFile } = require('../services/storageService');
const { emitToUser } = require('../services/realtimeService');
const AppError = require('../errors/AppError');

function publicMessage(message, mediaUrl = null) {
  const { midia_storage_path: _privatePath, ...safe } = message;
  return { ...safe, midia_url: mediaUrl };
}

async function signMessage(message) {
  const url = message.midia_storage_path ? await createSignedUrl(message.midia_storage_path, 900) : null;
  return publicMessage(message, url);
}

async function list(req, res) {
  const beforeId = req.query.before_id == null ? null : Number(req.query.before_id);
  if (beforeId != null && (!Number.isSafeInteger(beforeId) || beforeId < 1)) throw new AppError('Cursor inválido.', 400, 'INVALID_CHAT_CURSOR');
  const rows = await RideChat.list({ rideId: Number(req.params.id), tipo: req.usuario.tipo, usuarioId: req.usuario.id, beforeId, limit: req.query.limit });
  res.set('Cache-Control', 'no-store, private');
  res.json({ mensagens: await Promise.all(rows.map(signMessage)), proximo_before_id: rows.length ? rows[0].id : null });
}

async function send(req, res) {
  const { tipo: messageType, mensagem, client_message_id: clientMessageId } = req.body;
  const file = req.file;
  if (messageType === 'texto' && file) throw new AppError('Mensagem de texto não aceita arquivo.', 400, 'UNEXPECTED_CHAT_MEDIA');
  if (messageType !== 'texto' && !file) throw new AppError('Selecione a foto ou grave uma mensagem de voz.', 400, 'CHAT_MEDIA_REQUIRED');
  if (messageType === 'imagem' && !['image/jpeg', 'image/png'].includes(file?.mimetype)) throw new AppError('Envie uma foto JPG ou PNG.', 400, 'INVALID_CHAT_MEDIA_TYPE');
  if (messageType === 'audio' && file?.mimetype !== 'audio/mp4') throw new AppError('O áudio precisa estar no formato M4A.', 400, 'INVALID_CHAT_MEDIA_TYPE');

  const rideId = Number(req.params.id);
  await RideChat.assertCanSend({ rideId, tipo: req.usuario.tipo, usuarioId: req.usuario.id });
  let media = null;
  if (file) media = await uploadRideChatMedia({ buffer: file.buffer, mimetype: file.mimetype, rideId });
  let result;
  try {
    result = await RideChat.create({
      rideId, tipo: req.usuario.tipo, usuarioId: req.usuario.id,
      clientMessageId, messageType, message: mensagem, media: file ? { ...media, mimetype: file.mimetype, size: file.size } : null,
    });
  } catch (error) {
    if (media?.storagePath) await deletePrivateFile(media.storagePath).catch(() => {});
    throw error;
  }
  // A retry with the same client id returns the canonical message. Remove the
  // newly uploaded duplicate object so retries cannot leak private media.
  if (!result.created && media?.storagePath && media.storagePath !== result.message.midia_storage_path) {
    await deletePrivateFile(media.storagePath).catch(() => {});
  }
  const outgoing = await signMessage(result.message);
  if (result.created) {
    await emitToUser(result.recipient.tipo, result.recipient.id, 'chat_nova_mensagem', { corrida_id: rideId, mensagem: outgoing });
  }
  res.status(result.created ? 201 : 200).json({ mensagem: outgoing });
}

module.exports = { list, send };
