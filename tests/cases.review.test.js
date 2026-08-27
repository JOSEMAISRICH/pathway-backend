/**
 * Tests del ciclo de revisión del abogado:
 *  PATCH /api/cases/:id/review  (approve | reject + feedback)
 *  + reset automático al re-upload del cliente.
 */

jest.mock('openai');

const request = require('supertest');
const OpenAI = require('openai');

const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, prepareMvp3CaseForApproval } = require('./helpers/agency');
const { tinyPng } = require('./helpers/fixtures');

async function uploadOnce(app, cookie, caseId) {
  return request(app)
    .post(`/api/cases/${caseId}/upload`)
    .set('Cookie', cookie)
    .attach('file', tinyPng, 'p.png');
}

describe('PATCH /api/cases/:id/review', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); OpenAI.__reset(); });

  test('acepta body con status: approved (convención del front)', async () => {
    const ctx = await bootstrapAgencyAndCase();
    await prepareMvp3CaseForApproval(ctx);
    const res = await request(ctx.app)
      .patch(`/api/cases/${ctx.caseId}/review`)
      .set('Cookie', ctx.cookie)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.case.reviewStatus).toBe('approved');
  });

  test('approve marca el caso como completed y limpia el feedback rojo', async () => {
    const ctx = await bootstrapAgencyAndCase();
    await prepareMvp3CaseForApproval(ctx);

    const res = await request(ctx.app)
      .patch(`/api/cases/${ctx.caseId}/review`)
      .set('Cookie', ctx.cookie)
      .send({ action: 'approve', feedback: 'Todo correcto' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.case.reviewStatus).toBe('approved');
    expect(res.body.case.status).toBe('completed');
    expect(res.body.case.feedbackMessage).toBe('Todo correcto');
    expect(res.body.case.reviewedAt).toBeTruthy();
  });

  test('reject sin feedback es 400', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await uploadOnce(app, cookie, caseId);

    const res = await request(app)
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', cookie)
      .send({ action: 'reject' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/feedback/i);
  });

  test('reject con feedback marca action_required y guarda el mensaje', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await uploadOnce(app, cookie, caseId);

    const res = await request(app)
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', cookie)
      .send({ action: 'reject', feedback: 'La foto está borrosa' });

    expect(res.status).toBe(200);
    expect(res.body.case.reviewStatus).toBe('rejected');
    expect(res.body.case.status).toBe('action_required');
    expect(res.body.case.feedbackMessage).toBe('La foto está borrosa');
  });

  test('un re-upload tras rechazo resetea reviewStatus a pending y limpia feedback', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await uploadOnce(app, cookie, caseId);
    await request(app)
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', cookie)
      .send({ action: 'reject', feedback: 'borrosa' });

    const re = await uploadOnce(app, cookie, caseId);
    expect(re.status).toBe(200);
    expect(re.body.case.reviewStatus).toBe('pending');
    expect(re.body.case.feedbackMessage).toBe('');
  });

  test('action inválida → 400', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', cookie)
      .send({ action: 'whatever' });
    expect(res.status).toBe(400);
  });

  test('404 si el caso es de otra agencia', async () => {
    const { caseId } = await bootstrapAgencyAndCase();
    const { cookie: otherCookie } = await require('./helpers/agency').registerAgency();
    const res = await request(await require('./helpers/agency').getApp())
      .patch(`/api/cases/${caseId}/review`)
      .set('Cookie', otherCookie)
      .send({ action: 'approve' });
    expect(res.status).toBe(404);
  });
});
