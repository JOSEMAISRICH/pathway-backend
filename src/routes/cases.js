const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/client');
const Agency = require('../models/agency');
const Document = require('../models/document');
const { CLIENT_STATUSES } = require('../models/client');
const { mongoReady } = require('../middleware/mongoReady');
const { requireAgency } = require('../middleware/requireAgency');
const { requirePaidPlan } = require('../middleware/requirePaidPlan');
const { config } = require('../config');
const { httpError } = require('../lib/httpError');
const { processPassportUpload } = require('../lib/passportPipeline');
const { notifyClientReview } = require('../lib/notifyClient');
const { sendExpedienteFinalPdf } = require('../lib/finalPdfResponse');
const { sendLatestPassportOriginal } = require('../lib/passportOriginalDownload');
const { readClientPhone, issueMagicLinkForCase } = require('../lib/magicLinkCase');
const { parseReviewBody } = require('../lib/reviewCase');
const { sendMagicLinkEmailToClient } = require('../lib/notifyMagicLinkEmail');
const { computeMagicExpiresAt, assignFreshMagicLink } = require('../lib/magicLinkExpiry');
const {
  ensureCaseHasDocuments,
  getLegacyExtractedForPdf,
  hasUsableExtractedIdentity,
  loadCaseDocuments,
} = require('../lib/caseDocuments');
const {
  normalizeCaseType,
  DEFAULT_CASE_TYPE,
  validateCaseApproval,
  listCaseTypes,
} = require('../lib/caseEngine');
const {
  serializeCaseDetail,
  serializeCaseListItemSafe,
  wantsSendMagicLinkEmail,
} = require('../lib/serializeCaseApi');
const {
  parseDocumentReviewBody,
  reviewCaseDocument,
} = require('../lib/caseDocumentReview');
const {
  parseManualFieldsBody,
  updateDocumentExtractedData,
} = require('../lib/updateExtractedData');
const { stampExpedientePdf } = require('../lib/pdf/stampExpedientePdf');
const {
  genericDocumentUpload,
  uploadCaseDocumentSlot,
} = require('../lib/caseDocumentUpload');

const router = express.Router();

const TEMP_UPLOAD_DIR = path.resolve(config.uploadDir, 'temp');
const FINAL_UPLOAD_DIR = path.resolve(config.uploadDir, 'final');

(async () => {
  try {
    await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
    await fs.mkdir(FINAL_UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error('[uploads] no se pudieron preparar carpetas temp/final:', e.message);
  }
})();

const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const passportUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
        cb(null, TEMP_UPLOAD_DIR);
      } catch (e) {
        cb(e, TEMP_UPLOAD_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const rawExt = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.pdf'].includes(rawExt) ? rawExt : '';
      cb(null, `${Date.now()}_${uuidv4()}${safeExt}`);
    },
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_UPLOAD_MIMES.has(mime)) return cb(null, true);
    return cb(httpError(400, 'Sólo se admiten archivos JPG, PNG o PDF'));
  },
});

router.use(mongoReady, requireAgency, requirePaidPlan);

async function clientWithDocuments(client) {
  return serializeCaseDetail(client);
}

async function loadOwnedClient(caseId, agencyId) {
  if (!mongoose.isValidObjectId(caseId)) return null;
  return Client.findOne({ _id: caseId, agencyId }).exec();
}

async function agencyNameForRequest(agencyId) {
  const agency = await Agency.findById(agencyId).select('name').lean().exec();
  return agency?.name || '';
}

router.get('/types', (_req, res) => {
  return res.json({ caseTypes: listCaseTypes() });
});

router.get('/', async (req, res) => {
  try {
    const clients = await Client.find({ agencyId: req.agencyId }).sort({ updatedAt: -1 }).exec();
    const cases = await Promise.all(clients.map((c) => serializeCaseListItemSafe(c)));
    return res.json({ cases });
  } catch (err) {
    console.error('[cases][GET /]', err);
    const body = { error: 'Error al listar expedientes' };
    if (config.nodeEnv === 'development' && err instanceof Error) {
      body.detail = err.message;
    }
    return res.status(500).json(body);
  }
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const fullName = body.fullName || body.clientName;
  const email = body.email != null ? body.email : body.clientEmail;
  const phone = readClientPhone(body);
  const { magicExpiresAt } = body;
  const caseType = normalizeCaseType(body.caseType) || DEFAULT_CASE_TYPE;
  if (!fullName) {
    return res.status(400).json({ error: 'Falta fullName o clientName' });
  }
  const magicLinkToken = uuidv4();
  let expires = computeMagicExpiresAt();
  if (magicExpiresAt) {
    const d = new Date(magicExpiresAt);
    if (!Number.isNaN(d.getTime())) expires = d;
  }
  const client = await Client.create({
    agencyId: req.agencyId,
    fullName,
    email: email || '',
    phone: phone ?? '',
    magicLinkToken,
    magicExpiresAt: expires,
    caseType,
  });
  await ensureCaseHasDocuments(client, { caseType });
  const fresh = await Client.findById(client._id).exec();

  const response = { case: await clientWithDocuments(fresh) };

  if (wantsSendMagicLinkEmail(body)) {
    const emailResult = await sendMagicLinkEmailToClient(fresh, {
      magicLinkUrl: response.case.magicLinkUrl,
      agencyName: await agencyNameForRequest(req.agencyId),
      throwOnFailure: false,
    });
    response.emailSent = emailResult.emailSent;
    if (!emailResult.emailSent && emailResult.error) {
      response.emailError = emailResult.error;
    }
  }

  return res.status(201).json(response);
});

