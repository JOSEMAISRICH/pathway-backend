const { friendlyResendError, appOrigin } = require('../src/lib/notifyMagicLinkEmail');

describe('notifyMagicLinkEmail helpers', () => {
  test('friendlyResendError traduce error sandbox Resend', () => {
    const msg = friendlyResendError(
      'You can only send testing emails to your own email address.'
    );
    expect(msg).toMatch(/modo prueba/i);
    expect(msg).toMatch(/email verificado/i);
    expect(msg).toMatch(/resend\.com\/domains/i);
  });

  test('friendlyResendError devuelve mensaje genérico si vacío', () => {
    expect(friendlyResendError('')).toBe('No se pudo enviar el correo.');
  });

  test('appOrigin usa PUBLIC_APP_ORIGIN ?? PORTAL_BASE_URL ?? localhost:5500', () => {
    const prevPublic = process.env.PUBLIC_APP_ORIGIN;
    const prevPortal = process.env.PORTAL_BASE_URL;
    try {
      delete process.env.PUBLIC_APP_ORIGIN;
      delete process.env.PORTAL_BASE_URL;
      expect(appOrigin()).toBe('http://localhost:5500');

      process.env.PORTAL_BASE_URL = 'http://portal.test/';
      expect(appOrigin()).toBe('http://portal.test');

      process.env.PUBLIC_APP_ORIGIN = 'http://public.test/';
      expect(appOrigin()).toBe('http://public.test');
    } finally {
      if (prevPublic === undefined) delete process.env.PUBLIC_APP_ORIGIN;
      else process.env.PUBLIC_APP_ORIGIN = prevPublic;
      if (prevPortal === undefined) delete process.env.PORTAL_BASE_URL;
      else process.env.PORTAL_BASE_URL = prevPortal;
    }
  });
});
