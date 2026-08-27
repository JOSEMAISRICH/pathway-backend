const crypto = require('crypto');
const Agency = require('../models/agency');
const { hashPassword } = require('./password');
const { httpError } = require('./httpError');
const { config } = require('../config');

const RESET_TOKEN_BYTES = 32;

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');
}

function resetTokenTtlMs() {
  const hours = Number(process.env.PASSWORD_RESET_TTL_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return hours * 60 * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

/**
 * @returns {{ rawToken: string, tokenHash: string, expiresAt: Date }}
 */
function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  return {
    rawToken,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + resetTokenTtlMs()),
  };
}

/**
 * @param {string} rawToken
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findAgencyByResetToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashResetToken(rawToken.trim());
  const agency = await Agency.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  })
    .select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt')
    .exec();
  return agency;
}

async function clearPasswordReset(agency) {
  agency.passwordResetTokenHash = undefined;
  agency.passwordResetExpiresAt = undefined;
  await agency.save();
}

/**
 * @param {import('mongoose').Document} agency
 * @param {string} newPassword
 */
async function applyPasswordReset(agency, newPassword) {
  agency.passwordHash = await hashPassword(newPassword);
  agency.passwordResetTokenHash = undefined;
  agency.passwordResetExpiresAt = undefined;
  await agency.save();
}

function validateNewPassword(password) {
  const plain = password == null ? '' : String(password);
  if (plain.length < 8) {
    throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
  }
  return plain;
}

function normalizeAuthEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

module.exports = {
  createPasswordResetToken,
  findAgencyByResetToken,
  clearPasswordReset,
  applyPasswordReset,
  validateNewPassword,
  normalizeAuthEmail,
  hashResetToken,
};
