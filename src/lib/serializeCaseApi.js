/**
 * Serialización alineada con pathwaysaas/lib/api/caseTypes.ts
 */

const { magicPortalUrl } = require('./portalUrl');
const {
  loadCaseDocuments,
  ensureCaseHasDocuments,
  serializeDocumentForApi,
  hasRejectedDocuments,
  buildFinalPdfUrl,
} = require('./caseDocuments');
const {
  resolveCaseType,
  evaluateChecklist,
  getCaseTypeDefinition,
} = require('./caseEngine');

/**
 * @param {import('mongoose').Document} client
 * @param {import('mongoose').Document[]} docs
 */
function enrichCaseJson(client, docs) {
  const j = client.toJSON();
  const token = j.magicToken || j.magicLinkToken || client.magicLinkToken;

  j.clientName = j.fullName;
  j.clientEmail = j.email || '';
  j.clientPhone = j.phone || null;
  j.magicToken = token;
  j.magicLinkToken = token;
  j.magicLinkUrl = magicPortalUrl(token);
  j.feedbackMessage = j.feedbackMessage || '';
  j.progress = typeof j.progress === 'number' ? j.progress : 0;
  j.status = j.status || 'pending';
  j.reviewStatus = j.reviewStatus || 'pending';

  const caseType = resolveCaseType(client);
  j.caseType = caseType;
  j.caseTypeLabel = getCaseTypeDefinition(caseType).label;

  if (Array.isArray(docs)) {
    j.documents = docs.map((d) => serializeDocumentForApi(d, client));
    j.hasRejectedDocuments = hasRejectedDocuments(docs);
    j.checklist = evaluateChecklist(client, docs);
  }

  j.hasFinalPdf = Boolean(client.finalPdfPath);
  const approved = (j.reviewStatus || 'pending') === 'approved';
  j.finalPdfUrl = approved || j.hasFinalPdf ? buildFinalPdfUrl(client) : null;

  return j;
}

async function serializeCaseDetail(client) {
  await ensureCaseHasDocuments(client._id);
  const docs = await loadCaseDocuments(client._id);
  return enrichCaseJson(client, docs);
}

async function serializeCaseListItem(client) {
  await ensureCaseHasDocuments(client._id);
  const docs = await loadCaseDocuments(client._id);
  const j = enrichCaseJson(client, docs);
  return {
    id: j.id,
    fullName: j.fullName,
    clientName: j.clientName,
    clientEmail: j.clientEmail,
    clientPhone: j.clientPhone || '',
    progress: j.progress,
    status: j.status,
    magicToken: j.magicToken,
    magicLinkToken: j.magicLinkToken,
    magicLinkUrl: j.magicLinkUrl,
    magicExpiresAt: j.magicExpiresAt,
    updatedAt: j.updatedAt,
    reviewStatus: j.reviewStatus,
    caseType: j.caseType,
    caseTypeLabel: j.caseTypeLabel,
    hasExtractedData: Boolean(j.extractedData),
    hasFinalPdf: j.hasFinalPdf,
    documentsCount: docs.length,
    hasRejectedDocuments: j.hasRejectedDocuments,
  };
}

/**
 * Listado tolerante a expedientes legacy corruptos.
 */
async function serializeCaseListItemSafe(client) {
  try {
    return await serializeCaseListItem(client);
  } catch (e) {
    console.error('[cases][list-item]', client._id?.toString(), e.message);
    const j = client.toJSON();
    const token = j.magicToken || j.magicLinkToken;
    return {
      id: j.id,
      fullName: j.fullName || '',
      clientName: j.fullName || '',
      clientEmail: j.email || '',
      clientPhone: j.phone || '',
      progress: j.progress ?? 0,
      status: j.status || 'pending',
      magicToken: token,
      magicLinkToken: token,
      magicLinkUrl: magicPortalUrl(token),
      magicExpiresAt: j.magicExpiresAt ?? null,
      updatedAt: j.updatedAt,
      reviewStatus: j.reviewStatus || 'pending',
      hasExtractedData: Boolean(j.extractedData),
      hasFinalPdf: Boolean(j.finalPdfPath),
      documentsCount: 0,
      hasRejectedDocuments: false,
    };
  }
}

function wantsSendMagicLinkEmail(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (b.sendMagicLinkEmail === true) return true;
  if (b.sendMagicLinkEmail === 'true') return true;
  if (b.sendMagicLinkEmail === 1 || b.sendMagicLinkEmail === '1') return true;
  return false;
}

module.exports = {
  enrichCaseJson,
  serializeCaseDetail,
  serializeCaseListItem,
  serializeCaseListItemSafe,
  wantsSendMagicLinkEmail,
};
