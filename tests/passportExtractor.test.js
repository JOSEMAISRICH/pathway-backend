jest.mock('openai');

const OpenAI = require('openai');
const { extractIdentityDocument, parseAiJson } = require('../src/lib/passportExtractor');
const { callOpenAiVisionModel } = require('../src/lib/ingestionVision');

describe('passportExtractor', () => {
  beforeEach(() => {
    OpenAI.__reset();
  });

  test('parseAiJson tolera fences markdown', () => {
    const parsed = parseAiJson('```json\n{"nombre":"Ana"}\n```');
    expect(parsed.nombre).toBe('Ana');
  });

  test('JSON parcial → requires_review sin throw', async () => {
    OpenAI.__setNextResponse(
      JSON.stringify({ nombre: 'Ana', apellidos: null, numero_pasaporte: null })
    );
    const data = await extractIdentityDocument({
      buffer: Buffer.from('fake'),
      mimeType: 'image/png',
      documentType: 'passport',
      documentId: 'd1',
      caseId: 'c1',
      callVisionModel: (b, m, p) => callOpenAiVisionModel(b, m, p, 'p.png'),
    });
    expect(data.schemaVersion).toBe('1.0');
    expect(data.ingestionStatus).toBe('requires_review');
    expect(data.fields.nombre.value).toBe('Ana');
  });

  test('error IA → ingestionStatus error con mensaje claro', async () => {
    OpenAI.__setNextError(new Error('429 You exceeded your current quota'));
    const data = await extractIdentityDocument({
      buffer: Buffer.from('fake'),
      mimeType: 'image/png',
      documentType: 'passport',
      documentId: 'd1',
      caseId: 'c1',
      callVisionModel: (b, m, p) => callOpenAiVisionModel(b, m, p, 'p.png'),
    });
    expect(data.ingestionStatus).toBe('error');
    expect(data.errors?.[0]?.code).toBe('EXTRACTION_FAILED');
    expect(data.raw?.aiNotes).toMatch(/429|Cuota de OpenAI/i);
  });

  test('todos los campos null → requires_review, no error', async () => {
    OpenAI.__setNextResponse(
      JSON.stringify({
        nombre: null,
        apellidos: null,
        numero_pasaporte: null,
        fecha_nacimiento: null,
        notas: 'Documento ilegible',
      })
    );
    const data = await extractIdentityDocument({
      buffer: Buffer.from('fake'),
      mimeType: 'image/png',
      documentType: 'passport',
      documentId: 'd1',
      caseId: 'c1',
      callVisionModel: (b, m, p) => callOpenAiVisionModel(b, m, p, 'p.png'),
    });
    expect(data.ingestionStatus).toBe('requires_review');
    expect(data.ingestionStatus).not.toBe('error');
  });

  test('sin OPENAI_API_KEY → requires_review con nota dev', async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    jest.resetModules();
    const { extractIdentityDocument: extractFresh } = require('../src/lib/passportExtractor');
    const data = await extractFresh({
      buffer: Buffer.from('fake'),
      mimeType: 'image/png',
      documentType: 'passport',
      documentId: 'd1',
      caseId: 'c1',
      callVisionModel: undefined,
    });
    expect(data.ingestionStatus).toBe('requires_review');
    expect(data.raw?.aiNotes).toMatch(/OPENAI_API_KEY|EXTRACTION_MOCK/i);
    process.env.OPENAI_API_KEY = prev;
  });
});
