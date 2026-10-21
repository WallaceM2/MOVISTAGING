const payout = require('../services/driverPayoutSetupService');

async function getAccount(req, res) {
  res.json(await payout.getAccount(req.usuario.id));
}

async function saveAccount(req, res) {
  res.json({ mensagem: 'Dados de recebimento atualizados com segurança.', ...(await payout.saveAccount(req.usuario.id, req.body)) });
}

async function setPin(req, res) {
  res.json({ mensagem: 'PIN de saque configurado. Os saques serão habilitados após a integração de repasses Pix.', ...(await payout.setWithdrawalPin(req.usuario.id, req.body.pin_atual, req.body.novo_pin)) });
}

module.exports = { getAccount, saveAccount, setPin };
