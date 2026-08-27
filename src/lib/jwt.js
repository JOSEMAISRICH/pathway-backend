const { SignJWT, jwtVerify } = require('jose');
const { config } = require('../config');

function getSecretKey() {
  return new TextEncoder().encode(config.jwtSecret);
}

async function signSession(agencyId) {
  return new SignJWT({ sub: agencyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(getSecretKey());
}

async function verifySession(token) {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    algorithms: ['HS256'],
  });
  if (!payload.sub || typeof payload.sub !== 'string') {
    const err = new Error('Token inválido');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  return { agencyId: payload.sub };
}

module.exports = { signSession, verifySession };
