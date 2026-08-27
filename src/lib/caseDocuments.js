/**
 * Slots de documentos por expediente (portal cliente).
 * Nivel 2: slots resueltos por Case Engine según caseType.
 */

const Document = require('../models/document');
const { syncClientProgress } = require('./syncClient');
const { normalizeExtractedData, flattenExtractedForLegacy } = require('./extractedDataContract');

function getEngine() {
  return require('./caseEngine');
}

/** @deprecated Usar getDocumentSlots(caseType) */
const DEFAULT_CASE_DOCUMENT_SLOTS = [
  {
    key: 'passport',
    type: 'passport',
    label: 'Pasaporte (página de datos biográficos)',
  },
  {
    key: 'proof_address',
    type: 'proof_address',
    label: 'Justificante de domicilio',
  },
  {
    key: 'photo',
    type: 'photo',
    label: 'Fotografía tamaño carnet',
  },
];

/**
 * @param {import('mongoose').Document} doc
 * @param {import('mongoose').Document} [client]
 */
function serializeDocumentForApi(doc, client) {
  const j = doc.toJSON ? doc.toJSON() : doc;
  const key = j.key || j.type || '';
  const filePath = j.fileUrl || j.filePath || '';
  let hasFile = Boolean(filePath);
  if (key === 'passport' && client?.extractedData) {
    hasFile = true;
  }
  let extractedData = j.extractedData ?? null;
  const caseId = client?._id?.toString() || j.clientId;
  if (extractedData && typeof extractedData === 'object' && !extractedData.schemaVersion) {
    extractedData = normalizeExtractedData(extractedData, {
      documentType: key,
      documentId: j.id,
      caseId,
    });
  }
  const ingestionStatus =
    j.ingestionStatus ?? (hasFile ? 'processed' : 'pending_upload');

  return {
    id: j.id,
    key,
    label: j.label || key,
    status: j.status || j.reviewStatus || 'pending',
    feedbackMessage: j.feedbackMessage || '',
    hasFile,
    filePath,
    originalName: j.originalName || '',
    uploadedAt: j.uploadedAt || null,
    extractedData,
    ingestionStatus,
  };
}

async function loadCaseDocuments(clientId) {
  return Document.find({ clientId }).sort({ createdAt: 1 }).exec();
}

/**
 * Crea slots definidos por caseType si faltan (idempotente).
 * @param {import('mongoose').Document|string} clientOrId
 * @returns {Promise<import('mongoose').Document[]>}
 */
async function ensureCaseHasDocuments(clientOrId, opts = {}) {
  const Client = require('../models/client');
  let client =
    typeof clientOrId === 'object' && clientOrId?._id ? clientOrId : null;
  const clientId = client ? client._id : clientOrId;
  if (!client) {
    client = await Client.findById(clientId).exec();
  }
  if (!client) return [];

  const { resolveCaseType, getDocumentSlots } = getEngine();
  const caseType = opts.caseType || resolveCaseType(client);
  const slots = getDocumentSlots(caseType);
  const existing = await loadCaseDocuments(clientId);
  const existingKeys = new Set(existing.map((d) => d.key || d.type));

  for (const slot of slots) {
    if (existingKeys.has(slot.key)) continue;
    const doc = await Document.create({
      clientId,
      key: slot.key,
      type: slot.type,
      label: slot.label,
      reviewStatus: 'pending',
      feedbackMessage: '',
      fileUrl: '',
      originalName: '',
      uploadedAt: null,
      extractedData: null,
      ingestionStatus: 'pending_upload',
    });
    existing.push(doc);
    existingKeys.add(slot.key);
  }

  if (existing.length > 0) {
    await syncClientProgress(clientId);
  }
  return existing;
}

/**
 * Tras subir pasaporte (pipeline EX-10), marca el slot passport como subido.
 */
async function syncPassportDocumentAfterUpload(
  client,
  { originalName, passportS3, extractedData, ingestionStatus } = {}
) {
  if (!client?._id) return;
  await ensureCaseHasDocuments(client);
  const passportDoc = await Document.findOne({ clientId: client._id, key: 'passport' }).exec();
  if (!passportDoc) return;

  const filePath =
    passportS3?.key ||
    (Array.isArray(client.archivosS3) && client.archivosS3.length
      ? client.archivosS3[client.archivosS3.length - 1]?.key || ''
      : '');

  if (filePath) passportDoc.fileUrl = filePath;
  if (originalName) passportDoc.originalName = originalName;
  passportDoc.uploadedAt = new Date();
  if (extractedData) passportDoc.extractedData = extractedData;
  if (ingestionStatus) passportDoc.ingestionStatus = ingestionStatus;
  passportDoc.reviewStatus = 'pending';
  await passportDoc.save();
}

function hasRejectedDocuments(docs) {
  return docs.some((d) => d.reviewStatus === 'rejected');
}

/**
 * @param {import('mongoose').Document} client
 * @param {{ magic?: boolean }} [opts]
 */
function buildFinalPdfUrl(client, opts = {}) {
  if (!client?.finalPdfPath) return null;
  if (opts.magic && client.magicLinkToken) {
    return `/api/magic/${client.magicLinkToken}/final-pdf`;
  }
  const id = client._id?.toString() || client.id;
  return id ? `/api/cases/${id}/final-pdf` : null;
}

/** Datos planos para stampExpedientePdf (case o documento passport v1). */
async function getLegacyExtractedForPdf(client) {
  if (!client?._id) return null;
  const flatFromCase = flattenExtractedForLegacy(client.extractedData);
  if (flatFromCase && Object.keys(flatFromCase).some((k) => k !== 'notas' && flatFromCase[k])) {
    return flatFromCase;
  }
  if (
    client.extractedData &&
    typeof client.extractedData === 'object' &&
    !client.extractedData.schemaVersion
  ) {
    const keys = Object.keys(client.extractedData).filter(
      (k) => k !== 'notas' && client.extractedData[k]
    );
    if (keys.length > 0) return client.extractedData;
  }
  const passportDoc = await Document.findOne({ clientId: client._id, key: 'passport' }).exec();
  if (passportDoc?.extractedData) {
    return flattenExtractedForLegacy(passportDoc.extractedData);
  }
  return null;
}

function hasUsableExtractedIdentity(flat) {
  if (!flat || typeof flat !== 'object') return false;
  return ['nombre', 'apellidos', 'numero_pasaporte'].some((k) => flat[k]);
}

module.exports = {
  DEFAULT_CASE_DOCUMENT_SLOTS,
  serializeDocumentForApi,
  loadCaseDocuments,
  ensureCaseHasDocuments,
  syncPassportDocumentAfterUpload,
  hasRejectedDocuments,
  buildFinalPdfUrl,
  getLegacyExtractedForPdf,
  hasUsableExtractedIdentity,
};
