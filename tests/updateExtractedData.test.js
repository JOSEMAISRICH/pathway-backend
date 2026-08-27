const {
  applyManualExtractedFields,
  parseManualFieldsBody,
} = require('../src/lib/updateExtractedData');

describe('updateExtractedData', () => {
  const ctx = { documentType: 'passport', documentId: 'd1', caseId: 'c1' };

  test('parseManualFieldsBody — al menos un campo', () => {
    expect(parseManualFieldsBody({ fields: { apellidos: 'García' } })).toEqual({
      apellidos: 'García',
    });
    expect(() => parseManualFieldsBody({})).toThrow();
    try {
      parseManualFieldsBody({});
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });

  test('completar apellidos → processed si resto OK', () => {
    const existing = applyManualExtractedFields(
      {
        schemaVersion: '1.0',
        documentType: 'passport',
        documentId: 'd1',
        caseId: 'c1',
        ingestionStatus: 'requires_review',
        extractedAt: new Date().toISOString(),
        fields: {
          nombre: { value: 'Ana', status: 'extracted', source: 'ai' },
          apellidos: { value: null, status: 'missing', source: 'ai' },
          numero_pasaporte: { value: 'X123', status: 'extracted', source: 'ai' },
          fecha_nacimiento: { value: '1990-01-01', status: 'extracted', source: 'ai' },
        },
      },
      { apellidos: 'López' },
      ctx
    );
    expect(existing.ingestionStatus).toBe('processed');
    expect(existing.fields.apellidos.source).toBe('manual');
  });

  test('error previo + campos completos manualmente → processed', () => {
    const existing = applyManualExtractedFields(
      {
        schemaVersion: '1.0',
        ingestionStatus: 'error',
        extractedAt: new Date().toISOString(),
        fields: {},
      },
      {
        nombre: 'Ana',
        apellidos: 'López',
        numero_pasaporte: 'AB123',
        fecha_nacimiento: '1990-01-01',
      },
      ctx
    );
    expect(existing.ingestionStatus).toBe('processed');
  });
});
