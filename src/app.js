const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { config } = require('./config');
const authRoutes = require('./routes/auth');
const casesRoutes = require('./routes/cases');
const magicRoutes = require('./routes/magic');
const filesRoutes = require('./routes/files');
const { router: billingRoutes, stripeWebhookHandler } = require('./routes/billing');

const app = express();

const corsOriginOption =
  config.corsOrigin === true
    ? true
    : typeof config.corsOrigin === 'string' && config.corsOrigin.includes(',')
      ? config.corsOrigin.split(',').map((s) => s.trim())
      : config.corsOrigin;

app.use(
  cors({
    origin: corsOriginOption,
    credentials: true,
  })
);

/** Stripe webhook necesita el body en bruto (firma). Antes de express.json. */
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/magic', magicRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/billing', billingRoutes);

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo demasiado grande' });
  }
  if (err && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno' });
});

module.exports = app;
