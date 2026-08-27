/**
 * Tests de descarga del PDF estampado.
 * GET /api/cases/:id/final-pdf  (agencia)
 * GET /api/magic/:token/final-pdf  (cliente)
 */

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');

const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, registerAgency, getApp } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');
const { PDF_NOT_READY_MESSAGE } = require('../src/lib/finalPdfResponse');

describe('GET final-pdf', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); OpenAI.__reset(); });

  test('agencia: 404 cuando todavía no se ha generado el PDF', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app).get(`/api/cases/${caseId}/final-pdf`).set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe(PDF_NOT_READY_MESSAGE);
  });

  test('agencia: 200 inline tras upload', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');

    const res = await request(app)
      .get(`/api/cases/${caseId}/final-pdf`)
      .set('Cookie', cookie)
      .buffer(true).parse((res2, cb) => {
        const chunks = [];
        res2.on('data', (c) => chunks.push(c));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/inline/);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  test('agencia: ?download=1 fuerza Content-Disposition: attachment', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');

    const res = await request(app)
      .get(`/api/cases/${caseId}/final-pdf?download=1`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  test('agencia: 404 si el caso es de otra agencia (aislamiento)', async () => {
    const { caseId } = await bootstrapAgencyAndCase();
    const { cookie: otherCookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app).get(`/api/cases/${caseId}/final-pdf`).set('Cookie', otherCookie);
    expect(res.status).toBe(404);
  });

  test('magic: 404 antes del upload', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app).get(`/api/magic/${magicToken}/final-pdf`);
    expect(res.status).toBe(404);
  });

  test('magic: 200 tras upload', async () => {
    const { app, cookie, caseId, magicToken } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');
    const res = await request(app).get(`/api/magic/${magicToken}/final-pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });
});
