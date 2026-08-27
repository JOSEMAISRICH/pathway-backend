const mongoose = require('mongoose');
const { connect, disconnect, clearAll } = require('./helpers/db');
const { ingestDocument } = require('../src/lib/documentIngestionService');
const Client = require('../src/models/client');
const Document = require('../src/models/document');
const Agency = require('../src/models/agency');

async function makeCaseWithDocs() {
  const agency = await Agency.create({
    name: 'Ingest Agency',
    email: `ing_${Date.now()}@t.local`,
    passwordHash: 'x',
  });
  const client = await Client.create({
    agencyId: agency._id,
    fullName: 'Ingest Test',
    email: 'ing@test.local',
    magicLinkToken: new mongoose.Types.ObjectId().toString(),
  });
  const doc = await Document.create({
    clientId: client._id,
    key: 'proof_address',
    type: 'proof_address',
    label: 'Domicilio',
    ingestionStatus: 'pending_upload',
  });
  return { client, doc };
}

describe('documentIngestionService', () => {
  beforeAll(async () => {
    await connect();
  });
  afterAll(async () => {
    await disconnect();
  });
  beforeEach(async () => {
    await clearAll();
  });

  test('proof_address → processed sin IA, deleteStaging llamado', async () => {
    const { client, doc } = await makeCaseWithDocs();
    const deleteStaging = jest.fn().mockResolvedValue(undefined);
    const uploadToStorage = jest.fn().mockResolvedValue({
      key: 'a/c/proof.pdf',
      stagingKey: 'a/c/staging/x',
      storage: 'local',
    });

    const result = await ingestDocument({
      client,
      documentId: doc._id.toString(),
      file: {
        buffer: Buffer.from('pdf-bytes'),
        mimeType: 'application/pdf',
        originalName: 'dom.pdf',
      },
      deps: { uploadToStorage, deleteStaging, computeProgress: async () => 33 },
    });

    expect(result.ok).toBe(true);
    expect(result.ingestionStatus).toBe('processed');
    expect(result.extractedData.schemaVersion).toBe('1.0');
    expect(deleteStaging).toHaveBeenCalledWith('a/c/staging/x', 'local');

    const freshDoc = await Document.findById(doc._id).exec();
    expect(freshDoc.ingestionStatus).toBe('processed');
    expect(freshDoc.fileUrl).toBe('a/c/proof.pdf');
  });

  test('error upload → ingestionStatus error', async () => {
    const { client, doc } = await makeCaseWithDocs();
    const result = await ingestDocument({
      client,
      documentId: doc._id.toString(),
      file: {
        buffer: Buffer.from('x'),
        mimeType: 'application/pdf',
        originalName: 'x.pdf',
      },
      deps: {
        uploadToStorage: jest.fn().mockRejectedValue(new Error('S3 down')),
        deleteStaging: jest.fn(),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ingestionStatus).toBe('error');
  });
});
