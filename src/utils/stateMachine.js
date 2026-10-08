const AppError = require('../errors/AppError');

const RIDE_STATES = Object.freeze({
  SOLICITADA: 'solicitada',
  ACEITA: 'aceita',
  EM_ANDAMENTO: 'em_andamento',
  CONCLUIDA: 'concluida',
  CANCELADA: 'cancelada',
  EXPIRADA: 'expirada',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  solicitada: new Set(['aceita', 'cancelada', 'expirada']),
  aceita: new Set(['em_andamento', 'cancelada']),
  em_andamento: new Set(['concluida']),
  concluida: new Set(),
  cancelada: new Set(),
  expirada: new Set(),
});

function assertRideTransition(current, next) {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, current)) {
    throw new AppError(`Estado atual de corrida inválido: ${current}`, 409, 'INVALID_RIDE_STATE');
  }
  if (!ALLOWED_TRANSITIONS[current].has(next)) {
    throw new AppError(`Transição de corrida inválida: ${current} -> ${next}`, 409, 'INVALID_RIDE_TRANSITION');
  }
}

module.exports = { RIDE_STATES, ALLOWED_TRANSITIONS, assertRideTransition };
