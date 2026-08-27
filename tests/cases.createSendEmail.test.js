/**
 * POST /api/cases con sendMagicLinkEmail
 */

const request = require('supertest');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp, registerAgency } = require('./helpers/agency');

describe('POST /api/cases sendMagicLinkEmail', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  test('crear con sendMagicLinkEmail → emailSent false sin Resend (201 + case OK)', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({
        clientName: 'Cliente Email',
        clientEmail: 'cliente@test.local',
        sendMagicLinkEmail: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.case.id).toBeTruthy();
    expect(res.body.case.clientEmail).toBe('cliente@test.local');
    expect(res.body.case.magicLinkToken).toBeTruthy();
    expect(res.body.case.magicLinkUrl).toMatch(/\/portal\//);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.emailError).toMatch(/RESEND_API_KEY|Correo no configurado/i);
  });

  test('GET list y GET detail OK justo después de crear', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const created = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({
        clientName: 'Inmediato',
        clientEmail: 'inm@test.local',
        clientPhone: '+34 600 111 222',
      });
    const caseId = created.body.case.id;

    const list = await request(app).get('/api/cases').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.cases.some((c) => c.id === caseId)).toBe(true);

    const detail = await request(app).get(`/api/cases/${caseId}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.case.id).toBe(caseId);
    expect(detail.body.case.documents.length).toBeGreaterThanOrEqual(3);
    expect(detail.body.case.clientPhone).toBe('+34 600 111 222');
  });

  test('sin sendMagicLinkEmail no incluye emailSent', async () => {
    const { cookie } = await registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', cookie)
      .send({ clientName: 'Sin Mail Flag', clientEmail: 'a@b.c' });
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBeUndefined();
  });
});
