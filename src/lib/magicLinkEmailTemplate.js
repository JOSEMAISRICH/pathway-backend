/**
 * Plantilla HTML + texto plano — email magic link al cliente.
 * Logo: {PUBLIC_APP_ORIGIN}/email/pathway-logo.png (servido por Next en pathwaysaas/public/email/)
 */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} opts
 * @param {string} opts.clientName
 * @param {string} opts.portalUrl
 * @param {string} [opts.agencyName]
 * @param {string} opts.appOrigin — PUBLIC_APP_ORIGIN sin barra final
 * @param {string} [opts.privacyUrl]
 */
function buildMagicLinkEmailContent({
  clientName,
  portalUrl,
  agencyName,
  appOrigin,
  privacyUrl,
}) {
  const name = (clientName ?? '').trim() || 'Cliente';
  const agency = (agencyName ?? '').trim() || 'tu despacho';
  const origin = (appOrigin ?? 'http://localhost:5500').replace(/\/$/, '');
  const logoUrl = `${origin}/email/pathway-logo.png`;
  const privacy = (privacyUrl ?? `${origin}/pathway`).trim();
  const safeName = escapeHtml(name);
  const safeAgency = escapeHtml(agency);
  const safeUrl = escapeHtml(portalUrl);
  const safePrivacy = escapeHtml(privacy);

  const subject = `${agency} — Acceso para subir tu documentación`;

  const text = `Hola ${name},

${agency} te envía el acceso para subir la documentación de tu expediente a través de PathWay.

Abre este enlace desde tu móvil u ordenador:
${portalUrl}

No necesitas crear cuenta ni contraseña. El enlace es personal: no lo compartas con terceros.

Si no esperabas este mensaje, ignóralo o contacta con ${agency}.

—
PathWay — Infraestructura digital para despachos
${origin}

Protección de datos: ${agency} es responsable del tratamiento de tus datos para este trámite. PathWay actúa como encargado del tratamiento tecnológico. Más información: ${privacy}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0f1419;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1419;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171e26;border:1px solid #2d3848;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;background:#121820;border-bottom:1px solid #2d3848;">
              <img src="${logoUrl}" alt="PathWay" width="180" height="auto" style="display:inline-block;max-width:180px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;color:#eef1f5;font-size:16px;line-height:1.5;">
              <p style="margin:0 0 16px;font-size:18px;font-weight:600;">Hola ${safeName},</p>
              <p style="margin:0 0 16px;color:#94a3b8;">
                <strong style="color:#eef1f5;">${safeAgency}</strong> te envía el acceso para subir la documentación de tu expediente de forma segura.
              </p>
              <p style="margin:0 0 24px;color:#94a3b8;">
                Pulsa el botón para abrir tu portal personal. No necesitas crear cuenta ni contraseña.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:12px;background:#4a6fa5;">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;color:#0a1018;font-size:15px;font-weight:600;text-decoration:none;">
                      Abrir mi portal de documentación
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#64748b;font-size:12px;">Si el botón no funciona, copia y pega este enlace:</p>
              <p style="margin:0 0 24px;word-break:break-all;font-size:12px;">
                <a href="${safeUrl}" style="color:#7eb3e8;text-decoration:underline;">${safeUrl}</a>
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1f2833;border:1px solid #2d3848;border-radius:12px;">
                <tr>
                  <td style="padding:16px;color:#94a3b8;font-size:13px;line-height:1.5;">
                    <strong style="color:#e07070;">Importante:</strong> este enlace es personal e intransferible. No lo reenvíes a otras personas.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #2d3848;color:#64748b;font-size:11px;line-height:1.6;">
              <p style="margin:0 0 8px;">
                Si no esperabas este correo, ignóralo o contacta directamente con <strong style="color:#94a3b8;">${safeAgency}</strong>.
              </p>
              <p style="margin:0 0 8px;">
                <strong style="color:#94a3b8;">Protección de datos (RGPD):</strong> ${safeAgency} es el responsable del tratamiento de tus datos para este trámite.
                PathWay proporciona la plataforma tecnológica como encargado del tratamiento.
              </p>
              <p style="margin:0;">
                Más información: <a href="${safePrivacy}" style="color:#7eb3e8;">${safePrivacy}</a>
              </p>
              <p style="margin:16px 0 0;font-size:10px;color:#475569;">
                PathWay — Infraestructura digital · ${escapeHtml(origin)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

module.exports = {
  escapeHtml,
  buildMagicLinkEmailContent,
};
