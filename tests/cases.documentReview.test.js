/**
 * PATCH /api/cases/:caseId/documents/:docId/review
 */

jest.mock('openai');

const request = require('supertest');
const Client = require('../src/models/client');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

describe('PATCH /api/cases/:caseId/documents/:docId/review', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  async function proofDocId(magicToken) {
    const app = await getApp();
    const portal = await request(app).get(`/api/magic/${magicToken}`);
    return portal.body.case.documents.find((d) => d.key === 'proof_address')?.id;
  }

  async function uploadProof(app, magicToken, docId) {
    return request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'domicilio.png');
  }

  test('rechazar documento con archivo → rejected + hasRejectedDocuments', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);

    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'rejected', feedbackMessage: 'El recibo no es legible' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const slot = res.body.case.documents.find((d) => d.id === docId);
    expect(slot.status).toBe('rejected');
    expect(slot.feedbackMessage).toBe('El recibo no es legible');
    expect(res.body.case.hasRejectedDocuments).toBe(true);
    expect(res.body.case.reviewStatus).toBe('pending');
  });

  test('aprobar documento → approved y limpia feedback', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);

    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    const slot = res.body.case.documents.find((d) => d.id === docId);
    expect(slot.status).toBe('approved');
    expect(slot.feedbackMessage).toBe('');
  });

  test('sin archivo → 400', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/archivo/i);
  });

  test('docId inválido → 404', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/507f1f77bcf86cd799439099/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });

  test('rechazo sin feedbackMessage suficiente → 400', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'rejected', feedbackMessage: 'no' });
    expect(res.status).toBe(400);
  });

  test('GET magic muestra feedback tras rechazo; re-upload vuelve a pending', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);
    await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'rejected', feedbackMessage: 'Corrija el documento' });

    const portal = await request(app).get(`/api/magic/${magicToken}`);
    const slot = portal.body.case.documents.find((d) => d.id === docId);
    expect(slot.feedbackMessage).toBe('Corrija el documento');

    const reUp = await uploadProof(app, magicToken, docId);
    expect(reUp.status).toBe(200);
    const slot2 = reUp.body.case.documents.find((d) => d.id === docId);
    expect(slot2.status).toBe('pending');
    expect(slot2.feedbackMessage).toBe('');
  });

  test('GET /api/cases lista hasRejectedDocuments', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);
    await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'rejected', feedbackMessage: 'Documento ilegible' });

    const list = await request(app).get('/api/cases').set('Cookie', cookie);
    const row = list.body.cases.find((c) => c.id === caseId);
    expect(row.hasRejectedDocuments).toBe(true);
    expect(row.documentsCount).toBeGreaterThanOrEqual(3);
  });

  test('aprobar ya aprobado → 409', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    const docId = await proofDocId(magicToken);
    await uploadProof(app, magicToken, docId);
    await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });
    const res = await request(app)
      .patch(`/api/cases/${caseId}/documents/${docId}/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });
    expect(res.status).toBe(409);
  });
});
