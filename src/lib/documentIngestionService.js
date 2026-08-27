/**
 * Nivel 1 — Orquestador: validar → storage → IA → DB → limpiar temporales.
 * Adaptado a MongoDB (Client + Document) del backend PathWay.
 */

const mongoose = require('mongoose');
const Document = require('../models/document');
const { extractIdentityDocument } = require('./passportExtractor');
const { mergeCaseExtractedData, flattenExtractedForLegacy } = require('./extractedDataContract');
const { uploadDocumentToStorage, deleteStagingObject } = require('./ingestionStorage');
const { callOpenAiVisionModel } = require('./ingestionVision');
const { config } = require('../config');
const { syncClientProgress } = require('./syncClient');
const { computeCaseProgress } = require('./caseProgress');
const { loadCaseDocuments } = require('./caseDocuments');
const { stampExpedientePdf } = require('./pdf/stampExpedientePdf');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function validateIncomingFile(file) {
  if (!file?.buffer?.length) {
    return { ok: false, code: 'EMPTY_FILE', message: 'El archivo está vacío.' };
  }
  if (file.buffer.length > MAX_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'El archivo supera 10 MB.' };
  }
  const mime = (file.mimeType ?? file.mimetype ?? '').toLowerCase();
  if (mime && !ALLOWED_MIMES.has(mime)) {
    return { ok: false, code: 'INVALID_TYPE', message: 'Formato no admitido.' };
  }
  return { ok: true };
}

function isExtractableType(documentType) {
  const t = (documentType ?? '').toLowerCase();
  return t === 'passport' || t.includes('pasaport') || t === 'nie';
}

function defaultCallVisionModel(buffer, mimeType, systemPrompt, originalName) {
  if (config.extractionMock || !config.openaiApiKey) return null;
  return callOpenAiVisionModel(buffer, mimeType, systemPrompt, originalName);
}

function buildSkippedPassportExtraction(doc, caseId) {
  return {
    schemaVersion: '1.0',
    documentType: 'passport',
    documentId: doc._id.toString(),
    caseId,
    ingestionStatus: 'processed',
    extractedAt: new Date().toISOString(),
    model: 'skip',
    fields: {},
    raw: {
      aiNotes: 'Extracción omitida (SKIP_PASSPORT_EXTRACTION=true). Archivo guardado sin IA.',
    },
  };
}

async function runPassportExtraction({ client, doc, file, caseId, deps, documentType }) {
  if (config.skipPassportExtraction) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ingestion][skip-extraction]', { caseId, documentId: doc._id.toString() });
    }
    return buildSkippedPassportExtraction(doc, caseId);
  }

  const visionFn =
    config.extractionMock || !config.openaiApiKey ? undefined : deps.callVisionModel;

  return extractIdentityDocument({
    buffer: file.buffer,
    mimeType: file.mimeType ?? file.mimetype ?? 'application/octet-stream',
    documentType: documentType.includes('nie') ? 'nie' : 'passport',
    documentId: doc._id.toString(),
    caseId,
    callVisionModel: visionFn,
    model: process.env.OPENAI_VISION_MODEL || config.openaiVisionModel || config.openaiModel || 'gpt-4o',
  });
}

function buildDefaultDeps(client, file) {
  const agencyId = client.agencyId.toString();
  const clientId = client._id.toString();

  return {
    uploadToStorage: async ({ buffer, mimeType, originalName, documentId }) =>
      uploadDocumentToStorage({
        buffer,
        mimeType,
        originalName,
        agencyId,
        clientId,
        documentId,
      }),
    deleteStaging: async (stagingKey, storage) =>
      deleteStagingObject(stagingKey, storage),
    callVisionModel: config.extractionMock || !config.openaiApiKey
      ? undefined
      : (buffer, mime, prompt) =>
          defaultCallVisionModel(buffer, mime, prompt, file?.originalName),
    computeProgress: async (caseClient) => {
      const docs = await loadCaseDocuments(caseClient._id);
      return computeCaseProgress(docs, caseClient);
    },
  };
}

/**
 * @param {object} input
 * @param {import('mongoose').Document} input.client
 * @param {string} input.documentId
 * @param {object} input.file — { buffer, mimeType|mimetype, originalName }
 * @param {object} [input.deps]
 * @param {boolean} [input.stampPdfAfterPassport] — generar EX-10 tras pasaporte
 */
