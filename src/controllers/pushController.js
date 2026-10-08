const PushDevice = require('../models/PushDevice');
const AppError = require('../errors/AppError');

function appMatchesUser(tipo, appId) {
  return (tipo === 'motorista' && appId === 'movi-motorista')
    || (tipo === 'passageiro' && appId === 'movi-passageiro');
}

async function registrarDispositivo(req, res) {
  const { expo_push_token, plataforma, app_id } = req.body;
  if (!appMatchesUser(req.usuario.tipo, app_id)) {
    throw new AppError('Este app não corresponde ao tipo da conta autenticada.', 403, 'PUSH_APP_ACCOUNT_MISMATCH');
  }
  const device = await PushDevice.upsert({
    usuarioTipo: req.usuario.tipo,
    usuarioId: req.usuario.id,
    appId: app_id,
    plataforma,
    token: expo_push_token,
  });
  if (!device) throw new AppError('Este aparelho já está vinculado a outra conta. Encerre a sessão anterior e tente novamente.', 409, 'PUSH_DEVICE_IN_USE');
  res.status(200).json({ sucesso: true });
}

async function removerDispositivo(req, res) {
  const { expo_push_token } = req.body;
  await PushDevice.deactivate({
    usuarioTipo: req.usuario.tipo,
    usuarioId: req.usuario.id,
    token: expo_push_token,
  });
  res.status(200).json({ sucesso: true });
}

module.exports = { registrarDispositivo, removerDispositivo };
