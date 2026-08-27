/**
 * Tests del endpoint principal POST /api/cases/:id/upload.
 * Mockeamos el SDK 'openai' para que la "IA" devuelva un JSON conocido.
 */

jest.mock('openai');

const fs = require('fs/promises');
const path = require('path');
const request = require('supertest');
const OpenAI = require('openai');

const { connect, disconnect, clearAll } = require('./helpers/db');
const { bootstrapAgencyAndCase, getApp } = require('./helpers/agency');
const { tinyPng, tinyPdf } = require('./helpers/fixtures');

describe('POST /api/cases/:id/upload', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); OpenAI.__reset(); });

  test('happy path: extrae datos, persiste extractedData y genera el PDF final', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();

    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'passport.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.case.id).toBe(caseId);
    expect(res.body.case.extractedData).toEqual(
      expect.objectContaining({
        nombre: 'JUAN',
        apellidos: 'GARCIA LOPEZ',
        numero_pasaporte: 'AAB123456',
        nacionalidad: 'ESP',
        fecha_nacimiento: '1990-01-01',
        fecha_caducidad: '2030-01-01',
        genero: 'M',
      })
    );
    expect(res.body.case.status).toBe('processing');
    expect(res.body.case.reviewStatus).toBe('pending');
    expect(res.body.pdf.fileName).toBe(`expediente_${caseId}.pdf`);
    expect(res.body.pdf.downloadUrl).toBe(`/api/cases/${caseId}/final-pdf`);

    const absPath = path.join(process.env.UPLOAD_DIR, 'final', `expediente_${caseId}.pdf`);
    const stat = await fs.stat(absPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(200);
  });

  test('envía al LLM exactamente el System Prompt del cliente', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'passport.png');

    const call = OpenAI.__getLastCall();
    expect(call).toBeTruthy();
    expect(call.model).toBe('gpt-4o-test');
    expect(call.response_format).toEqual({ type: 'json_object' });

    const systemMsg = call.messages.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain('motor de extracción de datos de PathWay');
    expect(systemMsg.content).toContain('numero_pasaporte');
    expect(systemMsg.content).toContain('AAAA-MM-DD');

    const userMsg = call.messages.find((m) => m.role === 'user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    const img = userMsg.content.find((c) => c.type === 'image_url');
    expect(img.image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  test('soporta PDF de pasaporte (usa content type "file" en lugar de "image_url")', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const pdfBuf = await tinyPdf();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', pdfBuf, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = OpenAI.__getLastCall();
    const userMsg = call.messages.find((m) => m.role === 'user');
    const fileEntry = userMsg.content.find((c) => c.type === 'file');
    expect(fileEntry).toBeDefined();
    expect(fileEntry.file.file_data).toMatch(/^data:application\/pdf;base64,/);
    expect(fileEntry.file.filename).toBe('passport.pdf');
  });

  test('añade alerta cuando la IA marca el documento caducado', async () => {
    OpenAI.__setNextResponse({
      nombre: 'ANA',
      apellidos: 'PEREZ',
      numero_pasaporte: 'X1',
      nacionalidad: 'ESP',
      fecha_nacimiento: '1980-05-05',
      fecha_caducidad: '2024-01-01',
      genero: 'F',
      alerta: 'Documento caducado',
    });
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'passport.png');

    expect(res.status).toBe(200);
    expect(res.body.case.extractedData.alerta).toBe('Documento caducado');
  });

  test('400 si no se adjunta archivo', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app).post(`/api/cases/${caseId}/upload`).set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  test('400 si el MIME no es JPG/PNG/PDF', async () => {
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', Buffer.from('hola'), { filename: 'hola.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPG, PNG o PDF/);
  });

  test('400 si el :id no es ObjectId válido', async () => {
    const { agency, cookie } = await (async () => {
      const r = await require('./helpers/agency').registerAgency();
      return r;
    })();
    expect(agency).toBeDefined();
    const app = await getApp();
    const res = await request(app)
      .post('/api/cases/no-es-objectid/upload')
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/i);
  });

  test('404 cuando el caso pertenece a otra agencia', async () => {
    const { caseId } = await bootstrapAgencyAndCase();
    const { cookie: otherCookie } = await require('./helpers/agency').registerAgency();
    const app = await getApp();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', otherCookie)
      .attach('file', tinyPng, 'p.png');
    expect(res.status).toBe(404);
  });

  test('401 sin sesión', async () => {
    const { app, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .attach('file', tinyPng, 'p.png');
    expect(res.status).toBe(401);
  });

  test('502 cuando la IA devuelve JSON inválido → requires_review (no crash)', async () => {
    OpenAI.__setNextResponse('esto no es JSON');
    const { app, cookie, caseId } = await bootstrapAgencyAndCase();
    const res = await request(app)
      .post(`/api/cases/${caseId}/upload`)
      .set('Cookie', cookie)
      .attach('file', tinyPng, 'p.png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.extractedData.ingestionStatus).toBe('requires_review');
  });
});
