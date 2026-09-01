const express = require('express');
const multer = require('multer');
const Client = require('../models/client');
const Agency = require('../models/agency');
const { mongoReady } = require('../middleware/mongoReady');
const { config } = require('../config');
const { httpError } = require('../lib/httpError');
const { sendExpedienteFinalPdf, PDF_NOT_READY_MESSAGE } = require('../lib/finalPdfResponse');
const { sendLatestPassportOriginal, getLatestPassportArchivo } = require('../lib/passportOriginalDownload');
const { isMagicLinkExpired } = require('../lib/magicLinkExpiry');
const { ingestDocument, ingestPassportUpload } = require('../lib/documentIngestionService');
const {
  ensureCaseHasDocuments,
  loadCaseDocuments,
  serializeDocumentForApi,
  hasRejectedDocuments,
  buildFinalPdfUrl,
} = require('../lib/caseDocuments');
const {
  genericDocumentUpload,
  uploadCaseDocumentSlot,
  serializeCaseUploadPayload,
} = require('../lib/caseDocumentUpload');

const MAGIC_EXPIRED_MSG = 'Este enlace ha caducado';
const MAGIC_INVALID_MSG = 'Enlace no válido';

const router = express.Router();

router.use(mongoReady);

const passportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter(_req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    const ok =
      mime === 'image/jpeg' ||
      mime === 'image/jpg' ||
      mime === 'image/png' ||
      mime === 'image/webp' ||
      mime === 'image/gif' ||
      mime === 'application/pdf';
    if (!ok) return cb(httpError(400, 'Sólo se admiten archivos JPG, PNG, WEBP, GIF o PDF'));
    return cb(null, true);
  },
});

async function loadActiveClientByToken(token) {
  const client = await Client.findOne({ magicLinkToken: token }).exec();
  if (!client) return { error: { status: 404, message: MAGIC_INVALID_MSG } };
  if (isMagicLinkExpired(client.magicExpiresAt)) {
    return { error: { status: 410, message: MAGIC_EXPIRED_MSG } };
  }
  if (client.status === 'completed') {
    return { error: { status: 410, message: 'El expediente está cerrado' } };
  }
  return { client };
}

/** Descarga PDF: enlace vigente y (aprobado o PDF ya generado). No bloquea por status completed. */
async function loadClientByTokenForPdf(token) {
  const client = await Client.findOne({ magicLinkToken: token }).exec();
  if (!client) return { error: { status: 404, message: MAGIC_INVALID_MSG } };
  if (isMagicLinkExpired(client.magicExpiresAt)) {
    return { error: { status: 410, message: MAGIC_EXPIRED_MSG } };
  }
  const approved = (client.reviewStatus || 'pending') === 'approved';
  const hasPdf = Boolean((client.finalPdfPath || '').trim());
  if (!approved && !hasPdf) {
    return { error: { status: 404, message: PDF_NOT_READY_MESSAGE } };
  }
  return { client };
}

function magicGoneResponse(res, message) {
  return res.status(410).json({ error: message });
}

async function serializeMagicCase(client, agency) {
  await ensureCaseHasDocuments(client._id);
  const docs = await loadCaseDocuments(client._id);
  const c = client.toJSON();
  const hasFinalPdf = Boolean(client.finalPdfPath);
  const approved = (client.reviewStatus || 'pending') === 'approved';
  return {
    case: {
      id: c.id,
      clientName: c.fullName,
      fullName: c.fullName,
      phone: c.phone || '',
      clientPhone: c.phone || '',
      progress: c.progress,
      status: c.status,
      magicExpiresAt: c.magicExpiresAt || null,
      documents: docs.map((d) => serializeDocumentForApi(d, client)),
      extractedData: c.extractedData || null,
      hasFinalPdf,
      finalPdfStorage: c.finalPdfOnS3 ? 's3' : 'local',
      hasPassportOriginalOnS3: Boolean(getLatestPassportArchivo(client)),
      passportOriginalUrl: getLatestPassportArchivo(client)
        ? `/api/magic/${client.magicLinkToken}/passport-original`
        : null,
      finalPdfUrl:
        approved || hasFinalPdf ? buildFinalPdfUrl(client, { magic: true }) : null,
      reviewStatus: c.reviewStatus || 'pending',
      feedbackMessage: c.feedbackMessage || '',
      reviewedAt: c.reviewedAt || null,
      hasRejectedDocuments: hasRejectedDocuments(docs),
    },
    agency: {
      name: agency.name,
      logoUrl: agency.logoUrl || '',
    },
  };
}

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  const client = await Client.findOne({ magicLinkToken: token }).exec();
  if (!client) {
    return res.status(404).json({ error: MAGIC_INVALID_MSG });
  }
  if (isMagicLinkExpired(client.magicExpiresAt)) {
    return magicGoneResponse(res, MAGIC_EXPIRED_MSG);
  }
  const agency = await Agency.findById(client.agencyId).exec();
  if (!agency) {
    return res.status(404).json({ error: 'Agencia no encontrada' });
  }
  return res.json(await serializeMagicCase(client, agency));
});