/**
 * POST /api/cases/:caseId/documents/upload
 * Subida genérica autenticada (misma lógica que POST /api/magic/:token/upload).
 */
router.post('/:caseId/documents/upload', (req, res, next) => {
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
      if (!mongoose.isValidObjectId(req.params.caseId)) {
        return res.status(400).json({ error: 'ID de expediente inválido' });
      }
      const client = await loadOwnedClient(req.params.caseId, req.agencyId);
      if (!client) {
        return res.status(404).json({ error: 'Expediente no encontrado' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
      }

      const result = await uploadCaseDocumentSlot({
        client,
        docId: req.body?.docId,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      return res.status(200).json({
        ok: true,
        message: 'Documento subido correctamente',
        case: {
          ...(await clientWithDocuments(result.client)),
        },
      });
    } catch (e) {
      if (e.statusCode) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      console.error('[cases][documents/upload]', e.message);
      return res.status(500).json({ error: 'Error al guardar el documento' });
    }
  });
});

/**
 * PATCH /api/cases/:caseId/documents/:docId/review
 * Revisión por slot (domicilio, foto, …). No cambia case.reviewStatus global.
 */
router.patch('/:caseId/documents/:docId/review', async (req, res, next) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.caseId) ||
      !mongoose.isValidObjectId(req.params.docId)
    ) {
      return res.status(404).json({ error: 'Recurso no encontrado' });
    }
    const client = await loadOwnedClient(req.params.caseId, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const { status, feedbackMessage } = parseDocumentReviewBody(req.body);
    await reviewCaseDocument({
      client,
      docId: req.params.docId,
      status,
      feedbackMessage,
    });
    const fresh = await Client.findById(client._id).exec();
    return res.status(200).json({
      ok: true,
      case: await clientWithDocuments(fresh),
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

/**
 * PATCH /api/cases/:caseId/documents/:docId/extracted-data
 * Corrección manual de campos extraídos (pasaporte/NIE) por el despacho.
 */
router.patch('/:caseId/documents/:docId/extracted-data', async (req, res, next) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.caseId) ||
      !mongoose.isValidObjectId(req.params.docId)
    ) {
      return res.status(404).json({ error: 'Recurso no encontrado' });
    }
    const client = await loadOwnedClient(req.params.caseId, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const doc = await Document.findOne({
      _id: req.params.docId,
      clientId: client._id,
    }).exec();
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const fieldsPatch = parseManualFieldsBody(req.body);
    const extractedData = await updateDocumentExtractedData({
      client,
      doc,
      fieldsPatch,
    });

    const fresh = await Client.findById(client._id).exec();
    return res.status(200).json({
      ok: true,
      extractedData,
      case: await clientWithDocuments(fresh),
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

/**
 * POST /api/cases/:id/upload
 * Flujo completo de automatización de expediente:
 *  1. Multer recibe imagen (JPG/PNG) o PDF y la guarda en /uploads/temp.
 *  2. La IA (GPT-4o vía openaiApiKey) extrae los datos del pasaporte usando
 *     el system prompt fijado en lib/passportExtractor.js.
 *  3. Se persisten en `Expediente.extractedData` y se actualiza el estado.
 *  4. pdf-lib estampa los datos sobre la plantilla EX10_template.pdf y guarda
 *     el resultado en /uploads/final/expediente_[id].pdf.
 *  5. Se elimina el archivo temporal (en `finally`) y se devuelve el caso.
 */
router.post('/:id/upload', (req, res, next) => {
  passportUpload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Archivo demasiado grande' });
      }
      return res
        .status(multerErr.statusCode || 400)
        .json({ error: multerErr.message || 'Error al recibir el archivo' });
    }

    const tempPath = req.file?.path || null;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
      }

      const caseId = req.params.id;
      if (!mongoose.isValidObjectId(caseId)) {
        return res.status(400).json({ error: 'ID de expediente inválido' });
      }

      const client = await Client.findOne({
        _id: caseId,
        agencyId: req.agencyId,
      }).exec();
      if (!client) {
        return res.status(404).json({ error: 'Expediente no encontrado' });
      }

      let pipeline;
      try {
        pipeline = await processPassportUpload({
          client,
          tempFilePath: tempPath,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
        });
      } catch (pipelineErr) {
        console.error('[upload][pipeline]', pipelineErr.message);
        const fresh = await Client.findById(client._id).exec();
        return res.status(pipelineErr.statusCode || 500).json({
          success: false,
          error: pipelineErr.message,
          case: fresh ? await clientWithDocuments(fresh) : undefined,
        });
      }

      const fresh = await Client.findById(client._id).exec();
      return res.status(200).json({
        success: true,
        message: 'Pasaporte procesado y expediente generado correctamente',
        case: await clientWithDocuments(fresh),
        extractedData: pipeline.extractedData,
        ingestionStatus: pipeline.extractedData?.ingestionStatus,
        ...(pipeline.pdf
          ? {
              pdf: {
                fileName: pipeline.pdf.fileName,
                relativePath: pipeline.pdf.relativePath,
                storage: pipeline.pdf.storage || 'local',
                downloadUrl: `/api/cases/${client._id.toString()}/final-pdf`,
              },
            }
          : {}),
        ...(pipeline.passportS3
          ? {
              passportOriginalUrl: `/api/cases/${client._id.toString()}/passport-original`,
            }
          : {}),
      });
    } catch (e) {
      return next(e);
    } finally {
      if (tempPath) {
        fs.unlink(tempPath).catch(() => {
          /* limpieza best-effort; no propagamos */
        });
      }
    }
  });
});

