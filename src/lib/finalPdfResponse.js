/**
 * Sirve el PDF final del expediente (disco local o URL prefirmada S3).
 * Usado por GET /api/cases/:id/final-pdf y GET /api/magic/:token/final-pdf.
 *
 * S3: redirige 302 a la URL prefirmada salvo ?redirect=0, que devuelve JSON { url }.
 */

const fs = require('fs/promises');
const path = require('path');
const { config } = require('../config');
const { presignedGetObjectUrl, s3ObjectExists } = require('./s3Storage');

const PDF_NOT_READY_MESSAGE =
  'Aún no se ha generado el PDF del expediente. El cliente debe completar la subida.';

function respondPdfNotReady(res) {
  return res.status(404).json({ error: PDF_NOT_READY_MESSAGE });
}

/**
 * Comprueba que el expediente tenga PDF generado y que el objeto exista (disco o S3).
 * @param {import('mongoose').Document} client
 * @returns {Promise<'ok'|'missing'>}
 */
async function assertFinalPdfAvailable(client) {
  const keyOrRel = (client.finalPdfPath || '').trim();
  if (!keyOrRel) return 'missing';

  if (client.finalPdfOnS3) {
    try {
      const exists = await s3ObjectExists(keyOrRel);
      return exists ? 'ok' : 'missing';
    } catch (e) {
      console.error('[finalPdf][s3-head]', e.message);
      return 'missing';
    }
  }

  const root = path.resolve(config.uploadDir);
  const posix = keyOrRel.replace(/\\/g, '/');
  const abs = path.resolve(root, posix);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    return 'missing';
  }
  try {
    await fs.access(abs);
    return 'ok';
  } catch {
    return 'missing';
  }
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {import('mongoose').Document} client Expediente con finalPdfPath y finalPdfOnS3
 */
async function sendExpedienteFinalPdf(res, req, client) {
  const availability = await assertFinalPdfAvailable(client);
  if (availability !== 'ok') {
    return respondPdfNotReady(res);
  }

  const keyOrRel = client.finalPdfPath.replace(/\\/g, '/');
  const fileName = path.posix.basename(keyOrRel);
  const asDownload = Boolean(req.query.download);

  if (client.finalPdfOnS3) {
    try {
      const url = await presignedGetObjectUrl(keyOrRel, {
        download: asDownload,
        fileName,
      });
      if (String(req.query.redirect) === '0') {
        return res.json({
          url,
          expiresIn: config.s3PresignTtlSeconds,
        });
      }
      return res.redirect(302, url);
    } catch (e) {
      console.error('[finalPdf][s3]', e.message);
      return res.status(502).json({ error: 'No se pudo generar el enlace de descarga' });
    }
  }

  const root = path.resolve(config.uploadDir);
  const abs = path.resolve(root, keyOrRel);
  let data;
  try {
    data = await fs.readFile(abs);
  } catch {
    return respondPdfNotReady(res);
  }
  const disposition = asDownload ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.send(data);
}

module.exports = {
  sendExpedienteFinalPdf,
  assertFinalPdfAvailable,
  PDF_NOT_READY_MESSAGE,
};
