/**
 * notifyClient.js
 * ---------------------------------------------------------------------------
 * Notificación al cliente final cuando el abogado aprueba o pide corrección.
 *
 * - Si RESEND_API_KEY está definida, envía email vía Resend.
 * - Si no hay API key o no hay email del cliente, solo registra (excepto en test).
 */

const { magicPortalUrl } = require('./portalUrl');
const { config } = require('../config');
const { sendResendEmail } = require('./resendMail');

/**
 * @param {Object} params
 * @param {Object} params.client            Documento Expediente (Mongoose).
 * @param {'approved'|'rejected'} params.decision
 * @param {string} [params.feedback]        Texto del abogado (en rejected).
 */
async function notifyClientReview({ client, decision, feedback }) {
  const portalUrl = magicPortalUrl(client.magicLinkToken) || '';
  const payload = {
    to: client.email || '(sin email)',
    fullName: client.fullName,
    decision,
    feedback: feedback || '',
    portalUrl: portalUrl || '(sin PORTAL_BASE_URL)',
    at: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log('[notifyClient][review]', JSON.stringify(payload));
  }

  const email = typeof client.email === 'string' ? client.email.trim() : '';
  if (!config.resendApiKey || !email || !email.includes('@')) {
    return;
  }

  try {
    const subject =
      decision === 'approved'
        ? 'Tu expediente ha sido aprobado'
        : 'Necesitamos una corrección en tu expediente';
    const lines = [
      `Hola ${client.fullName || ''},`.trim(),
      '',
      decision === 'approved'
        ? 'Tu expediente ha sido revisado y aprobado por el despacho.'
        : 'El despacho necesita que revises y corrijas algo en tu expediente.',
      feedback ? `\nMensaje del abogado:\n${feedback}` : '',
      portalUrl ? `\nAccede a tu portal:\n${portalUrl}` : '',
      '',
      '— PathWay',
    ];
    await sendResendEmail({
      to: email,
      subject,
      text: lines.join('\n'),
    });
  } catch (e) {
    console.error('[notifyClient][resend]', e.message);
  }
}

/**
 * Email al cliente cuando se rechaza un documento concreto (slot).
 */
async function notifyClientDocumentReview({ client, documentLabel, feedbackMessage }) {
  const portalUrl = magicPortalUrl(client.magicLinkToken) || '';
  const payload = {
    to: client.email || '(sin email)',
    fullName: client.fullName,
    documentLabel: documentLabel || 'documento',
    feedbackMessage: feedbackMessage || '',
    portalUrl: portalUrl || '(sin PORTAL_BASE_URL)',
    at: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log('[notifyClient][doc-review]', JSON.stringify(payload));
  }

  const email = typeof client.email === 'string' ? client.email.trim() : '';
  if (!config.resendApiKey || !email || !email.includes('@')) {
    return;
  }

  try {
    const label = documentLabel || 'un documento';
    const lines = [
      `Hola ${client.fullName || ''},`.trim(),
      '',
      `Tu gestor ha solicitado correcciones en ${label}.`,
      '',
      feedbackMessage ? `Mensaje:\n${feedbackMessage}` : '',
      portalUrl ? `\nAccede a tu portal para volver a subirlo:\n${portalUrl}` : '',
      '',
      '— PathWay',
    ];
    await sendResendEmail({
      to: email,
      subject: `Corrección solicitada: ${label}`,
      text: lines.join('\n'),
    });
  } catch (e) {
    console.error('[notifyClient][doc-review][resend]', e.message);
  }
}

module.exports = { notifyClientReview, notifyClientDocumentReview };
