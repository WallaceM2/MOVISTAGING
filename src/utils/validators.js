function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(cpf[10]);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCpf(cpf) {
  return onlyDigits(cpf);
}

function normalizePhone(phone) {
  return onlyDigits(phone);
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lng) >= -180 && Number(lng) <= 180;
}

function isValidDateOfBirth(isoDate, minimumAge = 18) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const cutoff = new Date(Date.UTC(
    now.getUTCFullYear() - minimumAge,
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  return date <= cutoff;
}

module.exports = {
  onlyDigits,
  isValidCpf,
  normalizeEmail,
  normalizeCpf,
  normalizePhone,
  isValidCoordinate,
  isValidDateOfBirth,
};
