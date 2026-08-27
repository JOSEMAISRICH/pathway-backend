const { buildMagicLinkEmailContent } = require('../src/lib/magicLinkEmailTemplate');

describe('magicLinkEmailTemplate', () => {
  const fixture = {
    clientName: 'Ana López',
    portalUrl: 'http://localhost:5500/portal/abc-123',
    agencyName: 'Despacho García',
    appOrigin: 'http://localhost:5500',
  };

  test('logo URL en HTML: {origin}/email/pathway-logo.png width 180', () => {
    const { html } = buildMagicLinkEmailContent(fixture);
    expect(html).toContain('http://localhost:5500/email/pathway-logo.png');
    expect(html).toContain('width="180"');
    expect(html).toContain('background:#121820');
  });

  test('subject y CTA con texto exacto del parche', () => {
    const { subject, html } = buildMagicLinkEmailContent(fixture);
    expect(subject).toBe('Despacho García — Acceso para subir tu documentación');
    expect(html).toContain('Abrir mi portal de documentación');
    expect(html).not.toContain('Acceder a mi portal');
  });

  test('paleta oscura y bloque aviso rojo', () => {
    const { html } = buildMagicLinkEmailContent(fixture);
    expect(html).toContain('background:#0f1419');
    expect(html).toContain('background:#171e26');
    expect(html).toContain('#2d3848');
    expect(html).toContain('background:#4a6fa5');
    expect(html).toContain('Importante:');
    expect(html).toContain('No lo reenvíes a otras personas');
  });

  test('texto plano con mismo contenido que HTML', () => {
    const { text, html } = buildMagicLinkEmailContent(fixture);
    expect(text).toContain('Ana López');
    expect(text).toContain('Despacho García');
    expect(text).toContain('/portal/abc-123');
    expect(text).toContain('Protección de datos');
    expect(text).toContain('encargado del tratamiento');
    expect(text.length).toBeGreaterThan(100);
    expect(html).toContain('Protección de datos (RGPD)');
  });

  test('privacidad: PRIVACY_POLICY_URL o fallback {origin}/pathway', () => {
    const custom = buildMagicLinkEmailContent({
      ...fixture,
      privacyUrl: 'https://example.com/privacidad',
    });
    expect(custom.html).toContain('https://example.com/privacidad');
    expect(custom.text).toContain('https://example.com/privacidad');

    const fallback = buildMagicLinkEmailContent({
      ...fixture,
      privacyUrl: undefined,
    });
    expect(fallback.html).toContain('http://localhost:5500/pathway');
  });

  test('escape XSS en clientName y agencyName', () => {
    const { html } = buildMagicLinkEmailContent({
      ...fixture,
      clientName: 'Test <script>',
      agencyName: 'Evil <img onerror=alert(1)>',
    });
    expect(html).toContain('Test &lt;script&gt;');
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain('Evil &lt;img onerror=alert(1)&gt;');
  });
});
