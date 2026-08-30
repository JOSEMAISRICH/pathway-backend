/**
 * Facturación agencia vía Stripe Checkout (suscripción mensual).
 */

const Agency = require('../models/agency');
const { getStripe } = require('./stripeClient');
const { config } = require('../config');
const { httpError } = require('./httpError');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function appOrigin() {
  return (config.portalBaseUrl || 'http://localhost:5500').replace(/\/$/, '');
}

/** Fin de prueba en app (sin Stripe). Null si no aplica. */
function getAppTrialEnd(agency) {
  const stripeStatus = agency.stripe?.status || '';
  if (ACTIVE_STATUSES.has(stripeStatus)) return null;

  if (agency.trialEndsAt) {
    return new Date(agency.trialEndsAt);
  }

  if (agency.createdAt && config.appTrialDays > 0) {
    return new Date(new Date(agency.createdAt).getTime() + config.appTrialDays * 24 * 60 * 60 * 1000);
  }

  return null;
}

function isAppTrialActive(agency) {
  const end = getAppTrialEnd(agency);
  return Boolean(end && end > new Date());
}

function serializeBilling(agency) {
  const stripe = agency.stripe || {};
  const billing = agency.billing || {};
  const status = stripe.status || '';
  const stripeActive = ACTIVE_STATUSES.has(status);
  const appTrialEnd = getAppTrialEnd(agency);
  const appTrialActive = isAppTrialActive(agency);
  const periodEnd =
    stripe.currentPeriodEnd ||
    (appTrialActive && appTrialEnd ? appTrialEnd : null);

  return {
    configured: Boolean(config.stripeSecretKey),
    plan: billing.plan || 'standard',
    priceMonthly: billing.priceMonthly ?? 75,
    currency: (billing.currency || 'EUR').toUpperCase(),
    /** Email de la agencia (login); en Checkout se usa como facturación editable vía nuestro form. */
    email: agency.email || '',
    status: stripeActive ? status : appTrialActive ? 'app_trial' : status || 'none',
    active: stripeActive || appTrialActive,
    trialEndsAt: appTrialActive && appTrialEnd ? appTrialEnd.toISOString() : null,
    currentPeriodEnd: periodEnd
      ? periodEnd instanceof Date
        ? periodEnd.toISOString()
        : periodEnd
      : null,
    cancelAtPeriodEnd: Boolean(stripe.cancelAtPeriodEnd),
    subscriptionId: stripe.subscriptionId || null,
  };
}

async function ensureStripeCustomer(agency) {
  const stripe = getStripe();
  const withSecret = await Agency.findById(agency._id).select('+stripe.customerId').exec();
  const existing = withSecret?.stripe?.customerId;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: agency.email,
    name: agency.name,
    metadata: { agencyId: agency._id.toString() },
  });

  await Agency.updateOne(
    { _id: agency._id },
    { $set: { 'stripe.customerId': customer.id } }
  );
  return customer.id;
}

/**
 * Crea Checkout Session (mode=subscription) y devuelve URL.
 * @param {{ successUrl?: string, cancelUrl?: string, trial?: boolean, customerEmail?: string }} [opts]
 *
 * El email de facturación se elige en PathWay (campo editable). Stripe Checkout con `customer`
 * deja el correo fijo; por eso no se edita en la página de Stripe, sino antes de abrirla.
 */
