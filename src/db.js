const mongoose = require('mongoose');
const { config } = require('./config');

let connecting;

async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!config.mongoUri) {
    const err = new Error('MongoDB no configurado');
    err.code = 'NO_MONGO_URI';
    throw err;
  }
  if (connecting) return connecting;
  connecting = mongoose.connect(config.mongoUri);
  try {
    await connecting;
    return mongoose.connection;
  } finally {
    connecting = undefined;
  }
}

function isMongoReady() {
  return Boolean(config.mongoUri) && mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isMongoReady, mongoose };