/**
 * POST /api/magic/:token/upload
 * Subida genérica a un slot (proof_address, photo, …). Pasaporte → upload-passport.
 */
router.post('/:token/upload', (req, res, next) => {
  genericDocumentUpload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Archivo demasiado grande' });
      }
      return res
        .status(multerErr.statusCode || 400)
        .json({ error: multerErr.message || 'Error al recibir el archivo' });
    }

    try {
      const { client, error } = await loadActiveClientByToken(req.params.token);
      if (error) return res.status(error.status).json({ error: error.message });
      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
      }

      const docId = req.body?.docId;
      const result = await uploadCaseDocumentSlot({
        client,
        docId,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      return res.status(200).json({
        ok: true,
        success: true,
        message: 'Documento subido correctamente',
        ingestionStatus: result.ingestionStatus,
        extractedData: result.extractedData,
        case: {
          ...serializeCaseUploadPayload(result.client),
          documents: result.documents,
        },
      });
    } catch (e) {
      if (e.statusCode) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      console.error('[magic][upload]', e.message);
      return res.status(500).json({ error: 'Error al guardar el documento' });
    }
  });
});

/**
 * POST /api/magic/:token/upload-passport
 * Variante "case-level" del flujo /api/cases/:id/upload pero autenticada por
 * token de magic link (no requiere sesión de agencia). Es lo que dispara el
 * portal del cliente cuando arrastra su pasaporte.
 */
router.post('/:token/upload-passport', (req, res, next) => {
  passportUpload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Archivo demasiado grande' });
      }
      return res
        .status(multerErr.statusCode || 400)
        .json({ error: multerErr.message || 'Error al recibir el archivo' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
      }
      const { client, error } = await loadActiveClientByToken(req.params.token);
      if (error) return res.status(error.status).json({ error: error.message });

      await ensureCaseHasDocuments(client._id);

      const result = await ingestPassportUpload({
        client,
        file: {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
        },
        stampPdfAfterPassport: true,
      });

      if (!result.ok) {
        return res.status(400).json({
          error: result.error,
          ingestionStatus: result.ingestionStatus,
        });
      }

      const agency = await Agency.findById(client.agencyId).exec();
      if (!agency) {
        return res.status(404).json({ error: 'Agencia no encontrada' });
      }
      const refreshed = await Client.findById(client._id).exec();
      const payload = await serializeMagicCase(refreshed, agency);
      return res.status(200).json({
        success: true,
        message: 'Pasaporte procesado correctamente',
        ingestionStatus: result.ingestionStatus,
        extractedData: result.extractedData,
        ...payload,
        pdf: refreshed.finalPdfPath
          ? {
              downloadUrl: `/api/magic/${req.params.token}/final-pdf`,
            }
          : undefined,
      });
    } catch (e) {
      console.error('[magic][upload-passport]', e.message);
      if (e.statusCode) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      return next(e);
    }
  });
});

/**
 * GET /api/magic/:token/final-pdf
 * Permite al cliente (sin sesión) descargar/previsualizar su expediente PDF
 * mientras su magic link siga vigente y el expediente esté aprobado.
 */
router.get('/:token/final-pdf', async (req, res, next) => {
  try {
    const { client, error } = await loadClientByTokenForPdf(req.params.token);
    if (error) return res.status(error.status).json({ error: error.message });
    return sendExpedienteFinalPdf(res, req, client);
  } catch (e) {
    return next(e);
  }
});

router.get('/:token/passport-original', async (req, res, next) => {
  try {
    const { client, error } = await loadActiveClientByToken(req.params.token);
    if (error) return res.status(error.status).json({ error: error.message });
    return sendLatestPassportOriginal(res, req, client);
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
