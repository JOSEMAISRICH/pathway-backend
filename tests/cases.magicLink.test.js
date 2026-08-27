/**
 * POST /api/cases/:id/magic-link
 */

const request = require('supertest');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase } = require('./helpers/agency');

describe('POST /api/cases/:id/magic-link', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); });

  test('genera token, guarda teléfono y devuelve magicLinkUrl', async () => {
    const { app, cookie, caseId, magicToken: oldToken } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/magic-link`)
      .set('Cookie', cookie)
      .send({ phone: '+34 600 111 222', clientName: 'ignored' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.case.clientPhone).toBe('+34 600 111 222');
    expect(res.body.case.magicToken).not.toBe(oldToken);
    expect(res.body.magicLinkUrl).toMatch(/\/portal\//);
    expect(res.body.case.magicLinkUrl).toContain(res.body.case.magicToken);
  });

  test('404 si el caso no existe', async () => {
    const { app, cookie } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post('/api/cases/507f1f77bcf86cd799439099/magic-link')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(404);
  });

  test('401 sin sesión', async () => {
    const { app, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app).post(`/api/cases/${caseId}/magic-link`).send({});
    expect(res.status).toBe(401);
  });
});
