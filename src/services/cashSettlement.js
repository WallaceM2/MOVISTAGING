const CASH_PROTECTION_CAP = 20;
const COMMISSION_RATE = 0.15;
const DRIVER_SHARE_RATE = 0.85;

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateCashSettlement({ fare, received, protectionCap = CASH_PROTECTION_CAP }) {
  const total = money(fare);
  const paid = money(received);
  const cap = money(protectionCap);
  if (![total, paid, cap].every(Number.isFinite) || total <= 0 || paid < 0 || paid > total || cap < 0) {
    throw new TypeError('Valores inválidos para apuração de corrida em dinheiro.');
  }

  const debt = money(total - paid);
  const commission = money(total * COMMISSION_RATE);
  const driverShare = money(total * DRIVER_SHARE_RATE);
  const commissionAllocatedToDebt = money(Math.min(commission, debt));
  const commissionAlreadyCoveredByCash = money(commission - commissionAllocatedToDebt);
  const driverAdvance = money(Math.max(0, debt - commissionAllocatedToDebt));

  return {
    fare: total,
    received: paid,
    passengerDebt: debt,
    commissionTotal: commission,
    commissionAllocatedToDebt,
    commissionAlreadyCoveredByCash,
    driverAdvance,
    nonRecoverableProtectionCap: cap,
    protectionExposure: money(Math.min(driverAdvance, cap)),
    advanceAboveProtectionCap: money(Math.max(0, driverAdvance - cap)),
  };
}

module.exports = { CASH_PROTECTION_CAP, calculateCashSettlement };
