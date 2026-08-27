/**
 * Revisión de un slot de documento (PATCH …/documents/:docId/review).
 */

const mongoose = require('mongoose');
const Document = require('../models/document');
const { httpError } = require('./httpError');
const { documentHasFile } = require('./caseProgress');
const { refreshCaseProgressOnly } = require('./syncClient');
const { notifyClientDocumentReview } = require('./notifyClient');

function normalizeDocReviewStatus(raw) {
  if (raw == null) return '';
  const t = String(raw).trim().toLowerCase();
  if (t === 'approve' || t === 'approved' || t === 'accept' || t === 'accepted') {
    return 'approved';
  }
  if (t === 'reject' || t === 'rejected' || t === 'deny' || t === 'denied') {
    return 'rejected';
  }
  return t;
}

/**
 * @param {object} body
 * @returns {{ status: 'approved'|'rejected', feedbackMessage: string }}
 */
function parseDocumentReviewBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const status = normalizeDocReviewStatus(b.status ?? b.reviewStatus ?? b.action);
  if (status !== 'approved' && status !== 'rejected') {
    throw httpError(400, 'status debe ser "approved" o "rejected"');
  }
  const feedbackMessage = String(
    b.feedbackMessage ?? b.feedback ?? b.message ?? ''
  ).trim();
  if (status === 'rejected' && feedbackMessage.length < 3) {
    throw httpError(
      400,
      'feedbackMessage es obligatorio al rechazar (mínimo 3 caracteres)'
    );
  }
  return { status, feedbackMessage };
}

/**
 * @param {import('mongoose').Document} doc
 * @param {import('mongoose').Document} client
 */
function documentSlotHasFile(doc, client) {
  return documentHasFile(doc, client);
}

async function reviewCaseDocument({ client, docId, status, feedbackMessage }) {
  if (!mongoose.isValidObjectId(docId)) {
    throw httpError(404, 'Documento no encontrado');
  }

  const doc = await Document.findOne({ _id: docId, clientId: client._id }).exec();
  if (!doc) {
    throw httpError(404, 'Documento no encontrado');
  }

  if (!documentSlotHasFile(doc, client)) {
    throw httpError(400, 'No hay archivo para revisar');
  }

  if (status === 'approved' && doc.reviewStatus === 'approved') {
    throw httpError(409, 'Este documento ya está aprobado');
  }

  if (status === 'approved') {
    doc.reviewStatus = 'approved';
    doc.feedbackMessage = '';
  } else {
    doc.reviewStatus = 'rejected';
    doc.feedbackMessage = feedbackMessage;
  }

  await doc.save();

  const freshClient = await refreshCaseProgressOnly(client._id);

  if (status === 'rejected') {
    notifyClientDocumentReview({
      client: freshClient || client,
      documentLabel: doc.label || doc.key || doc.type,
      feedbackMessage,
    }).catch((e) => console.error('[notifyClient][doc-review]', e.message));
  }

  return { client: freshClient || client, document: doc };
}

module.exports = {
  parseDocumentReviewBody,
  reviewCaseDocument,
  documentSlotHasFile,
};