async function ingestDocument({
  client,
  documentId,
  file,
  deps: depsOverride,
  stampPdfAfterPassport = false,
}) {
  const validation = validateIncomingFile(file);
  if (!validation.ok) {
    return {
      ok: false,
      ingestionStatus: 'error',
      error: validation.message,
      code: validation.code,
    };
  }

  if (!mongoose.isValidObjectId(documentId)) {
    return {
      ok: false,
      ingestionStatus: 'error',
      error: 'Documento no encontrado en el expediente.',
    };
  }

  const doc = await Document.findOne({ _id: documentId, clientId: client._id }).exec();
  if (!doc) {
    return {
      ok: false,
      ingestionStatus: 'error',
      error: 'Documento no encontrado en el expediente.',
    };
  }

  if (doc.reviewStatus === 'approved') {
    return {
      ok: false,
      ingestionStatus: 'error',
      error: 'Este documento ya está aprobado',
      code: 'ALREADY_APPROVED',
    };
  }

  const caseId = client._id.toString();
  const documentType = doc.key || doc.type || 'unknown';
  const mimeType = file.mimeType ?? file.mimetype ?? 'application/octet-stream';
  const deps = { ...buildDefaultDeps(client, file), ...depsOverride };

  doc.ingestionStatus = 'processing';
  await doc.save();

  let stagingKey = null;
  let storageKind = 'local';

  try {
    const uploaded = await deps.uploadToStorage({
      buffer: file.buffer,
      mimeType,
      originalName: file.originalName,
      documentId: doc._id.toString(),
    });
    stagingKey = uploaded.stagingKey;
    storageKind = uploaded.storage || 'local';
    const permanentKey = uploaded.key;

    let extractedData = null;
    if (isExtractableType(documentType)) {
      extractedData = await runPassportExtraction({
        client,
        doc,
        file,
        caseId,
        deps,
        documentType,
      });
    } else {
      extractedData = {
        schemaVersion: '1.0',
        documentType,
        documentId: doc._id.toString(),
        caseId,
        ingestionStatus: 'processed',
        extractedAt: new Date().toISOString(),
        fields: {},
      };
    }

    doc.fileUrl = permanentKey;
    if (uploaded.storage === 's3') {
      doc.s3Bucket = config.s3Bucket;
      doc.s3Key = permanentKey;
    }
    doc.originalName = file.originalName ?? '';
    doc.uploadedAt = new Date();
    doc.extractedData = extractedData;
    doc.ingestionStatus = extractedData.ingestionStatus;
    if (doc.reviewStatus === 'rejected') {
      doc.reviewStatus = 'pending';
      doc.feedbackMessage = '';
    }

    if (isExtractableType(documentType)) {
      client.extractedData = mergeCaseExtractedData(client, extractedData);
      if (client.status !== 'completed') client.status = 'processing';
      client.reviewStatus = 'pending';
      client.feedbackMessage = '';
      client.reviewedAt = null;
    }

    await doc.save();
    await client.save();

    if (typeof deps.computeProgress === 'function') {
      client.progress = await deps.computeProgress(client);
      await client.save();
    } else {
      await syncClientProgress(client._id);
    }

    if (stampPdfAfterPassport && isExtractableType(documentType)) {
      const flat = flattenExtractedForLegacy(extractedData);
      if (flat && extractedData.ingestionStatus !== 'error') {
        try {
          const pdf = await stampExpedientePdf(client._id.toString(), flat);
          client.finalPdfPath = pdf.objectKey || pdf.relativePath;
          client.finalPdfOnS3 = pdf.storage === 's3';
          await client.save();
        } catch (e) {
          console.error('[ingestion][stampPdf]', e.message);
        }
      }
    }

    if (typeof deps.deleteStaging === 'function' && stagingKey) {
      await deps.deleteStaging(stagingKey, storageKind).catch(() => {});
    }

    return {
      ok: true,
      ingestionStatus: extractedData.ingestionStatus,
      extractedData,
      document: doc,
      client,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    doc.ingestionStatus = 'error';
    await doc.save().catch(() => {});
    if (typeof deps.deleteStaging === 'function' && stagingKey) {
      await deps.deleteStaging(stagingKey, storageKind).catch(() => {});
    }
    return {
      ok: false,
      ingestionStatus: 'error',
      error: message,
      code: 'INGESTION_FAILED',
    };
  }
}

async function ingestPassportUpload({ client, file, deps, stampPdfAfterPassport = true }) {
  const passportDoc = await Document.findOne({
    clientId: client._id,
    key: 'passport',
  }).exec();
  if (!passportDoc) {
    return {
      ok: false,
      ingestionStatus: 'error',
      error: 'Slot de pasaporte no configurado.',
    };
  }
  return ingestDocument({
    client,
    documentId: passportDoc._id.toString(),
    file,
    deps,
    stampPdfAfterPassport,
  });
}

module.exports = {
  validateIncomingFile,
  ingestDocument,
  ingestPassportUpload,
  buildDefaultDeps,
  MAX_BYTES,
  ALLOWED_MIMES,
};
