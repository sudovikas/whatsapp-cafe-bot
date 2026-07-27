// services/state.js
const sessions = {};
const SESSION_TTL_MS = 30 * 60 * 1000;

function getSession(phone) {
  const now = Date.now();
  if (!sessions[phone] || now - sessions[phone].lastActive > SESSION_TTL_MS) {
    sessions[phone] = { step: 'NEW', orderText: null, orderId: null, name: null, lastActive: now };
  }
  sessions[phone].lastActive = now;
  return sessions[phone];
}

function resetSession(phone) {
  sessions[phone] = { step: 'NEW', orderText: null, orderId: null, name: null, lastActive: Date.now() };
  return sessions[phone];
}

module.exports = { getSession, resetSession };
