/**
 * passportPipeline.js — subida pasaporte despacho (legacy + EX-10 PDF).
 * Usa extractIdentityDocument v1; client.extractedData queda en plano legacy.
 */

const fs = require('fs/promises');
const { config } = require('../config');
const { httpError } = require('./httpError');
const { extractIdentityDocument } = require('./passportExtractor');
const { callOpenAiVisionModel } = require('./ingestionVision');
const {
  flattenExtractedForLegacy,
  mergeCaseExtractedData,
} = require('./extractedDataContract');
const { stampExpedientePdf } = require('./pdf/stampExpedientePdf');
const { syncPassportDocumentAfterUpload } = require('./caseDocuments');
const {
  isS3Configured,
  buildPassportOriginalObjectKey,
  uploadObjectBytes,
} = require('./s3Storage');

async function processPassportUpload({ client, tempFilePath, originalName, mimeType }) {
  if (!client) throw httpError(404, 'Expediente no encontrado');
  if (!tempFilePath) throw httpError(400, 'Falta el archivo a procesar');

  const buffer = await fs.readFile(tempFilePath);
  if (!buffer?.length) throw httpError(400, 'El archivo está vacío');

  const extractedV1 = await extractIdentityDocument({
    buffer,
    mimeType: mimeType || 'application/octet-stream',
    documentType: 'passport',
    documentId: 'passport',
    caseId: client._id.toString(),
    callVisionModel: config.openaiApiKey
      ? (b, m, p) => callOpenAiVisionModel(b, m, p, originalName)
      : undefined,
    model: process.env.OPENAI_VISION_MODEL || config.openaiModel || 'gpt-4o',
  });

  const legacyFlat = flattenExtractedForLegacy(extractedV1) || {};

  let passportS3 = null;
  if (isS3Configured()) {
    const ct = (mimeType && String(mimeType).trim()) || 'application/octet-stream';
    const key = buildPassportOriginalObjectKey(
      client.agencyId.toString(),
      client._id.toString(),
      typeof originalName === 'string' ? originalName : 'upload'
    );
    await uploadObjectBytes(key, buffer, ct);
    if (!Array.isArray(client.archivosS3)) client.archivosS3 = [];
    client.archivosS3.push({
      bucket: config.s3Bucket,
      key,
      region: config.s3Region || '',
      tipo: 'passport',
      nombreOriginal: typeof originalName === 'string' ? originalName : '',
      contentType: ct,
      tamanoBytes: buffer.length,
      subidoEn: new Date(),
    });
    passportS3 = { bucket: config.s3Bucket, key };
  }

  client.extractedData = mergeCaseExtractedData(client, extractedV1);
  if (client.status !== 'completed') client.status = 'processing';
  client.reviewStatus = 'pending';
  client.feedbackMessage = '';
  client.reviewedAt = null;
  await client.save();

  await syncPassportDocumentAfterUpload(client, {
    originalName,
    passportS3,
    extractedData: extractedV1,
    ingestionStatus: extractedV1.ingestionStatus,
  });

  let pdf = null;
  if (extractedV1.ingestionStatus !== 'error') {
    pdf = await stampExpedientePdf(client._id.toString(), legacyFlat);
    client.finalPdfPath = pdf.objectKey || pdf.relativePath;
    client.finalPdfOnS3 = pdf.storage === 's3';
    try {
      await client.save();
    } catch (e) {
      console.error('[passportPipeline] no se pudo guardar finalPdfPath:', e.message);
    }
  }

  return { extractedData: extractedV1, legacyExtractedData: legacyFlat, pdf, passportS3 };
}

module.exports = { processPassportUpload };
