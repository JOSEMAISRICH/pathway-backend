/**
 * Se ejecuta en cada worker ANTES de cargar cualquier código de la app.
 * Aquí fijamos las variables de entorno por defecto para tests; las que ya
 * estén definidas (por ej. MONGODB_URI escrita por globalSetup) tienen
 * preferencia, porque `dotenv.config()` en config.js no sobrescribe.
 */

const path = require('path');

const TMP_ROOT = path.join(__dirname, '.tmp');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.ALLOW_REGISTRATION = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'pw_session';
process.env.JWT_EXPIRES_IN = '1h';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.OPENAI_MODEL = 'gpt-4o-test';
process.env.MAX_UPLOAD_BYTES = String(4 * 1024 * 1024);
process.env.UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(TMP_ROOT, 'uploads');
process.env.PDF_TEMPLATES_DIR =
  process.env.PDF_TEMPLATES_DIR || path.join(TMP_ROOT, 'pdf-templates');
process.env.PORTAL_BASE_URL = 'http://test-portal.local';
process.env.PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || 'http://test-portal.local';
process.env.MAGIC_LINK_TTL_DAYS = process.env.MAGIC_LINK_TTL_DAYS || '30';
process.env.RESEND_API_KEY = '';
process.env.RESEND_FROM = '';
process.env.CORS_ORIGIN = '';
