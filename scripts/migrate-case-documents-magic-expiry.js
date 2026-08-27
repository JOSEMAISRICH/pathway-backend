#!/usr/bin/env node
/**
 * Migración one-shot: documentos por defecto + magicExpiresAt en expedientes legacy.
 *
 * Uso: node scripts/migrate-case-documents-magic-expiry.js
 *      npm run migrate:case-docs
 */

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const Client = require('../src/models/client');
const Document = require('../src/models/document');
const { config } = require('../src/config');
const { computeMagicExpiresAt } = require('../src/lib/magicLinkExpiry');
const { ensureCaseHasDocuments } = require('../src/lib/caseDocuments');

async function main() {
  if (!config.mongoUri) {
    console.error('MONGODB_URI no configurada');
    process.exit(1);
  }
  await mongoose.connect(config.mongoUri);
  console.log('[migrate] conectado a MongoDB');

  const clients = await Client.find({}).exec();
  let docsCreated = 0;
  let expirySet = 0;

  for (const client of clients) {
    const before = await Document.countDocuments({ clientId: client._id });
    if (before === 0) {
      await ensureCaseHasDocuments(client._id);
      docsCreated += 1;
    }

    if (client.magicLinkToken && !client.magicExpiresAt) {
      client.magicExpiresAt = computeMagicExpiresAt();
      await client.save();
      expirySet += 1;
    }
  }

  console.log(
    `[migrate] expedientes=${clients.length} con_docs_nuevos=${docsCreated} magicExpiresAt_asignados=${expirySet}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[migrate]', e);
  process.exit(1);
});