/**
 * GET /api/cases/:id/final-pdf
 * Devuelve el PDF estampado expediente_[id].pdf protegido por sesión de agencia.
 *  - ?download=1  → fuerza Content-Disposition: attachment
 *  - por defecto  → inline (permite vista previa en iframe / <embed>)
 */
router.get('/:id/final-pdf', async (req, res, next) => {
  try {
    const client = await loadOwnedClient(req.params.id, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    return sendExpedienteFinalPdf(res, req, client);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/cases/:id/magic-link
 * Genera (o renueva) el token del portal del cliente y devuelve la URL lista para compartir.
 * Body opcional: phone | clientPhone | telefono, magicExpiresAt, regenerate (default true).
 */
router.post('/:id/magic-link', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }
    const client = await loadOwnedClient(req.params.id, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const body = req.body || {};
    const regenerate =
      body.regenerate === undefined ? true : Boolean(body.regenerate);
    const { magicLinkUrl, magicToken, magicExpiresAt } = await issueMagicLinkForCase(client, body, {
      regenerateToken: regenerate,
    });
    const fresh = await Client.findById(client._id).exec();
    return res.status(200).json({
      success: true,
      message: 'Enlace mágico generado correctamente',
      case: await clientWithDocuments(fresh),
      magicLinkUrl,
      magicToken,
      magicExpiresAt,
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

/**
 * PATCH /api/cases/:id/review
 * Decisión del abogado sobre el expediente (case-level):
 *   body: { action: 'approve' | 'reject', feedback?: string }
 *
 * - approve  → reviewStatus = 'approved', status = 'completed'.
 *              feedback opcional (queda en feedbackMessage como "nota").
 * - reject   → reviewStatus = 'rejected', status = 'action_required'.
 *              feedback OBLIGATORIO: explica al cliente qué corregir.
 *
 * Tras guardar dispara notifyClientReview (Resend si RESEND_API_KEY; si no, solo log).
 */
router.get('/:id/passport-original', async (req, res, next) => {
  try {
    const client = await loadOwnedClient(req.params.id, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    return sendLatestPassportOriginal(res, req, client);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/cases/:id/send-magic-email
 * Envía al cliente un email con el enlace al portal (magic link).
 * Body opcional: phone, magicExpiresAt, regenerate (default false para no invalidar enlaces ya enviados).
 */
router.post('/:id/send-magic-email', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }
    const client = await loadOwnedClient(req.params.id, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const body = req.body || {};
    const regenerate = body.regenerate === true;
    const { magicLinkUrl, magicToken, magicExpiresAt } = await issueMagicLinkForCase(client, body, {
      regenerateToken: regenerate,
    });
    const emailResult = await sendMagicLinkEmailToClient(client, {
      magicLinkUrl,
      agencyName: await agencyNameForRequest(req.agencyId),
    });
    const fresh = await Client.findById(client._id).exec();
    return res.status(200).json({
      success: true,
      emailSent: emailResult.emailSent,
      message: emailResult.emailSent
        ? 'Enlace del portal enviado por email al cliente'
        : emailResult.error || 'Enlace listo; email no enviado',
      case: await clientWithDocuments(fresh),
      magicLinkUrl,
      magicToken,
      magicExpiresAt,
      email: emailResult,
      ...(emailResult.emailSent ? {} : { emailError: emailResult.error }),
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
});

async function handleCaseReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID de expediente inválido' });
    }
    const { action, feedback } = parseReviewBody(req.body);

    const client = await loadOwnedClient(req.params.id, req.agencyId);
    if (!client) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }

    let pdfWarning = null;

    if (action === 'approve') {
      const docs = await loadCaseDocuments(client._id);
      const gate = await validateCaseApproval(client, docs);
      if (!gate.ok) {
        return res.status(400).json({
          error: gate.error,
          checklist: gate.checklist,
        });
      }

      const flat = await getLegacyExtractedForPdf(client);
      if (!client.finalPdfPath) {
        if (hasUsableExtractedIdentity(flat)) {
          try {
            const pdf = await stampExpedientePdf(client._id.toString(), flat);
            client.finalPdfPath = pdf.objectKey || pdf.relativePath;
            client.finalPdfOnS3 = pdf.storage === 's3';
          } catch (pdfErr) {
            console.error('[review][final-pdf]', pdfErr.message);
            pdfWarning =
              'Expediente aprobado pero no se pudo generar el PDF EX-10. Revisa los datos extraídos.';
          }
        } else {
          pdfWarning =
            'Expediente aprobado sin PDF: la extracción del pasaporte falló o no devolvió datos (revisa ingestionStatus del documento o vuelve a subir el pasaporte).';
        }
      }
      client.reviewStatus = 'approved';
      client.status = 'completed';
      client.feedbackMessage = feedback || '';
    } else {
      client.reviewStatus = 'rejected';
      client.status = 'action_required';
      client.feedbackMessage = feedback;
    }
    client.reviewedAt = new Date();
    await client.save();

    notifyClientReview({
      client,
      decision: client.reviewStatus,
      feedback,
    }).catch((e) => console.error('[notifyClient]', e.message));

    const fresh = await Client.findById(client._id).exec();
    return res.json({
      success: true,
      message:
        action === 'approve'
          ? pdfWarning
            ? `Expediente aprobado. ${pdfWarning}`
            : 'Expediente aprobado y notificado al cliente'
          : 'Corrección solicitada y notificada al cliente',
      ...(pdfWarning ? { pdfWarning } : {}),
      case: await clientWithDocuments(fresh),
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    return next(e);
  }
}

router.patch('/:id/review', handleCaseReview);
router.post('/:id/review', handleCaseReview);

router.get('/:caseId', async (req, res) => {
  const client = await loadOwnedClient(req.params.caseId, req.agencyId);
  if (!client) {
    return res.status(404).json({ error: 'Expediente no encontrado' });
  }
  return res.json({ case: await clientWithDocuments(client) });
});

router.patch('/:caseId', async (req, res) => {
  const client = await loadOwnedClient(req.params.caseId, req.agencyId);
  if (!client) {
    return res.status(404).json({ error: 'Expediente no encontrado' });
  }
  const body = req.body || {};
  const name = body.fullName ?? body.clientName;
  if (name != null) {
    if (!String(name).trim()) {
      return res.status(400).json({ error: 'fullName no puede estar vacío' });
    }
    client.fullName = String(name).trim();
  }
  const mail = body.email ?? body.clientEmail;
  if (mail != null) {
    client.email = String(mail).trim();
  }
  const phone = readClientPhone(body);
  if (phone !== undefined) {
    client.phone = phone;
  }
  if (body.magicExpiresAt !== undefined) {
    if (body.magicExpiresAt === null || body.magicExpiresAt === '') {
      client.magicExpiresAt = null;
    } else {
      const d = new Date(body.magicExpiresAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'magicExpiresAt no es una fecha válida' });
      }
      client.magicExpiresAt = d;
    }
  }
  if (body.status != null) {
    if (!CLIENT_STATUSES.includes(body.status)) {
      return res.status(400).json({
        error: `status debe ser uno de: ${CLIENT_STATUSES.join(', ')}`,
      });
    }
    client.status = body.status;
  }
  if (body.regenerateMagicLink === true) {
    assignFreshMagicLink(client);
  }
  await client.save();
  const fresh = await Client.findById(client._id).exec();
  return res.json({ case: await clientWithDocuments(fresh) });
});

router.delete('/:caseId', async (req, res) => {
  const client = await loadOwnedClient(req.params.caseId, req.agencyId);
  if (!client) {
    return res.status(404).json({ error: 'Expediente no encontrado' });
  }
  const agencyId = client.agencyId.toString();
  const clientId = client._id.toString();
  try {
    const dir = path.join(config.uploadDir, agencyId, clientId);
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignorar si no hay carpeta */
  }
  await Document.deleteMany({ clientId: client._id });
  await Client.deleteOne({ _id: client._id });
  return res.status(204).send();
});

module.exports = router;
