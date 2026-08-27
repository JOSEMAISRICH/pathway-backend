/**
 * Helper de conexión/limpieza de Mongo en tests.
 */

const mongoose = require('mongoose');

async function connect() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI);
}

async function disconnect() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

async function clearAll() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}

module.exports = { connect, disconnect, clearAll };
