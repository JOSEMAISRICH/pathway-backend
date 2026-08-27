const request = require('supertest');
const Agency = require('../src/models/agency');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { registerAgency, getApp } = require('./helpers/agency');
const { hashResetToken } = require('../src/lib/passwordReset');

describe('auth password reset', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  test('forgot-password con email desconocido → 200 genérico', async () => {
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nadie@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/recibirás un enlace/i);
    expect(res.body.email).toBeUndefined();
  });

  test('forgot-password con cuenta → guarda token y email.sent false sin Resend', async () => {
    const { email } = await registerAgency({ email: 'owner@test.local' });
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();

    const agency = await Agency.findOne({ email })
      .select('+passwordResetTokenHash +passwordResetExpiresAt')
      .exec();
    expect(agency.passwordResetTokenHash).toBeTruthy();
    expect(agency.passwordResetExpiresAt).toBeInstanceOf(Date);
  });

  test('reset-password cambia contraseña y permite login', async () => {
    const { email, password: oldPass } = await registerAgency({
      email: 'reset@test.local',
      password: 'old-pass-12',
    });
    const app = await getApp();
    await request(app).post('/api/auth/forgot-password').send({ email });

    const agency = await Agency.findOne({ email })
      .select('+passwordResetTokenHash')
      .exec();
    const rawToken = 'known-test-token-for-reset';
    agency.passwordResetTokenHash = hashResetToken(rawToken);
    agency.passwordResetExpiresAt = new Date(Date.now() + 3600_000);
    await agency.save();

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-pass-99' });
    expect(resetRes.status).toBe(200);

    const badLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: oldPass });
    expect(badLogin.status).toBe(401);

    const okLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'new-pass-99' });
    expect(okLogin.status).toBe(200);
  });

  test('reset-password con token inválido → 400', async () => {
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'no-existe', password: 'new-pass-99' });
    expect(res.status).toBe(400);
  });

  test('reset-password con contraseña corta → 400', async () => {
    const app = await getApp();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });
});
