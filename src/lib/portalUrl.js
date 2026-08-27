const { config } = require('../config');

/** URL pública del portal cliente si PORTAL_BASE_URL está definida (ej. http://localhost:5500). */
function magicPortalUrl(token) {
  const base = (config.portalBaseUrl || '').replace(/\/$/, '');
  if (!base || !token) return null;
  return `${base}/portal/${token}`;
}

/** URL del front para restablecer contraseña del despacho (ej. .../reset-password?token=...). */
function passwordResetUrl(token) {
  const base = (config.portalBaseUrl || '').replace(/\/$/, '');
  if (!base || !token) return null;
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

module.exports = { magicPortalUrl, passwordResetUrl };
