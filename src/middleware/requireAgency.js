const { verifySession } = require('../lib/jwt');
const { config } = require('../config');

async function requireAgency(req, res, next) {
  const raw = req.cookies?.[config.cookieName];
  if (!raw) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const { agencyId } = await verifySession(raw);
    req.agencyId = agencyId;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

module.exports = { requireAgency };
