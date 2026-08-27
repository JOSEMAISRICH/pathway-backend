/**
 * Caducidad del magic link del portal cliente.
 */

const { v4: uuidv4 } = require('uuid');
const { config } = require('../config');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function magicLinkTtlDays() {
  const n = Number(config.magicLinkTtlDays);
  if (Number.isFinite(n) && n > 0) return n;
  return 30;
}

/** @returns {Date} now + TTL días (default 30) */
function computeMagicExpiresAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + magicLinkTtlDays() * MS_PER_DAY);
}

/**
 * @param {Date|string|null|undefined} magicExpiresAt
 * @returns {boolean}
 */
function isMagicLinkExpired(magicExpiresAt) {
  if (!magicExpiresAt) return false;
  const d = magicExpiresAt instanceof Date ? magicExpiresAt : new Date(magicExpiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/**
 * Asigna token nuevo y caducidad fresca al expediente.
 * @param {import('mongoose').Document} caseDoc
 * @param {string} [token] UUID; si falta, se genera uno.
 */
function assignFreshMagicLink(caseDoc, token = uuidv4()) {
  caseDoc.magicLinkToken = token;
  caseDoc.magicExpiresAt = computeMagicExpiresAt();
}

module.exports = {
  computeMagicExpiresAt,
  isMagicLinkExpired,
  assignFreshMagicLink,
  magicLinkTtlDays,
};
