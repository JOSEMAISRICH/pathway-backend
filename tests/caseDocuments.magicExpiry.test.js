/**
 * Documentos por defecto + caducidad magic link
 */

const request = require('supertest');
const Client = require('../src/models/client');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { isMagicLinkExpired, computeMagicExpiresAt } = require('../src/lib/magicLinkExpiry');

describe('case documents + magic link expiry', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  test('POST /api/cases crea 3 documentos y magicExpiresAt futuro', async () => {
    const { app, cookie } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({ fullName: 'Nuevo Cliente', email: 'n@test.local' });
    expect(res.status).toBe(201);
    expect(res.body.case.documents.length).toBeGreaterThanOrEqual(3);
    const keys = res.body.case.documents.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['passport', 'proof_address', 'photo']));
    expect(new Date(res.body.case.magicExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const detail = await request(app)
      .get(`/api/cases/${res.body.case.id}`)
      .set('Cookie', cookie);
    expect(detail.body.case.documents.length).toBeGreaterThanOrEqual(3);
  });

  test('GET /api/magic/:token lista 3 zonas de subida', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app).get(`/api/magic/${magicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.case.documents).toHaveLength(3);
    expect(res.body.case.documents[0]).toMatchObject({
      id: expect.any(String),
      key: expect.any(String),
      label: expect.any(String),
      status: 'pending',
      hasFile: expect.any(Boolean),
    });
    expect(res.body.agency.name).toBeTruthy();
  });

  test('GET /api/magic/:token caducado → 410', async () => {
    const { app, caseId, magicToken } = await bootstrapAgencyAndCase();
    await Client.updateOne(
      { _id: caseId },
      { $set: { magicExpiresAt: new Date(Date.now() - 60_000) } }
    );
    const res = await request(app).get(`/api/magic/${magicToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Este enlace ha caducado');
  });

  test('POST magic-link regenera token e invalida el anterior', async () => {
    const { app, cookie, caseId, magicToken: oldToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/magic-link`)
      .set('Cookie', cookie)
      .send({ regenerate: true, clientPhone: '+34 600 000 000' });
    expect(res.status).toBe(200);
    expect(res.body.magicToken).not.toBe(oldToken);
    expect(res.body.magicExpiresAt).toBeTruthy();
    expect(new Date(res.body.magicExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const stale = await request(app).get(`/api/magic/${oldToken}`);
    expect(stale.status).toBe(404);

    const fresh = await request(app).get(`/api/magic/${res.body.magicToken}`);
    expect(fresh.status).toBe(200);
  });

  test('isMagicLinkExpired respeta null como no caducado', () => {
    expect(isMagicLinkExpired(null)).toBe(false);
    expect(isMagicLinkExpired(computeMagicExpiresAt())).toBe(false);
    expect(isMagicLinkExpired(new Date(Date.now() - 1000))).toBe(true);
  });
});
