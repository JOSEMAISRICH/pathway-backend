/**
 * Tests unitarios del pipeline IA + BD + PDF (sin pasar por Express).
 */

jest.mock('openai');

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const OpenAI = require('openai');

const { connect, disconnect, clearAll } = require('./helpers/db');
const { tinyPng } = require('./helpers/fixtures');

const { processPassportUpload } = require('../src/lib/passportPipeline');
const Client = require('../src/models/client');
const Agency = require('../src/models/agency');

async function makeClient() {
  const agency = await Agency.create({
    name: 'Pipeline Agency',
    email: `pipe_${Date.now()}@t.local`,
    passwordHash: 'noimporta',
  });
  return Client.create({
    agencyId: agency._id,
    fullName: 'Pipeline Test',
    email: 'p@t.local',
    magicLinkToken: new mongoose.Types.ObjectId().toString(),
  });
}

async function writeTemp(buf, ext = '.png') {
  const dir = path.join(process.env.UPLOAD_DIR, 'temp');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}_pipe${ext}`);
  await fs.writeFile(file, buf);
  return file;
}

describe('passportPipeline.processPassportUpload', () => {
  beforeAll(async () => { await connect(); });
  afterAll(async () => { await disconnect(); });
  beforeEach(async () => { await clearAll(); OpenAI.__reset(); });

  test('persiste extractedData, finalPdfPath y resetea reviewStatus', async () => {
    const client = await makeClient();
    client.reviewStatus = 'rejected';
    client.feedbackMessage = 'stale';
    await client.save();

    const filePath = await writeTemp(tinyPng);
    const out = await processPassportUpload({
      client,
      tempFilePath: filePath,
      originalName: 'p.png',
      mimeType: 'image/png',
    });

    expect(out.extractedData.schemaVersion).toBe('1.0');
    expect(out.extractedData.fields.nombre.value).toBe('JUAN');
    expect(out.pdf.relativePath).toBe(`final/expediente_${client._id.toString()}.pdf`);
    expect(out.pdf.storage).toBe('local');
    expect(out.passportS3).toBeNull();

    const fresh = await Client.findById(client._id).exec();
    expect(fresh.extractedData.nombre).toBe('JUAN');
    expect(fresh.finalPdfPath).toBe(out.pdf.relativePath);
    expect(fresh.finalPdfOnS3).toBe(false);
    expect(Array.isArray(fresh.archivosS3) ? fresh.archivosS3.length : 0).toBe(0);
    expect(fresh.reviewStatus).toBe('pending');
    expect(fresh.feedbackMessage).toBe('');
    expect(fresh.status).toBe('processing');
  });

  test('error IA → ingestionStatus error sin throw', async () => {
    OpenAI.__setNextError(new Error('upstream caído'));
    const client = await makeClient();
    const filePath = await writeTemp(tinyPng);

    const out = await processPassportUpload({
      client,
      tempFilePath: filePath,
      originalName: 'p.png',
      mimeType: 'image/png',
    });
    expect(out.extractedData.ingestionStatus).toBe('error');
    expect(out.pdf).toBeNull();
  });

  test('si la IA devuelve campos sucios, marca missing en v1', async () => {
    OpenAI.__setNextResponse({
      nombre: '   ',
      apellidos: 'PEREZ',
      numero_pasaporte: null,
      nacionalidad: 'ESP',
      fecha_nacimiento: '',
      fecha_caducidad: '2030-01-01',
      genero: 'F',
    });
    const client = await makeClient();
    const filePath = await writeTemp(tinyPng);
    const out = await processPassportUpload({
      client,
      tempFilePath: filePath,
      originalName: 'p.png',
      mimeType: 'image/png',
    });

    expect(out.extractedData.fields.nombre.status).toBe('missing');
    expect(out.extractedData.fields.numero_pasaporte.status).toBe('missing');
    expect(out.extractedData.fields.fecha_nacimiento.status).toBe('missing');
    expect(out.extractedData.fields.apellidos.value).toBe('PEREZ');
  });
});
