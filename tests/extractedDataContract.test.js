const {
  EXTRACTED_DATA_SCHEMA_VERSION,
  normalizeExtractedData,
  buildExtractedDataFromAiPayload,
  mergeCaseExtractedData,
  flattenExtractedForLegacy,
} = require('../src/lib/extractedDataContract');

describe('extractedDataContract', () => {
  const ctx = {
    documentType: 'passport',
    documentId: 'doc-1',
    caseId: 'case-1',
  };

  test('legacy plano → v1 con normalizeExtractedData', () => {
    const v1 = normalizeExtractedData(
      { nombre: 'Ana', apellidos: 'López', numero_pasaporte: null },
      ctx
    );
    expect(v1.schemaVersion).toBe(EXTRACTED_DATA_SCHEMA_VERSION);
    expect(v1.fields.nombre.value).toBe('Ana');
    expect(v1.fields.numero_pasaporte.status).toBe('missing');
    expect(v1.ingestionStatus).toBe('requires_review');
  });

  test('buildExtractedDataFromAiPayload — parcial → requires_review', () => {
    const data = buildExtractedDataFromAiPayload(
      { nombre: 'Ana', apellidos: 'López' },
      ctx,
      { model: 'gpt-4o' }
    );
    expect(data.ingestionStatus).toBe('requires_review');
    expect(data.errors?.[0]?.code).toBe('PARTIAL_EXTRACTION');
  });

  test('mergeCaseExtractedData fusiona plano legacy en expediente', () => {
    const docData = buildExtractedDataFromAiPayload(
      {
        nombre: 'Ana',
        apellidos: 'López',
        numero_pasaporte: 'X123',
        fecha_nacimiento: '1990-01-01',
      },
      ctx
    );
    const merged = mergeCaseExtractedData({ extractedData: { notas: 'prev' } }, docData);
    expect(merged.nombre).toBe('Ana');
    expect(merged.apellidos).toBe('López');
  });
});