async function createCheckoutSession(agency, { successUrl, cancelUrl, customerEmail } = {}) {
  const email = String(customerEmail || agency.email || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    throw httpError(400, 'Falta un email de facturación válido');
  }

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(agency);

  try {
    await stripe.customers.update(customerId, {
      email,
      name: agency.name || undefined,
      metadata: { agencyId: agency._id.toString() },
    });
  } catch (e) {
    console.warn('[billing][checkout] customers.update:', e.message);
  }

  const origin = appOrigin();
  const success =
    successUrl ||
    `${origin}/dashboard?billing=success`;
  const cancel =
    cancelUrl ||
    `${origin}/dashboard?billing=cancel`;

  const lineItems = config.stripePriceId
    ? [{ price: config.stripePriceId, quantity: 1 }]
    : [
        {
          price_data: {
            currency: (agency.billing?.currency || 'eur').toLowerCase(),
            unit_amount: Math.round((agency.billing?.priceMonthly ?? 75) * 100),
            recurring: { interval: 'month' },
            product_data: {
              name: `PathWay — Plan ${agency.billing?.plan || 'standard'}`,
              description: 'Suscripción mensual despacho PathWay',
            },
          },
          quantity: 1,
        },
      ];

  /** La prueba gratuita es en app; Stripe Checkout cobra desde el primer día. */
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: agency._id.toString(),
    line_items: lineItems,
    success_url: `${success}${success.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancel,
    metadata: { agencyId: agency._id.toString(), billingEmail: email },
    subscription_data: {
      metadata: { agencyId: agency._id.toString() },
    },
  });

  return { url: session.url, sessionId: session.id };
}

async function applySubscriptionToAgency(agencyId, subscription) {
  if (!agencyId || !subscription) return null;

  const priceId =
    subscription.items?.data?.[0]?.price?.id ||
    subscription.plan?.id ||
    '';

  const update = {
    'stripe.subscriptionId': subscription.id,
    'stripe.status': subscription.status || '',
    'stripe.priceId': priceId,
    'stripe.currentPeriodStart': subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    'stripe.currentPeriodEnd': subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    'stripe.cancelAtPeriodEnd': Boolean(subscription.cancel_at_period_end),
  };

  if (subscription.customer) {
    update['stripe.customerId'] = String(subscription.customer);
  }

  await Agency.updateOne({ _id: agencyId }, { $set: update });
  return Agency.findById(agencyId).exec();
}

async function handleCheckoutSessionCompleted(session) {
  const agencyId =
    session.client_reference_id ||
    session.metadata?.agencyId ||
    null;
  if (!agencyId || !session.subscription) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
  await applySubscriptionToAgency(agencyId, subscription);
}

async function handleSubscriptionUpdated(subscription) {
  const agencyId = subscription.metadata?.agencyId;
  if (agencyId) {
    await applySubscriptionToAgency(agencyId, subscription);
    return;
  }
  const agency = await Agency.findOne({
    'stripe.subscriptionId': subscription.id,
  }).exec();
  if (agency) {
    await applySubscriptionToAgency(agency._id, subscription);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const agency =
    (subscription.metadata?.agencyId
      ? await Agency.findById(subscription.metadata.agencyId).exec()
      : null) ||
    (await Agency.findOne({ 'stripe.subscriptionId': subscription.id }).exec());

  if (!agency) return;

  await Agency.updateOne(
    { _id: agency._id },
    {
      $set: {
        'stripe.status': 'canceled',
        'stripe.cancelAtPeriodEnd': false,
        'stripe.subscriptionId': subscription.id,
      },
    }
  );
}

/**
 * Procesa evento de webhook Stripe (body Buffer + signature).
 */
async function processStripeWebhook(rawBody, signature) {
  const stripe = getStripe();
  if (!config.stripeWebhookSecret) {
    throw httpError(
      503,
      'STRIPE_WEBHOOK_SECRET no configurada. Usa stripe listen o el secret del Dashboard.'
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripeWebhookSecret
    );
  } catch (err) {
    const e = httpError(400, `Webhook inválido: ${err.message}`);
    throw e;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    default:
      break;
  }

  return { received: true, type: event.type };
}

/**
 * Tras volver de Checkout: sincroniza sesión (útil si el webhook aún no llegó).
 */
async function syncCheckoutSession(agency, sessionId) {
  if (!sessionId) throw httpError(400, 'Falta session_id');
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  const sessionAgencyId = session.client_reference_id || session.metadata?.agencyId;
  if (sessionAgencyId && sessionAgencyId !== agency._id.toString()) {
    throw httpError(403, 'La sesión de pago no pertenece a esta agencia');
  }

  if (session.subscription) {
    const sub =
      typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    await applySubscriptionToAgency(agency._id, sub);
  }

  const fresh = await Agency.findById(agency._id).exec();
  return serializeBilling(fresh);
}

module.exports = {
  ACTIVE_STATUSES,
  serializeBilling,
  createCheckoutSession,
  processStripeWebhook,
  syncCheckoutSession,
  applySubscriptionToAgency,
};
