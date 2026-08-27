/**
 * Subida genérica a un slot de documento (proof_address, photo, …).
 * Pasaporte → upload-passport / documentIngestionService.
 */

const multer = require('multer');
const mongoose = require('mongoose');
const { config } = require('../config');
const { httpError } = require('./httpError');
const {
  ensureCaseHasDocuments,
  loadCaseDocuments,
  serializeDocumentForApi,
} = require('./caseDocuments');
const { ingestDocument } = require('./documentIngestionService');

const GENERIC_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const genericDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter(_req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    if (GENERIC_UPLOAD_MIMES.has(mime)) return cb(null, true);
    return cb(
      httpError(400, 'Tipo de archivo no permitido. Use JPG, PNG, WEBP, GIF o PDF')
    );
  },
});

/**
 * @param {object} params
 * @param {import('mongoose').Document} params.client
 * @param {string} params.docId
 * @param {Buffer} params.fileBuffer
 * @param {string} params.originalName
 * @param {string} params.mimeType
 */
async function uploadCaseDocumentSlot({
  client,
  docId,
  fileBuffer,
  originalName,
  mimeType,
}) {
  if (!client) throw httpError(404, 'Expediente no encontrado');
  if (!docId || typeof docId !== 'string') {
    throw httpError(400, 'Falta docId');
  }
  if (!fileBuffer || !fileBuffer.length) {
    throw httpError(400, 'Falta el archivo (campo "file")');
  }
  if (!mongoose.isValidObjectId(docId)) {
    throw httpError(404, 'Documento no encontrado');
  }

  await ensureCaseHasDocuments(client._id);

  const doc = await require('../models/document')
    .findOne({ _id: docId, clientId: client._id })
    .exec();
  if (!doc) throw httpError(404, 'Documento no encontrado');

  const key = doc.key || doc.type || '';
  if (key === 'passport') {
    throw httpError(400, 'Usa upload-passport para el pasaporte');
  }

  const result = await ingestDocument({
    client,
    documentId: docId,
    file: {
      buffer: fileBuffer,
      mimeType,
      originalName,
    },
    stampPdfAfterPassport: false,
  });

  if (!result.ok) {
    if (result.code === 'ALREADY_APPROVED') {
      throw httpError(409, result.error);
    }
    throw httpError(400, result.error || 'Error al guardar el documento');
  }

  const refreshedClient = await client.constructor.findById(client._id).exec();
  const docs = await loadCaseDocuments(client._id);

  return {
    client: refreshedClient,
    documents: docs.map((d) => serializeDocumentForApi(d, refreshedClient)),
    ingestionStatus: result.ingestionStatus,
    extractedData: result.extractedData,
  };
}

function serializeCaseUploadPayload(client) {
  const c = client.toJSON();
  return {
    id: c.id,
    clientName: c.fullName,
    fullName: c.fullName,
    progress: c.progress,
    status: c.status,
    magicExpiresAt: c.magicExpiresAt || null,
  };
}

module.exports = {
  genericDocumentUpload,
  uploadCaseDocumentSlot,
  serializeCaseUploadPayload,
  GENERIC_UPLOAD_MIMES,
};
