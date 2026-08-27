const Client = require('../models/client');
const Document = require('../models/document');
const { computeCaseProgress, documentHasFile } = require('./caseProgress');

/**
 * Recalcula progress y status operativo sin tocar case.reviewStatus
 * (salvo que ya esté approved/rejected a nivel expediente).
 */
async function refreshCaseProgressOnly(clientId) {
  const client = await Client.findById(clientId).exec();
  if (!client) return null;
  const docs = await Document.find({ clientId }).exec();

  if (docs.length === 0) {
    client.progress = 0;
    if (client.reviewStatus !== 'approved') {
      client.status = 'pending';
    }
    await client.save();
    return client;
  }

  client.progress = computeCaseProgress(docs, client);

  if (client.reviewStatus === 'approved') {
    client.status = 'completed';
  } else if (client.reviewStatus === 'rejected') {
    client.status = 'action_required';
  } else {
    const anyDocRejected = docs.some((d) => d.reviewStatus === 'rejected');
    const anyFile = docs.some((d) => documentHasFile(d, client));
    if (anyDocRejected) {
      client.status = 'action_required';
    } else if (anyFile || client.extractedData) {
      client.status = 'processing';
    } else {
      client.status = 'pending';
    }
  }

  await client.save();
  return client;
}

async function syncClientProgress(clientId) {
  return refreshCaseProgressOnly(clientId);
}

module.exports = { syncClientProgress, refreshCaseProgressOnly };
