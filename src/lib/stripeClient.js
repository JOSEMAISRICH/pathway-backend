/**
 * Cliente Stripe (clave SOLO desde .env — nunca hardcodear sk_ en el código).
 */

const { config } = require('../config');

let stripeSingleton;

function getStripe() {
  if (!config.stripeSecretKey) {
    const err = new Error('STRIPE_SECRET_KEY no configurada en el servidor');
    err.statusCode = 503;
    throw err;
  }
  if (!stripeSingleton) {
    // eslint-disable-next-line global-require
    const Stripe = require('stripe');
    stripeSingleton = new Stripe(config.stripeSecretKey);
  }
  return stripeSingleton;
}

function isStripeConfigured() {
  return Boolean(config.stripeSecretKey);
}

module.exports = { getStripe, isStripeConfigured };
