const Agency = require('../models/agency');
const { serializeBilling } = require('../lib/stripeBilling');

/**
 * Bloquea uso del panel (expedientes, etc.) si la prueba terminó y no hay suscripción activa.
 * Billing y auth quedan fuera para poder pagar o iniciar sesión.
 */
async function requirePaidPlan(req, res, next) {
  try {
    const agency = await Agency.findById(req.agencyId).exec();
    if (!agency) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }
    const billing = serializeBilling(agency);
    if (billing.active) {
      return next();
    }
    return res.status(402).json({
      error: 'Tu prueba gratuita ha terminado. Suscríbete para seguir usando PathWay.',
      code: 'SUBSCRIPTION_REQUIRED',
      billing,
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { requirePaidPlan };
