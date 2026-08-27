/**
 * Envío de email con magic link (Resend).
 * Alineado con pathway-express-patches/lib/notifyMagicLinkEmail.js
 */

const { Resend } = require('resend');
const { magicPortalUrl } = require('./portalUrl');
const { httpError } = require('./httpError');
const { buildMagicLinkEmailContent } = require('./magicLinkEmailTemplate');

function appOrigin() {
  return (
    process.env.PUBLIC_APP_ORIGIN ??
    process.env.PORTAL_BASE_URL ??
    'http://localhost:5500'
  ).replace(/\/$/, '');
}

function friendlyResendError(message) {
  const m = String(message ?? '');
  if (m.includes('only send testing emails to your own email')) {
    return 'Resend en modo prueba: solo puedes enviar a tu email verificado. Verifica un dominio en resend.com/domains para enviar a cualquier cliente.';
  }
  return m || 'No se pudo enviar el correo.';
}

/**
 * @param {object} opts
 * @param {string} opts.to — email del cliente
 * @param {string} opts.clientName
 * @param {string} opts.portalUrl
 * @param {string} [opts.agencyName]
 * @returns {Promise<{ ok: boolean, emailSent?: boolean, error?: string, id?: string }>}
 */
async function notifyMagicLinkEmail({ to, clientName, portalUrl, agencyName }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey) {
    return {
      ok: false,
      emailSent: false,
      error: 'Correo no configurado: falta RESEND_API_KEY en el servidor.',
    };
  }
  if (!from) {
    return {
      ok: false,
      emailSent: false,
      error: 'Correo no configurado: falta RESEND_FROM en el servidor.',
    };
  }
  if (!to?.trim()) {
    return {
      ok: false,
      emailSent: false,
      error: 'El expediente no tiene email de cliente.',
    };
  }

  const { subject, html, text } = buildMagicLinkEmailContent({
    clientName,
    portalUrl,
    agencyName,
    appOrigin: appOrigin(),
    privacyUrl: process.env.PRIVACY_POLICY_URL,
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [to.trim()],
      subject,
      html,
      text,
    });

    if (error) {
      return {
        ok: false,
        emailSent: false,
        error: friendlyResendError(error.message),
      };
    }

    return { ok: true, emailSent: true, id: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, emailSent: false, error: friendlyResendError(msg) };
  }
}

function clientDisplayName(client) {
  return client.fullName || client.clientName || 'Cliente';
}

/**
 * Adaptador para rutas Express (POST /api/cases, send-magic-email).
 * @param {import('mongoose').Document} client
 * @param {{ magicLinkUrl?: string|null, agencyName?: string, throwOnFailure?: boolean }} [opts]
 */
async function sendMagicLinkEmailToClient(client, opts = {}) {
  const throwOnFailure = opts.throwOnFailure !== false;
  const portalUrl =
    opts.magicLinkUrl ?? magicPortalUrl(client.magicLinkToken) ?? null;
  const email = typeof client.email === 'string' ? client.email.trim() : '';

  if (!portalUrl) {
    const msg =
      'PUBLIC_APP_ORIGIN no está configurada; no se puede generar el enlace del portal ' +
      '(ej. http://localhost:5500 o http://192.168.x.x:5500 para móvil en la misma WiFi)';
    if (throwOnFailure) throw httpError(503, msg);
    return {
      ok: false,
      emailSent: false,
      sent: false,
      to: email,
      magicLinkUrl: null,
      error: msg,
      reason: msg,
    };
  }

  if (!email || !email.includes('@')) {
    const err = 'El expediente no tiene email de cliente.';
    if (throwOnFailure) throw httpError(400, err);
    return {
      ok: false,
      emailSent: false,
      sent: false,
      to: email,
      magicLinkUrl: portalUrl,
      error: err,
      reason: err,
    };
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      '[notifyClient][magic-link]',
      JSON.stringify({
        to: email,
        fullName: client.fullName,
        portalUrl,
        agencyName: opts.agencyName,
        at: new Date().toISOString(),
      })
    );
  }

  const result = await notifyMagicLinkEmail({
    to: email,
    clientName: clientDisplayName(client),
    portalUrl,
    agencyName: opts.agencyName,
  });

  const mapped = {
    ok: result.ok,
    emailSent: Boolean(result.emailSent),
    sent: Boolean(result.emailSent),
    to: email,
    magicLinkUrl: portalUrl,
    error: result.error,
    reason: result.error,
    id: result.id,
  };

  if (!result.ok && throwOnFailure) {
    if (result.error?.includes('no tiene email')) {
      throw httpError(400, result.error);
    }
    const configError = result.error?.startsWith('Correo no configurado:');
    if (!configError) {
      throw httpError(502, result.error || 'No se pudo enviar el email');
    }
  }

  return mapped;
}

module.exports = {
  appOrigin,
  friendlyResendError,
  notifyMagicLinkEmail,
  sendMagicLinkEmailToClient,
};
