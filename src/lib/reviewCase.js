/**
 * Normaliza el body del front para PATCH/POST /api/cases/:id/review.
 * Acepta varias convenciones (action, status, reviewStatus, decision).
 */

const { httpError } = require('./httpError');

const APPROVE_ALIASES = new Set([
  'approve',
  'approved',
  'aprobar',
  'aprobar_expediente',
  'accept',
  'accepted',
]);

const REJECT_ALIASES = new Set([
  'reject',
  'rejected',
  'rechazar',
  'rechazado',
  'deny',
  'denied',
  'action_required',
  'correction',
  'corregir',
]);

function normalizeToken(raw) {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * @param {object} body
 * @returns {{ action: 'approve'|'reject', feedback: string }}
 */
function parseReviewBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const rawAction =
    b.action ??
    b.decision ??
    b.reviewAction ??
    b.reviewStatus ??
    b.status;

  const token = normalizeToken(rawAction);
  let action = null;
  if (APPROVE_ALIASES.has(token)) action = 'approve';
  if (REJECT_ALIASES.has(token)) action = 'reject';

  if (!action) {
    throw httpError(
      400,
      'Indica la decisión con action/status: "approve" o "reject" (también accepted/rejected)'
    );
  }

  const feedbackRaw =
    b.feedback ??
    b.feedbackMessage ??
    b.message ??
    b.comment ??
    b.rejectReason ??
    b.correctionMessage ??
    b.notes;

  const feedback =
    feedbackRaw == null ? '' : String(feedbackRaw).trim();

  if (action === 'reject' && !feedback) {
    throw httpError(
      400,
      'feedback es obligatorio cuando se pide una corrección al cliente'
    );
  }

  return { action, feedback };
}

module.exports = { parseReviewBody };
