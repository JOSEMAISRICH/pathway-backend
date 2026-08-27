const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Client = require('../models/client');
const Document = require('../models/document');
const { mongoReady } = require('../middleware/mongoReady');
const { verifySession } = require('../lib/jwt');
const { config } = require('../config');
const { isMagicLinkExpired } = require('../lib/magicLinkExpiry');

const router = express.Router();

router.use(mongoReady);

function resolveUnderRoot(root, rel) {
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
    return null;
  }
  return full;
}

async function authorizePath(relPath, req) {
  const parts = relPath.split(/[/\\]/).filter(Boolean);
  if (parts.length < 3) return false;
  const [agencyId, clientId] = parts;
  if (!mongoose.isValidObjectId(agencyId) || !mongoose.isValidObjectId(clientId)) {
    return false;
  }
  const client = await Client.findById(clientId).exec();
  if (!client || client.agencyId.toString() !== agencyId) return false;
  const fileName = parts.slice(2).join('/');
  const expectedPrefix = `${agencyId}/${clientId}/`;
  const all = await Document.find({ clientId: client._id }).exec();
  const sub = all.find((d) => {
    const fp = (d.fileUrl || '').replace(/\\/g, '/');
    return fp === `${expectedPrefix}${fileName}` || fp.endsWith(`/${fileName}`);
  });
  if (!sub) return false;

  const cookie = req.cookies?.[config.cookieName];
  if (cookie) {
    try {
      const { agencyId: sid } = await verifySession(cookie);
      if (sid === agencyId) return true;
    } catch {
      /* fall through */
    }
  }
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (token && client.magicLinkToken === token) {
    if (isMagicLinkExpired(client.magicExpiresAt)) return false;
    if (client.status === 'completed') return false;
    return true;
  }
  return false;
}

router.use(async (req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  let rel = req.url.split('?')[0];
  if (rel.startsWith('/')) rel = rel.slice(1);
  if (!rel) {
    return res.status(400).json({ error: 'Falta ruta de archivo' });
  }
  rel = decodeURIComponent(rel);
  const relPosix = rel.replace(/\\/g, '/');
  if (/^https?:\/\//i.test(relPosix)) {
    return res.status(400).json({ error: 'Usa la URL directa del almacenamiento (S3/Cloudinary)' });
  }
  const abs = resolveUnderRoot(path.resolve(config.uploadDir), relPosix);
  if (!abs) {
    return res.status(400).json({ error: 'Ruta inválida' });
  }
  let allowed = false;
  const cookie = req.cookies?.[config.cookieName];
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (cookie) {
    try {
      const { agencyId } = await verifySession(cookie);
      if (relPosix.startsWith(`${agencyId}/`)) {
        allowed = await authorizePath(relPosix, req);
      }
    } catch {
      /* try token */
    }
  }
  if (!allowed && token) {
    allowed = await authorizePath(relPosix, req);
  }
  if (!allowed) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const data = await fs.readFile(abs);
    res.setHeader('Content-Disposition', 'inline');
    return res.send(data);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    return next(e);
  }
});

module.exports = router;
