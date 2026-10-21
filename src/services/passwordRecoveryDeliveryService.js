const env = require('../config/env');
const AppError = require('../errors/AppError');

function isConfigured(method) {
  if (method === 'email') return Boolean(env.RESEND_API_KEY && env.PASSWORD_RECOVERY_EMAIL_FROM);
  const hasTwilioApiKey = Boolean(env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET);
  const hasTwilioAuthToken = Boolean(env.TWILIO_AUTH_TOKEN);
  if (method === 'sms') return Boolean(env.TWILIO_ACCOUNT_SID && (hasTwilioApiKey || hasTwilioAuthToken) && env.TWILIO_FROM_NUMBER);
  return false;
}

async function sendEmail(destination, code) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.PASSWORD_RECOVERY_EMAIL_FROM,
      to: [destination],
      subject: 'Código para recuperar sua senha MOVI',
      text: `Seu código de recuperação MOVI é ${code}. Ele expira em 10 minutos. Se você não pediu esta recuperação, ignore esta mensagem.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status}).`);
}

async function sendSms(destination, code) {
  const account = env.TWILIO_ACCOUNT_SID;
  const digits = String(destination).replace(/\D/g, '');
  const e164Destination = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
  const body = new URLSearchParams({
    To: e164Destination,
    From: env.TWILIO_FROM_NUMBER,
    Body: `Seu código MOVI é ${code}. Ele expira em 10 minutos. Se você não pediu esta recuperação, ignore esta mensagem.`,
  });
  const hasApiKey = Boolean(env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET);
  const username = hasApiKey ? env.TWILIO_API_KEY_SID : account;
  const password = hasApiKey ? env.TWILIO_API_KEY_SECRET : env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`SMS delivery failed (${response.status}).`);
}

async function sendRecoveryCode(method, destination, code) {
  if (!isConfigured(method)) throw new AppError('A recuperação de senha por este canal ainda não está configurada.', 503, 'RECOVERY_CHANNEL_UNAVAILABLE');
  try {
    if (method === 'email') await sendEmail(destination, code);
    else if (method === 'sms') await sendSms(destination, code);
    else throw new AppError('Canal de recuperação inválido.', 400, 'INVALID_RECOVERY_CHANNEL');
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(JSON.stringify({ level: 'error', event: 'password_recovery_delivery_failed', method, message: error.message }));
    throw new AppError('Não foi possível enviar o código agora. Tente novamente mais tarde.', 503, 'RECOVERY_DELIVERY_FAILED');
  }
}

module.exports = { isConfigured, sendRecoveryCode };
