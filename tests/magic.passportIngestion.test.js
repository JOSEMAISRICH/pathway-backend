/**
 * POST /api/magic/:token/upload-passport — ingesta Nivel 1
 */

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

describe('POST /api/magic/:token/upload-passport ingestion', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
    OpenAI.__reset();
  });

  test('200 con ingestionStatus + extractedData v1.0', async () => {
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload-passport`)
      .attach('file', tinyPng, 'passport.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ingestionStatus).toMatch(/processed|requires_review/);
    expect(res.body.extractedData.schemaVersion).toBe('1.0');
    expect(res.body.extractedData.fields.nombre.value).toBe('JUAN');

    const passport = res.body.case.documents.find((d) => d.key === 'passport');
    expect(passport.ingestionStatus).toMatch(/processed|requires_review/);
    expect(passport.extractedData?.schemaVersion).toBe('1.0');
  });

  test('IA parcial → requires_review sin 500', async () => {
    OpenAI.__setNextResponse(JSON.stringify({ nombre: 'Solo Nombre' }));
    const { app, magicToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/magic/${magicToken}/upload-passport`)
      .attach('file', tinyPng, 'blur.png');
    expect(res.status).toBe(200);
    expect(res.body.ingestionStatus).toBe('requires_review');
  });
});
