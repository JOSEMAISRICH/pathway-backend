/**
 * Email de recuperación de contraseña del despacho (POST /api/auth/forgot-password).
 */

const { passwordResetUrl } = require('./portalUrl');
const { config } = require('../config');
const { sendResendEmail } = require('./resendMail');

/**
 * @param {import('mongoose').Document} agency
 * @param {string} rawToken
 * @returns {Promise<{ sent: boolean, to: string, resetUrl: string|null, reason?: string }>}
 */
async function sendPasswordResetEmail(agency, rawToken) {
  const email = typeof agency.email === 'string' ? agency.email.trim() : '';
  const resetUrl = passwordResetUrl(rawToken);

  if (!email || !email.includes('@')) {
    return {
      sent: false,
      to: email,
      resetUrl,
      reason: 'Email de agencia no válido',
    };
  }

  if (!resetUrl) {
    return {
      sent: false,
      to: email,
      resetUrl: null,
      reason: 'PORTAL_BASE_URL no configurada; enlace de restablecimiento no generado',
    };
  }

  const payload = {
    to: email,
    agencyName: agency.name,
    resetUrl,
    at: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== 'test') {
    console.log('[notifyAuth][password-reset]', JSON.stringify(payload));
  }

  if (!config.resendApiKey) {
    return {
      sent: false,
      to: email,
      resetUrl,
      reason: 'RESEND_API_KEY no configurada; enlace generado pero email no enviado',
    };
  }

  try {
    const lines = [
      `Hola${agency.name ? ` ${agency.name}` : ''},`.trim(),
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta en PathWay.',
      '',
      'Si fuiste tú, abre este enlace (válido durante un tiempo limitado):',
      resetUrl,
      '',
      'Si no solicitaste el cambio, ignora este mensaje; tu contraseña no se modificará.',
      '',
      '— PathWay',
    ];
    await sendResendEmail({
      to: email,
      subject: 'Restablece tu contraseña en PathWay',
      text: lines.join('\n'),
    });
    return { sent: true, to: email, resetUrl };
  } catch (e) {
    const msg = e.message || 'Error de Resend';
    console.error('[notifyAuth][password-reset][resend]', msg);
    return {
      sent: false,
      to: email,
      resetUrl,
      reason: `No se pudo enviar el email: ${msg}`,
    };
  }
}

module.exports = { sendPasswordResetEmail };
