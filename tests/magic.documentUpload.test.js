/**
 * POST /api/magic/:token/upload — documentos genéricos
 */

const request = require('supertest');
const Client = require('../src/models/client');
const Document = require('../src/models/document');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

describe('POST /api/magic/:token/upload', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  async function docIdByKey(magicToken, key) {
    const app = await getApp();
    const portal = await request(app).get(`/api/magic/${magicToken}`);
    const doc = portal.body.case.documents.find((d) => d.key === key);
    return doc?.id;
  }

  test('proof_address → 200, hasFile true, progress sube', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'proof_address');
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'domicilio.png');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ingestionStatus).toBe('processed');
    const slot = res.body.case.documents.find((d) => d.key === 'proof_address');
    expect(slot.hasFile).toBe(true);
    expect(slot.ingestionStatus).toBe('processed');
    expect(slot.originalName).toBe('domicilio.png');
    expect(slot.uploadedAt).toBeTruthy();
    expect(res.body.case.progress).toBeGreaterThan(0);
  });

  test('photo → 200, hasFile true', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'photo');
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'foto.png');
    expect(res.status).toBe(200);
    const slot = res.body.case.documents.find((d) => d.key === 'photo');
    expect(slot.hasFile).toBe(true);
  });

  test('passport docId → 400', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'passport');
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'pass.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/upload-passport/i);
  });

  test('token caducado → 410', async () => {
    const { app, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'photo');
    await Client.updateOne(
      { _id: caseId },
      { $set: { magicExpiresAt: new Date(Date.now() - 60_000) } }
    );
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'f.png');
    expect(res.status).toBe(410);
  });

  test('doc aprobado → 409', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'photo');
    await Document.updateOne({ _id: docId }, { $set: { reviewStatus: 'approved' } });
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'f.png');
    expect(res.status).toBe(409);
  });

  test('GET /api/cases/:id refleja documentos y progress (despacho)', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'proof_address');
    await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'dom.pdf.png');

    const detail = await request(app)
      .get(`/api/cases/${caseId}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.case.progress).toBeGreaterThan(0);
    const slot = detail.body.case.documents.find((d) => d.key === 'proof_address');
    expect(slot.hasFile).toBe(true);
  });

  test('archivo accesible vía GET /api/files/...?token=', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const docId = await docIdByKey(magicToken, 'photo');
    const up = await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'carnet.png');
    const filePath = up.body.case.documents.find((d) => d.key === 'photo').filePath;
    expect(filePath).toBeTruthy();
    const fileRes = await request(app).get(`/api/files/${filePath}?token=${magicToken}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-disposition']).toMatch(/inline/i);
  });
});
