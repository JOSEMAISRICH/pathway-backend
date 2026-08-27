require('dotenv').config({ quiet: true });
const path = require('path');

const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  cookieName: process.env.SESSION_COOKIE_NAME || 'pw_session',
  allowRegistration: String(process.env.ALLOW_REGISTRATION).toLowerCase() === 'true',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 4 * 1024 * 1024,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  corsOrigin:
    process.env.CORS_ORIGIN === undefined || process.env.CORS_ORIGIN === ''
      ? true
      : process.env.CORS_ORIGIN,
  nodeEnv: process.env.NODE_ENV || 'development',
  /** Base del front (/portal, reset-password). PUBLIC_APP_ORIGIN tiene prioridad sobre PORTAL_BASE_URL. */
  portalBaseUrl:
    process.env.PUBLIC_APP_ORIGIN || process.env.PORTAL_BASE_URL || '',
  /** Días de validez del magic link (default 30). */
  magicLinkTtlDays: Number(process.env.MAGIC_LINK_TTL_DAYS) || 30,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  openaiVisionModel:
    process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o',
  /** Dev: no llama OpenAI; extracción → requires_review con nota. */
  extractionMock: String(process.env.EXTRACTION_MOCK || '').toLowerCase() === 'true',
  /** Dev: guarda archivo y marca processed sin IA. */
  skipPassportExtraction:
    String(process.env.SKIP_PASSPORT_EXTRACTION || '').toLowerCase() === 'true',
  /** Plantillas PDF rellenables (AcroForm). Coloca aquí tasa-790.pdf, modelo-ex-10.pdf, etc. */
  pdfTemplatesDir: process.env.PDF_TEMPLATES_DIR
    ? path.resolve(process.env.PDF_TEMPLATES_DIR)
    : path.join(process.cwd(), 'pdf-templates'),

  /** S3 opcional: si S3_BUCKET y AWS_REGION (o S3_REGION) están definidos, el PDF final se sube al bucket. */
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.AWS_REGION || process.env.S3_REGION || '',
  s3KeyPrefix: String(process.env.S3_KEY_PREFIX || 'pathway')
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/\\/g, '/'),
  /** Endpoint custom (MinIO, Cloudflare R2, etc.). Vacío = AWS por defecto. */
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3ForcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
  s3PresignTtlSeconds: Math.min(
    Math.max(Number(process.env.S3_PRESIGN_TTL_SECONDS) || 3600, 60),
    86400
  ),
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',

  /** Resend: notificaciones al cliente cuando el abogado aprueba o pide corrección. */
  resendApiKey: process.env.RESEND_API_KEY || '',
  /** Ej. "PathWay <notificaciones@tudominio.com>" — debe ser un remitente verificado en Resend. */
  resendFrom: process.env.RESEND_FROM || '',
  /** Enlace opcional en el pie del email de magic link. */
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '',

  /** Stripe (pagos / suscripción despacho). sk_ solo en servidor. */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  /** Opcional: Price ID del Dashboard. Si vacío, Checkout usa price_data (75 €/mes). */
  stripePriceId: process.env.STRIPE_PRICE_ID || '',
  /** Días de prueba al crear Checkout (0 = sin trial). Default 7. */
  stripeTrialDays: Math.max(0, Number(process.env.STRIPE_TRIAL_DAYS ?? 7) || 0),
};

module.exports = { config };
