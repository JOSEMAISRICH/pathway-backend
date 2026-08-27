/**
 * Almacenamiento opcional en Amazon S3 (o compatible: MinIO, R2 con endpoint).
 * Si faltan S3_BUCKET o región, isS3Configured() es false y el expediente sigue
 * guardándose solo en disco (tests y desarrollo local).
 */

const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { config } = require('../config');

/** @type {S3Client | null} */
let s3Client = null;

function isS3Configured() {
  return Boolean(config.s3Bucket && config.s3Region);
}

function getS3Client() {
  if (!isS3Configured()) return null;
  if (!s3Client) {
    const endpoint = config.s3Endpoint || undefined;
    s3Client = new S3Client({
      region: config.s3Region,
      endpoint,
      forcePathStyle: config.s3ForcePathStyle,
      credentials:
        config.awsAccessKeyId && config.awsSecretAccessKey
          ? {
              accessKeyId: config.awsAccessKeyId,
              secretAccessKey: config.awsSecretAccessKey,
            }
          : undefined,
    });
  }
  return s3Client;
}

/**
 * @param {string} fileName ej. expediente_64a....pdf
 * @returns {string} clave de objeto dentro del bucket
 */
function buildFinalPdfObjectKey(fileName) {
  const prefix = String(config.s3KeyPrefix || 'pathway')
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/\\/g, '/');
  return prefix ? `${prefix}/final/${fileName}` : `final/${fileName}`;
}

function sanitizeUploadBasename(name) {
  const base = path.basename(name || 'passport').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base.slice(0, 120) || 'passport';
}

/**
 * Clave S3 del escaneo original del pasaporte (un upload por timestamp en nombre).
 * @param {string} agencyId
 * @param {string} caseId
 * @param {string} originalName nombre original del cliente
 */
function buildPassportOriginalObjectKey(agencyId, caseId, originalName) {
  const prefix = String(config.s3KeyPrefix || 'pathway')
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/\\/g, '/');
  const safe = sanitizeUploadBasename(originalName);
  const aid = String(agencyId).replace(/[^a-fA-F0-9]/g, '');
  const cid = String(caseId).replace(/[^a-fA-F0-9]/g, '');
  const stamp = Date.now();
  const tail = `${prefix}/passports/${aid}/${cid}/${stamp}_${safe}`;
  return prefix ? tail : `passports/${aid}/${cid}/${stamp}_${safe}`;
}

/**
 * @param {string} key
 * @param {Buffer} body
 * @param {string} contentType MIME (p. ej. image/jpeg, application/pdf)
 */
async function uploadObjectBytes(key, body, contentType) {
  const client = getS3Client();
  if (!client) {
    const err = new Error('S3 no configurado');
    err.statusCode = 503;
    throw err;
  }
  const ct = contentType && String(contentType).trim() ? String(contentType).trim() : 'application/octet-stream';
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: ct,
    })
  );
}

async function uploadPdfObject(key, body) {
  return uploadObjectBytes(key, body, 'application/pdf');
}

/**
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function s3ObjectExists(key) {
  const client = getS3Client();
  if (!client || !key) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/**
 * @param {string} key
 * @param {{ download?: boolean, fileName?: string }} opts
 */
async function presignedGetObjectUrl(key, opts = {}) {
  const client = getS3Client();
  if (!client) {
    const err = new Error('S3 no configurado');
    err.statusCode = 503;
    throw err;
  }
  const fileName = (opts.fileName || key.split('/').pop() || 'expediente.pdf').replace(/"/g, '');
  const cd = opts.download
    ? `attachment; filename="${fileName}"`
    : `inline; filename="${fileName}"`;

  /** Si se pasa, fuerza el Content-Type de la respuesta; si no, usa el del objeto en S3. */
  const cmdInput = {
    Bucket: config.s3Bucket,
    Key: key,
    ResponseContentDisposition: cd,
  };
  if (opts.contentType) {
    cmdInput.ResponseContentType = opts.contentType;
  }

  const cmd = new GetObjectCommand(cmdInput);

  return getSignedUrl(client, cmd, { expiresIn: config.s3PresignTtlSeconds });
}

async function deleteObjectIfExists(key) {
  const client = getS3Client();
  if (!client || !key) return false;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isS3Configured,
  getS3Client,
  buildFinalPdfObjectKey,
  buildPassportOriginalObjectKey,
  sanitizeUploadBasename,
  uploadObjectBytes,
  uploadPdfObject,
  s3ObjectExists,
  presignedGetObjectUrl,
  deleteObjectIfExists,
};
