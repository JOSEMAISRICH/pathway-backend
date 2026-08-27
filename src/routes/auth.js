const express = require('express');
const Agency = require('../models/agency');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signSession } = require('../lib/jwt');
const { config } = require('../config');
const { mongoReady } = require('../middleware/mongoReady');
const { requireAgency } = require('../middleware/requireAgency');
const {
  createPasswordResetToken,
  findAgencyByResetToken,
  applyPasswordReset,
  validateNewPassword,
  normalizeAuthEmail,
} = require('../lib/passwordReset');
const { sendPasswordResetEmail } = require('../lib/notifyPasswordReset');

const FORGOT_PASSWORD_MESSAGE =
  'Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.';

const router = express.Router();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

router.post('/register', mongoReady, async (req, res) => {
  if (!config.allowRegistration) {
    return res.status(403).json({ error: 'Registro deshabilitado' });
  }
  const body = req.body || {};
  const name = body.name || body.agencyName || body.companyName || body.agency?.name;
  const email = body.email || body.agencyEmail;
  const password = body.password;
  if (!name || !email || !password) {
    return res.status(400).json({
      error: 'Faltan datos: name (o agencyName), email y password',
      hint: 'El body debe incluir name, email y password (JSON).',
    });
  }
  try {
    const passwordHash = await hashPassword(password);
    const agency = await Agency.create({ name, email, passwordHash });
    const token = await signSession(agency.id);
    res.cookie(config.cookieName, token, sessionCookieOptions());
    return res.status(201).json({ ok: true, agency: agency.toJSON(), token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    return res.status(500).json({ error: 'Error al registrar' });
  }
});

router.post('/login', mongoReady, async (req, res) => {
  const body = req.body || {};
  const email = body.email || body.username || body.agencyEmail;
  const password = body.password;
  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan email (o username) y password' });
  }
  const agency = await Agency.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+passwordHash'
  );
  if (!agency) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const ok = await verifyPassword(password, agency.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = await signSession(agency.id);
  res.cookie(config.cookieName, token, sessionCookieOptions());
  return res.json({ ok: true, token });
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Siempre 200 (no revela si el email existe). Con cuenta válida genera token y envía email vía Resend.
 */
router.post('/forgot-password', mongoReady, async (req, res) => {
  const body = req.body || {};
  const email = normalizeAuthEmail(body.email || body.agencyEmail);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Indica un email válido' });
  }

  try {
    const agency = await Agency.findOne({ email }).exec();
    if (!agency) {
      return res.status(200).json({ ok: true, message: FORGOT_PASSWORD_MESSAGE });
    }

    const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
    agency.passwordResetTokenHash = tokenHash;
    agency.passwordResetExpiresAt = expiresAt;
    await agency.save();

    await sendPasswordResetEmail(agency, rawToken);

    return res.status(200).json({
      ok: true,
      message: FORGOT_PASSWORD_MESSAGE,
    });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo procesar la solicitud' });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password } (también newPassword)
 */
router.post('/reset-password', mongoReady, async (req, res) => {
  const body = req.body || {};
  const token = body.token || body.resetToken;
  const password = validateNewPassword(body.password ?? body.newPassword);

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Falta el token de restablecimiento' });
  }

  try {
    const agency = await findAgencyByResetToken(token);
    if (!agency) {
      return res.status(400).json({
        error: 'El enlace no es válido o ha caducado. Solicita uno nuevo.',
      });
    }

    await applyPasswordReset(agency, password);
    return res.status(200).json({
      ok: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: 'No se pudo restablecer la contraseña' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res.json({ ok: true });
});

router.get('/me', mongoReady, requireAgency, async (req, res) => {
  const agency = await Agency.findById(req.agencyId).exec();
  if (!agency) {
    return res.status(404).json({ error: 'Agencia no encontrada' });
  }
  return res.json({ agency: agency.toJSON() });
});

module.exports = router;
