/**
 * Facturación Stripe — despacho autenticado.
 *
 * POST /api/billing/checkout  → { url }  (redirigir al Checkout de Stripe)
 * GET  /api/billing/status    → estado suscripción
 * POST /api/billing/sync      → { sessionId } sincroniza tras volver de Checkout
 * POST /api/billing/webhook   → webhooks Stripe (sin cookie; firma Stripe)
 */

const express = require('express');
const Agency = require('../models/agency');
const { mongoReady } = require('../middleware/mongoReady');
const { requireAgency } = require('../middleware/requireAgency');
const { isStripeConfigured } = require('../lib/stripeClient');
const {
  serializeBilling,
  createCheckoutSession,
  processStripeWebhook,
  syncCheckoutSession,
} = require('../lib/stripeBilling');

const router = express.Router();

router.get('/status', mongoReady, requireAgency, async (req, res, next) => {
  try {
    const agency = await Agency.findById(req.agencyId).exec();
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });
    return res.json({
      billing: serializeBilling(agency),
      stripeConfigured: isStripeConfigured(),
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/checkout', mongoReady, requireAgency, async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: 'Pagos no configurados: falta STRIPE_SECRET_KEY en el servidor.',
      });
    }
    const agency = await Agency.findById(req.agencyId).exec();
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });

    const body = req.body || {};
    /** Stripe cobra desde ya; la prueba gratuita es en app (sin tarjeta al registrarse). */
    const trial = body.trial === true || body.trial === 'true';
    const { url, sessionId } = await createCheckoutSession(agency, {
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      trial,
      customerEmail: body.customerEmail || body.email,
    });

    return res.status(200).json({
      ok: true,
      url,
      sessionId,
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    console.error('[billing][checkout]', e.message);
    return res.status(502).json({ error: e.message || 'No se pudo crear la sesión de pago' });
  }
});

router.post('/sync', mongoReady, requireAgency, async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Pagos no configurados' });
    }
    const agency = await Agency.findById(req.agencyId).exec();
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada' });

    const sessionId = req.body?.sessionId || req.body?.session_id;
    const billing = await syncCheckoutSession(agency, sessionId);
    return res.json({ ok: true, billing });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

/**
 * Webhook: montar con express.raw en app.js (antes de express.json).
 */
async function stripeWebhookHandler(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Falta cabecera stripe-signature' });
    }
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({
        error: 'Webhook requiere body raw (Buffer). Revisa el orden de middlewares en app.js.',
      });
    }
    const result = await processStripeWebhook(rawBody, signature);
    return res.json(result);
  } catch (e) {
    const status = e.statusCode || 400;
    console.error('[billing][webhook]', e.message);
    return res.status(status).json({ error: e.message || 'Webhook error' });
  }
}

module.exports = { router, stripeWebhookHandler };
