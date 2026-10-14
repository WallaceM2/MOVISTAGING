const CANCELLATION_FEE_BRL = 3;
const CANCELLATION_FEE_DELAY_MS = 3 * 60 * 1000;

function calculatePassengerCancellationFee({ actorType, priorStatus, driverId, acceptedAt, cancelledAt }) {
  if (actorType !== 'passageiro' || priorStatus !== 'aceita' || !driverId || !acceptedAt || !cancelledAt) return 0;
  const acceptedMs = new Date(acceptedAt).getTime();
  const cancelledMs = new Date(cancelledAt).getTime();
  if (!Number.isFinite(acceptedMs) || !Number.isFinite(cancelledMs)) return 0;
  return cancelledMs - acceptedMs >= CANCELLATION_FEE_DELAY_MS ? CANCELLATION_FEE_BRL : 0;
}

module.exports = { CANCELLATION_FEE_BRL, CANCELLATION_FEE_DELAY_MS, calculatePassengerCancellationFee };
