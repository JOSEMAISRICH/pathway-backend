const { config } = require('../config');
const { httpError } = require('./httpError');

function getResendClient() {
  if (!config.resendApiKey) return null;
  const { Resend } = require('resend');
  return new Resend(config.resendApiKey);
}

function defaultFrom() {
  return config.resendFrom || 'PathWay <onboarding@resend.dev>';
}

/**
 * Envía email vía Resend y lanza si la API devuelve error (no siempre hace throw).
 * @param {{ from?: string, to: string|string[], subject: string, text?: string, html?: string }} payload
 */
async function sendResendEmail(payload) {
  const resend = getResendClient();
  if (!resend) {
    throw httpError(503, 'RESEND_API_KEY no configurada');
  }
  const result = await resend.emails.send({
    from: defaultFrom(),
    ...payload,
  });
  if (result.error) {
    const msg =
      result.error.message ||
      result.error.name ||
      'Resend rechazó el envío del email';
    throw httpError(502, msg);
  }
  return result.data;
}

module.exports = { getResendClient, defaultFrom, sendResendEmail };
