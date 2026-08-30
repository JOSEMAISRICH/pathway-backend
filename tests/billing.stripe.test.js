/**
 * Billing Stripe — checkout / status (Stripe mockeado).
 */

jest.mock('../src/lib/stripeClient', () => ({
  isStripeConfigured: jest.fn(() => true),
  getStripe: jest.fn(),
}));

const request = require('supertest');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { registerAgency, getApp } = require('./helpers/agency');
const { getStripe, isStripeConfigured } = require('../src/lib/stripeClient');
const Agency = require('../src/models/agency');

describe('Billing Stripe', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
    isStripeConfigured.mockReturnValue(true);
    getStripe.mockReturnValue({
      customers: {
        create: jest.fn(async () => ({ id: 'cus_test_1' })),
        update: jest.fn(async () => ({})),
      },
      checkout: {
        sessions: {
          create: jest.fn(async () => ({
            id: 'cs_test_1',
            url: 'https://checkout.stripe.com/c/pay/cs_test_1',
          })),
          retrieve: jest.fn(async () => ({
            id: 'cs_test_1',
            client_reference_id: null,
            metadata: {},
            subscription: {
              id: 'sub_test_1',
              status: 'active',
              customer: 'cus_test_1',
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
              cancel_at_period_end: false,
              items: { data: [{ price: { id: 'price_test' } }] },
              metadata: {},
            },
          })),
        },
      },
      subscriptions: {
        retrieve: jest.fn(async () => ({
          id: 'sub_test_1',
          status: 'active',
          customer: 'cus_test_1',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_test' } }] },
          metadata: {},
        })),
      },
    });
  });

  test('GET /api/billing/status sin auth → 401', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/billing/status');
    expect(res.status).toBe(401);
  });

  test('GET /api/billing/status → app trial activo tras registro', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app).get('/api/billing/status').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.billing.active).toBe(true);
    expect(res.body.billing.status).toBe('app_trial');
    expect(res.body.billing.trialEndsAt).toBeTruthy();
    expect(res.body.billing.priceMonthly).toBe(75);
  });

  test('POST /api/billing/checkout → url Stripe (sin trial en Checkout)', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
    expect(res.body.sessionId).toBe('cs_test_1');

    const createCall = getStripe().checkout.sessions.create.mock.calls[0][0];
    expect(createCall.subscription_data.trial_period_days).toBeUndefined();

    const agency = await Agency.findOne({}).select('+stripe.customerId').exec();
    expect(agency.stripe.customerId).toBe('cus_test_1');
  });

  test('POST /api/billing/checkout sin Stripe → 503', async () => {
    isStripeConfigured.mockReturnValue(false);
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(503);
  });

  test('POST /api/billing/sync actualiza status active', async () => {
    const { cookie, agency } = await registerAgency();
    const app = await getApp();
    getStripe().checkout.sessions.retrieve.mockImplementation(async () => ({
      id: 'cs_test_1',
      client_reference_id: agency.id,
      metadata: { agencyId: agency.id },
      subscription: {
        id: 'sub_test_1',
        status: 'active',
        customer: 'cus_test_1',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: 'price_test' } }] },
        metadata: { agencyId: agency.id },
      },
    }));

    const res = await request(app)
      .post('/api/billing/sync')
      .set('Cookie', cookie)
      .send({ sessionId: 'cs_test_1' });

    expect(res.status).toBe(200);
    expect(res.body.billing.active).toBe(true);
    expect(res.body.billing.status).toBe('active');
  });
});
