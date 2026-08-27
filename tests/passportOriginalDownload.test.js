const { getLatestPassportArchivo } = require('../src/lib/passportOriginalDownload');

describe('passportOriginalDownload.getLatestPassportArchivo', () => {
  test('elige el más reciente por subidoEn', () => {
    const client = {
      archivosS3: [
        {
          tipo: 'passport',
          key: 'a',
          bucket: 'b',
          subidoEn: new Date('2020-01-01'),
        },
        {
          tipo: 'passport',
          key: 'c',
          bucket: 'b',
          subidoEn: new Date('2025-06-01'),
        },
        { tipo: 'dni', key: 'x', bucket: 'b' },
      ],
    };
    const latest = getLatestPassportArchivo(client);
    expect(latest.key).toBe('c');
  });

  test('sin pasaportes devuelve null', () => {
    expect(getLatestPassportArchivo({ archivosS3: [] })).toBeNull();
    expect(getLatestPassportArchivo({})).toBeNull();
  });
});
