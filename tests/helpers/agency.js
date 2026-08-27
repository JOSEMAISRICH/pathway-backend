/**
 * Helpers para crear agencia + caso y devolver una cookie de sesión
 * lista para usar con supertest.
 *
 * Uso típico:
 *   const { agent, agency, caseId, magicToken } = await bootstrapAgencyAndCase();
 *   await agent.post('/api/cases/' + caseId + '/upload').attach('file', pngBuffer, 'p.png');
 */

const request = require('supertest');
const OpenAI = require('openai');
const { tinyPng } = require('./fixtures');

let appPromise;
function getApp() {
  if (!appPromise) appPromise = Promise.resolve(require('../../src/app'));
  return appPromise;
}

async function registerAgency({
  name = 'Test Agency',
  email = `agency_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.local`,
  password = 'secret-pass',
} = {}) {
  const app = await getApp();
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password });
  if (res.status !== 201) {
    throw new Error(`registerAgency failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'];
  if (!setCookie || setCookie.length === 0) {
    throw new Error('register no devolvió set-cookie');
  }
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return { agency: res.body.agency, cookie, email, password };
}

async function createCase(
  cookie,
  { fullName = 'Juan Test', email = 'juan@test.local', caseType = 'MVP-3' } = {}
) {
  const app = await getApp();
  const res = await request(app)
    .post('/api/cases')
    .set('Cookie', cookie)
    .send({ fullName, email, clientName: fullName, clientEmail: email, caseType });
  if (res.status !== 201) {
    throw new Error(`createCase failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.case;
}

async function bootstrapAgencyAndCase(opts = {}) {
  const { agency, cookie } = await registerAgency(opts.agency);
  const expediente = await createCase(cookie, opts.case);
  return {
    app: await getApp(),
    agency,
    cookie,
    caseId: expediente.id,
    magicToken: expediente.magicToken,
  };
}

/** Sube pasaporte + domicilio + foto y aprueba cada slot (MVP-3). */
async function prepareMvp3CaseForApproval({ app, cookie, caseId, magicToken }) {
  OpenAI.__setNextResponse(
    JSON.stringify({
      nombre: 'JUAN',
      apellidos: 'GARCIA',
      numero_pasaporte: 'X1234567',
      fecha_nacimiento: '1990-01-01',
    })
  );
  await request(app)
    .post(`/api/cases/${caseId}/upload`)
    .set('Cookie', cookie)
    .attach('file', tinyPng, 'passport.png');

  const portal = await request(app).get(`/api/magic/${magicToken}`);
  const docs = portal.body.case.documents || [];
  const proofId = docs.find((d) => d.key === 'proof_address')?.id;
  const photoId = docs.find((d) => d.key === 'photo')?.id;

  if (proofId) {
    await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', proofId)
      .attach('file', tinyPng, 'domicilio.png');
  }
  if (photoId) {
    await request(app)
      .post(`/api/magic/${magicToken}/upload`)
      .field('docId', photoId)
      .attach('file', tinyPng, 'foto.png');
  }

  const detail = await request(app).get(`/api/cases/${caseId}`).set('Cookie', cookie);
  for (const d of detail.body.case.documents || []) {
    const hasFile = d.hasFile || d.filePath || d.key === 'passport';
    if (!hasFile) continue;
    await request(app)
      .patch(`/api/cases/${caseId}/documents/${d.id}/review`)
      .set('Cookie', cookie)
      .send({ status: 'approved' });
  }
}

module.exports = {
  getApp,
  registerAgency,
  createCase,
  bootstrapAgencyAndCase,
  prepareMvp3CaseForApproval,
};
