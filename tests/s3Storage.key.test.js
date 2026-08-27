const { buildFinalPdfObjectKey } = require('../src/lib/s3Storage');

describe('s3Storage.buildFinalPdfObjectKey', () => {
  test('usa prefijo por defecto pathway', () => {
    expect(buildFinalPdfObjectKey('expediente_abc.pdf')).toBe('pathway/final/expediente_abc.pdf');
  });
});
