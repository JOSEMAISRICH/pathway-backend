/**
 * Storage para ingesta: disco local o S3 (+ borrado staging).
 */

const fs = require('fs/promises');
const path = require('path');
const { config } = require('../config');
const {
  isS3Configured,
  uploadObjectBytes,
  deleteObjectIfExists,
} = require('./s3Storage');

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

function pickExtension(originalName, mimeType) {
  const fromMime = EXT_BY_MIME[(mimeType || '').toLowerCase()];
  if (fromMime) return fromMime;
  const ext = path.extname(originalName || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.bin';
}

function buildStagingRelPath(agencyId, clientId, documentId, originalName, mimeType) {
  const ext = pickExtension(originalName, mimeType);
  return path.posix.join(
    String(agencyId),
    String(clientId),
    'staging',
    `${documentId}_${Date.now()}${ext}`
  );
}

function buildFinalRelPath(agencyId, clientId, documentId, originalName, mimeType) {
  const ext = pickExtension(originalName, mimeType);
  return path.posix.join(String(agencyId), String(clientId), `${documentId}${ext}`);
}

function buildS3DocumentKey(agencyId, clientId, documentId, originalName, mimeType, staging) {
  const prefix = String(config.s3KeyPrefix || 'pathway')
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/\\/g, '/');
  const ext = pickExtension(originalName, mimeType);
  const folder = staging ? 'staging' : 'documents';
  const tail = `${folder}/${agencyId}/${clientId}/${documentId}_${Date.now()}${ext}`;
  return prefix ? `${prefix}/${tail}` : tail;
}

/**
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.mimeType
 * @param {string} params.originalName
 * @param {string} params.agencyId
 * @param {string} params.clientId
 * @param {string} params.documentId
 */
async function uploadDocumentToStorage({
  buffer,
  mimeType,
  originalName,
  agencyId,
  clientId,
  documentId,
}) {
  const stagingRel = buildStagingRelPath(
    agencyId,
    clientId,
    documentId,
    originalName,
    mimeType
  );
  const finalRel = buildFinalRelPath(
    agencyId,
    clientId,
    documentId,
    originalName,
    mimeType
  );

  if (isS3Configured()) {
    const stagingKey = buildS3DocumentKey(
      agencyId,
      clientId,
      documentId,
      originalName,
      mimeType,
      true
    );
    const permanentKey = buildS3DocumentKey(
      agencyId,
      clientId,
      documentId,
      originalName,
      mimeType,
      false
    );
    await uploadObjectBytes(stagingKey, buffer, mimeType);
    await uploadObjectBytes(permanentKey, buffer, mimeType);
    return {
      key: permanentKey,
      stagingKey,
      storage: 's3',
    };
  }

  const stagingAbs = path.join(config.uploadDir, stagingRel);
  const finalAbs = path.join(config.uploadDir, finalRel);
  await fs.mkdir(path.dirname(stagingAbs), { recursive: true });
  await fs.writeFile(stagingAbs, buffer);
  await fs.mkdir(path.dirname(finalAbs), { recursive: true });
  await fs.copyFile(stagingAbs, finalAbs);
  return {
    key: finalRel,
    stagingKey: stagingRel,
    storage: 'local',
  };
}

async function deleteStagingObject(stagingKey, storage) {
  if (!stagingKey) return;
  if (storage === 's3' || (!storage && isS3Configured() && !stagingKey.includes('/'))) {
    await deleteObjectIfExists(stagingKey).catch(() => {});
    return;
  }
  const abs = path.isAbsolute(stagingKey)
    ? stagingKey
    : path.join(config.uploadDir, stagingKey);
  await fs.unlink(abs).catch(() => {});
}

module.exports = {
  uploadDocumentToStorage,
  deleteStagingObject,
  pickExtension,
};
