/**
 * Descarga del último pasaporte subido a S3 (archivosS3, tipo passport).
 * Requiere S3 configurado y al menos un archivo registrado en el expediente.
 */

const { config } = require('../config');
const { isS3Configured, presignedGetObjectUrl, sanitizeUploadBasename } = require('./s3Storage');

/**
 * @param {import('mongoose').Document} client
 * @returns {object|null} subdocumento archivoS3 más reciente tipo passport
 */
function getLatestPassportArchivo(client) {
  const arr = Array.isArray(client.archivosS3) ? client.archivosS3 : [];
  const pass = arr.filter((a) => a && a.tipo === 'passport' && a.key && a.bucket);
  pass.sort((a, b) => {
    const ta = a.subidoEn instanceof Date ? a.subidoEn.getTime() : 0;
    const tb = b.subidoEn instanceof Date ? b.subidoEn.getTime() : 0;
    return tb - ta;
  });
  return pass[0] || null;
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {import('mongoose').Document} client
 */
async function sendLatestPassportOriginal(res, req, client) {
  if (!isS3Configured()) {
    return res.status(404).json({
      error: 'El escaneo original sólo está disponible con S3_BUCKET y región configurados',
    });
  }
  const entry = getLatestPassportArchivo(client);
  if (!entry) {
    return res.status(404).json({
      error: 'No hay pasaporte almacenado en la nube para este expediente',
    });
  }
  try {
    const fileName = sanitizeUploadBasename(entry.nombreOriginal || 'passport');
    const url = await presignedGetObjectUrl(entry.key, {
      download: Boolean(req.query.download),
      fileName,
      contentType: entry.contentType || undefined,
    });
    if (String(req.query.redirect) === '0') {
      return res.json({
        url,
        expiresIn: config.s3PresignTtlSeconds,
      });
    }
    return res.redirect(302, url);
  } catch (e) {
    console.error('[passportOriginal][s3]', e.message);
    return res.status(502).json({ error: 'No se pudo generar el enlace de descarga' });
  }
}

module.exports = { getLatestPassportArchivo, sendLatestPassportOriginal };
