/**
 * Case Engine v0 — reglas, checklist y validaciones por tipo de trámite.
 */

const { documentHasFile } = require('../caseProgress');
const { hasUsableExtractedIdentity, getLegacyExtractedForPdf } = require('../caseDocuments');
const {
  CASE_TYPE_DEFINITIONS,
  DEFAULT_CASE_TYPE,
  LEGACY_CASE_TYPE,
} = require('./definitions');

function normalizeCaseType(raw) {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (t && CASE_TYPE_DEFINITIONS[t]) return t;
  return null;
}

/** Resuelve tipo de expediente (legacy sin campo → MVP-3). */
function resolveCaseType(client) {
  const fromDoc = normalizeCaseType(client?.caseType);
  if (fromDoc) return fromDoc;
  return LEGACY_CASE_TYPE;
}

function getCaseTypeDefinition(caseType) {
  const key = normalizeCaseType(caseType) || DEFAULT_CASE_TYPE;
  return CASE_TYPE_DEFINITIONS[key] || CASE_TYPE_DEFINITIONS[DEFAULT_CASE_TYPE];
}

function listCaseTypes() {
  return Object.values(CASE_TYPE_DEFINITIONS).map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    documentsCount: d.documentSlots.length,
  }));
}

function getDocumentSlots(caseType) {
  return getCaseTypeDefinition(caseType).documentSlots;
}

function isClientUploadableKey(caseType, key) {
  const slots = getDocumentSlots(caseType);
  return slots.some((s) => s.key === key && s.clientUpload !== false);
}

function docByKey(docs, key) {
  return docs.find((d) => (d.key || d.type) === key);
}

function isDocApproved(doc) {
  const status = (doc?.reviewStatus || doc?.status || 'pending').toLowerCase();
  return status === 'approved';
}

/**
 * Evalúa checklist automático para el panel del despacho.
 * @param {import('mongoose').Document} client
 * @param {import('mongoose').Document[]} docs
 */
function evaluateChecklist(client, docs) {
  const caseType = resolveCaseType(client);
  const def = getCaseTypeDefinition(caseType);
  const slots = def.documentSlots;

  const uploaded = slots.filter((s) => {
    const d = docByKey(docs, s.key);
    return d && documentHasFile(d, client);
  });
  const approved = slots.filter((s) => {
    const d = docByKey(docs, s.key);
    return d && isDocApproved(d);
  });

  const flatIdentity = client?.extractedData;
  const identityOk =
    hasUsableExtractedIdentity(
      flatIdentity && typeof flatIdentity === 'object' && !flatIdentity.schemaVersion
        ? flatIdentity
        : null
    ) ||
    docs.some((d) => {
      if ((d.key || d.type) !== 'passport') return false;
      const st = (d.ingestionStatus || '').toLowerCase();
      return st === 'processed' || st === 'requires_review';
    });

  const flags = {
    identity_extracted: identityOk,
    all_docs_uploaded: uploaded.length === slots.length,
    all_docs_approved: approved.length === slots.length,
    fee_790_present: Boolean(docByKey(docs, 'fee_790') && documentHasFile(docByKey(docs, 'fee_790'), client)),
    empadronamiento_present: Boolean(
      docByKey(docs, 'empadronamiento') && documentHasFile(docByKey(docs, 'empadronamiento'), client)
    ),
    criminal_record_present: Boolean(
      docByKey(docs, 'criminal_record') && documentHasFile(docByKey(docs, 'criminal_record'), client)
    ),
    case_approved: (client?.reviewStatus || '').toLowerCase() === 'approved',
  };

  return def.checklist.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
    done: Boolean(flags[item.id]),
  }));
}

/**
 * Bloqueos antes de aprobar expediente (case-level).
 * @returns {{ ok: true } | { ok: false, error: string, checklist: ReturnType<typeof evaluateChecklist> }}
 */
async function validateCaseApproval(client, docs) {
  const checklist = evaluateChecklist(client, docs);

  const notUploaded = getDocumentSlots(resolveCaseType(client)).filter((s) => {
    const d = docByKey(docs, s.key);
    return !d || !documentHasFile(d, client);
  });
  if (notUploaded.length > 0) {
    return {
      ok: false,
      error: `Faltan documentos por subir: ${notUploaded.map((s) => s.label).join(', ')}`,
      checklist,
    };
  }

  const notApproved = getDocumentSlots(resolveCaseType(client)).filter((s) => {
    const d = docByKey(docs, s.key);
    return !d || !isDocApproved(d);
  });
  if (notApproved.length > 0) {
    return {
      ok: false,
      error: `Aprueba todos los documentos antes de cerrar el expediente: ${notApproved.map((s) => s.label).join(', ')}`,
      checklist,
    };
  }

  const flat = await getLegacyExtractedForPdf(client);
  if (!hasUsableExtractedIdentity(flat)) {
    return {
      ok: false,
      error:
        'No hay datos de identidad del pasaporte para generar el PDF. Revisa la extracción o vuelve a subir el pasaporte.',
      checklist,
    };
  }

  return { ok: true, checklist };
}

module.exports = {
  resolveCaseType,
  normalizeCaseType,
  getCaseTypeDefinition,
  listCaseTypes,
  getDocumentSlots,
  isClientUploadableKey,
  evaluateChecklist,
  validateCaseApproval,
  DEFAULT_CASE_TYPE,
};
