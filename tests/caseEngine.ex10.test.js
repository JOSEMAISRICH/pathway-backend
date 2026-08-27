/**
 * Case Engine — Nivel 2 EX-10
 */

const request = require('supertest');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { registerAgency, getApp } = require('./helpers/agency');

describe('Case Engine EX-10', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  test('GET /api/cases/types lista EX-10 y MVP-3', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app).get('/api/cases/types').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.caseTypes.some((t) => t.id === 'EX-10')).toBe(true);
    expect(res.body.caseTypes.some((t) => t.id === 'MVP-3')).toBe(true);
  });

  test('POST /api/cases con caseType EX-10 crea 6 documentos y checklist', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({
        clientName: 'Cliente EX10',
        clientEmail: 'ex10@test.local',
        caseType: 'EX-10',
      });
    expect(res.status).toBe(201);
    expect(res.body.case.caseType).toBe('EX-10');
    expect(res.body.case.documents.length).toBe(6);
    expect(res.body.case.checklist).toBeDefined();
    expect(Array.isArray(res.body.case.checklist)).toBe(true);
    expect(res.body.case.checklist.length).toBeGreaterThanOrEqual(4);
    const keys = res.body.case.documents.map((d) => d.key);
    expect(keys).toContain('fee_790');
    expect(keys).toContain('empadronamiento');
    expect(keys).toContain('criminal_record');
  });

  test('POST /api/cases sin caseType usa EX-10 por defecto', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({ clientName: 'Default Type' });
    expect(res.status).toBe(201);
    expect(res.body.case.caseType).toBe('EX-10');
    expect(res.body.case.documents.length).toBe(6);
  });

  test('POST /api/cases MVP-3 crea solo 3 documentos', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({ clientName: 'MVP', caseType: 'MVP-3' });
    expect(res.status).toBe(201);
    expect(res.body.case.caseType).toBe('MVP-3');
    expect(res.body.case.documents.length).toBe(3);
  });
});
