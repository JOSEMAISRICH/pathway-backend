const app = require('./app');
const { config } = require('./config');
const { connectDb } = require('./db');

async function main() {
  if (config.mongoUri) {
    try {
      await connectDb();
      console.log('MongoDB conectado');
    } catch (e) {
      console.error('No se pudo conectar a MongoDB:', e.message);
    }
  } else {
    console.warn('MONGODB_URI no definido: las rutas que usan BD responderán 503');
  }

  app.listen(config.port, () => {
    console.log(`Servidor en http://localhost:${config.port}`);
  });
}

main();
