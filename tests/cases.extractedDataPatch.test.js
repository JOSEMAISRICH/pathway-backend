/**
 * PATCH /api/cases/:caseId/documents/:docId/extracted-data
 */

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

describe('PATCH extracted-data', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    OpenAI.__reset();
    await clearAll();
  });

  async function passportDocId(magicToken) {
    const app = await getApp();
    const portal = await request(app).get(`/api/magic/${magicToken}`);
    return portal.body.case.documents.find((d) => d.key === 'passport')?.id;
  }

  test('corrige apellidos → ingestionStatus processed', async () => {
    OpenAI.__setNextResponse(
      JSON.stringify({
        nombre: 'Ana',
        apellidos: null,
        numero_pasaporte: 'X1234567',
        fecha_nacimiento: '1990-05-01',
      })
    );
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/magic/${magicToken}/upload-passport`)
      .attach('file', tinyPng, 'passport.png');

    const docId = await passportDocId(magicToken);
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/extracted-data`)
      .set('Cookie', cookie)
      .send({ fields: { apellidos: 'García López' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.extractedData.ingestionStatus).toBe('processed');
    const passport = res.body.case.documents.find((d) => d.id === docId);
    expect(passport.ingestionStatus).toBe('processed');
    expect(passport.extractedData.fields.apellidos.value).toBe('García López');
  });

  test('domicilio → 400', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const app2 = app;
    const portal = await request(app2).get(`/api/magic/${magicToken}`);
    const docId = portal.body.case.documents.find((d) => d.key === 'proof_address')?.id;
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/extracted-data`)
      .set('Cookie', cookie)
      .send({ fields: { nombre: 'Test' } });
    expect(res.status).toBe(400);
  });
});
