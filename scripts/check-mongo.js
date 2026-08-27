/**
 * Comprueba MONGODB_URI y que el servidor Mongo responda (ping + acceso a la BD).
 * Uso: node scripts/check-mongo.js
 * Requiere .env o export MONGODB_URI=...
 */
require('dotenv').config();

const { connectDb, isMongoReady, mongoose } = require('../src/db');
const { config } = require('../src/config');

async function main() {
  if (!config.mongoUri) {
    console.error('❌ MONGODB_URI no está definido. Crea .env desde .env.example');
    process.exit(1);
  }
  console.log('Conectando a:', config.mongoUri.replace(/:[^:@/]+@/, ':****@'));
  await connectDb();
  if (!isMongoReady()) {
    console.error('❌ readyState no es conectado');
    process.exit(1);
  }
  const db = mongoose.connection.db;
  const ping = await db.admin().command({ ping: 1 });
  if (!ping.ok) {
    console.error('❌ ping falló', ping);
    process.exit(1);
  }
  const name = db.databaseName;
  const collections = await db.listCollections().toArray();
  console.log('✅ MongoDB OK');
  console.log('   Base de datos:', name);
  console.log('   Colecciones:', collections.length ? collections.map((c) => c.name).join(', ') : '(ninguna aún)');
  await mongoose.disconnect();
  console.log('   Desconectado.');
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
