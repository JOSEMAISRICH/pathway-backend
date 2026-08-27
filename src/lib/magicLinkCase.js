/**
 * Lógica compartida para generar / renovar magic link de un expediente.
 */

const { v4: uuidv4 } = require('uuid');
const { httpError } = require('./httpError');
const { magicPortalUrl } = require('./portalUrl');
const {
  computeMagicExpiresAt,
  assignFreshMagicLink,
} = require('./magicLinkExpiry');

/**
 * @param {object} body
 * @returns {string|undefined} undefined si no viene teléfono en el body
 */
function readClientPhone(body) {
  if (!body || typeof body !== 'object') return undefined;
  const v = body.phone ?? body.clientPhone ?? body.telefono;
  if (v == null) return undefined;
  return String(v).trim();
}

/**
 * @param {import('mongoose').Document} client
 * @param {unknown} raw valor de magicExpiresAt del body (undefined = no cambiar)
 */
function applyMagicExpiresAt(client, raw) {
  if (raw === undefined) return;
  if (raw === null || raw === '') {
    client.magicExpiresAt = null;
    return;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw httpError(400, 'magicExpiresAt no es una fecha válida');
  }
  client.magicExpiresAt = d;
}

/**
 * Genera token UUID, opcional teléfono y caducidad; persiste el expediente.
 *
 * @param {import('mongoose').Document} client
 * @param {object} body
 * @param {{ regenerateToken?: boolean }} [opts] por defecto regenera token
 */
async function issueMagicLinkForCase(client, body, opts = {}) {
  const { regenerateToken = true } = opts;
  const phone = readClientPhone(body);
  if (phone !== undefined) {
    client.phone = phone;
  }
  if (regenerateToken || !client.magicLinkToken) {
    assignFreshMagicLink(client, uuidv4());
  } else if (!client.magicExpiresAt) {
    client.magicExpiresAt = computeMagicExpiresAt();
  }
  applyMagicExpiresAt(client, body.magicExpiresAt);
  await client.save();
  const magicLinkUrl = magicPortalUrl(client.magicLinkToken);
  return {
    magicLinkUrl,
    magicToken: client.magicLinkToken,
    magicExpiresAt: client.magicExpiresAt,
  };
}

module.exports = {
  readClientPhone,
  applyMagicExpiresAt,
  issueMagicLinkForCase,
};
