const request = require('supertest');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase } = require('./helpers/agency');

describe('POST /api/cases/:id/send-magic-email', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); });

  test('200 sin Resend: devuelve magicLinkUrl y sent false', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/send-magic-email`)
      .set('Cookie', cookie)
      .send({ phone: '+34 600 000 000' });
    expect(res.body.success).toBe(true);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.magicLinkUrl).toMatch(/\/portal\//);
    expect(res.body.email.emailSent).toBe(false);
  });

  test('400 si el cliente no tiene email', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase({
      case: { fullName: 'Sin Mail', email: '' },
    });
    const res = await request(app)
      .post(`/api/cases/${caseId}/send-magic-email`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});
