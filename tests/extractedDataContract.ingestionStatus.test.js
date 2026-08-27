const { buildExtractedDataFromAiPayload } = require('../src/lib/extractedDataContract');

describe('extractedDataContract ingestionStatus', () => {
  const ctx = { documentType: 'passport', documentId: 'd1', caseId: 'c1' };

  test('payload vacío sin fallo técnico → requires_review', () => {
    const data = buildExtractedDataFromAiPayload({}, ctx, {
      aiNotes: 'Sin datos',
    });
    expect(data.ingestionStatus).toBe('requires_review');
  });

  test('technicalFailure → error', () => {
    const data = buildExtractedDataFromAiPayload({}, ctx, {
      aiNotes: '429 quota',
      technicalFailure: true,
    });
    expect(data.ingestionStatus).toBe('error');
  });
});
