const { connectDb, isMongoReady } = require('../db');
const { config } = require('../config');

async function mongoReady(_req, res, next) {
  if (!config.mongoUri) {
    return res.status(503).json({ error: 'MongoDB no configurado' });
  }
  if (!isMongoReady()) {
    try {
      await connectDb();
    } catch (e) {
      const body = { error: 'MongoDB no disponible' };
      if (config.nodeEnv === 'development') {
        body.hint =
          'Revisa la consola del servidor, MONGODB_URI en .env, que Mongo/Atlas esté en marcha y tu IP en Network Access (Atlas).';
        body.detail = e.message;
      }
      return res.status(503).json(body);
    }
  }
  if (!isMongoReady()) {
    return res.status(503).json({ error: 'MongoDB no disponible' });
  }
  return next();
}

module.exports = { mongoReady };
