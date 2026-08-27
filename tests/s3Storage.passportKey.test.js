const { buildPassportOriginalObjectKey } = require('../src/lib/s3Storage');

describe('s3Storage.buildPassportOriginalObjectKey', () => {
  test('incluye prefijo, agency, case y nombre seguro', () => {
    const key = buildPassportOriginalObjectKey(
      '507f1f77bcf86cd799439011',
      '507f191e810c19729de860ea',
      'mi pasaporte (1).pdf'
    );
    expect(key).toMatch(/^pathway\/passports\/507f1f77bcf86cd799439011\/507f191e810c19729de860ea\/\d+_/);
    expect(key).toMatch(/\.pdf$/);
  });
});
