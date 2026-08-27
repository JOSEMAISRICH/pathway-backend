/**
 * Tests del flujo de portal cliente vía magic link:
 *  GET  /api/magic/:token            (incluye reviewStatus + feedback)
 *  POST /api/magic/:token/upload-passport
 */

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');

const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, prepareMvp3CaseForApproval } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

describe('Magic link cliente', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); OpenAI.__reset(); });

  test('GET /api/magic/:token devuelve el caso con feedback vacío al inicio', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app).get(`/api/magic/${magicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.case.reviewStatus).toBe('pending');
    expect(res.body.case.feedbackMessage).toBe('');
    expect(res.body.case.hasFinalPdf).toBe(false);
  });

  test('POST upload-passport corre el pipeline y devuelve PDF accesible', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload-passport`)
      .attach('file', tinyPng, 'p.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.extractedData.fields.nombre.value).toBe('JUAN');
    expect(res.body.pdf.downloadUrl).toBe(`/api/magic/${magicToken}/final-pdf`);

    const pdfRes = await request(app).get(res.body.pdf.downloadUrl);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
  });

  test('Tras reject del abogado, el GET magic muestra el feedback en rojo', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');
    await request(app)
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', cookie)
      .send({ action: 'reject', feedback: 'Necesito una foto más clara' });

    const res = await request(app).get(`/api/magic/${magicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.case.reviewStatus).toBe('rejected');
    expect(res.body.case.feedbackMessage).toBe('Necesito una foto más clara');
  });

  test('Tras approve el portal sigue visible pero las subidas quedan bloqueadas', async () => {
    const ctx = await bootstrapAgencyAndCase();
    await prepareMvp3CaseForApproval(ctx);
    await request(ctx.app)
      .patch(`/api/cases/${ctx.caseId}/review`)
      .set('Cookie', ctx.cookie)
      .send({ action: 'approve' });

    const portal = await request(ctx.app).get(`/api/magic/${ctx.magicToken}`);
    expect(portal.status).toBe(200);
    expect(portal.body.case.reviewStatus).toBe('approved');
    expect(portal.body.case.finalPdfUrl).toMatch(/final-pdf/);

    const portalDocs = await request(ctx.app).get(`/api/magic/${ctx.magicToken}`);
    const docId = portalDocs.body.case.documents.find((d) => d.key === 'photo')?.id;
    const blocked = await request(ctx.app)
      .post(`/api/magic/${ctx.magicToken}/upload`)
      .field('docId', docId)
      .attach('file', tinyPng, 'x.png');
    expect(blocked.status).toBe(410);
  });

  test('Magic link inválido → 404', async () => {
    const { app } = await bootstrapAgencyAndCase();
    const res = await request(app).get('/api/magic/no-existe');
    expect(res.status).toBe(404);
  });

  test('Upload con MIME no soportado → 400', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload-passport`)
      .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });
});
