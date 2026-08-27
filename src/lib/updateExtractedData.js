/**
 * Corrección manual de campos extraídos (ExtractedData v1.0) por el despacho.
 */

const {
  EXTRACTED_DATA_SCHEMA_VERSION,
  LEGACY_IDENTITY_KEYS,
  normalizeExtractedData,
  mergeCaseExtractedData,
} = require('./extractedDataContract');
const { httpError } = require('./httpError');

const REQUIRED_FIELDS_BY_TYPE = {
  passport: ['nombre', 'apellidos', 'numero_pasaporte', 'fecha_nacimiento'],
  nie: ['numero_nie', 'nombre', 'apellidos'],
};

function isIdentityDoc(doc) {
  const key = String(doc?.key || doc?.type || '').toLowerCase();
  return key === 'passport' || key.includes('pasaport') || key === 'nie';
}

function parseManualFieldsBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const raw = b.fields && typeof b.fields === 'object' ? b.fields : b;
  const fields = {};
  for (const key of LEGACY_IDENTITY_KEYS) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (v == null) {
      fields[key] = null;
    } else {
      fields[key] = String(v).trim();
    }
  }
  if (Object.keys(fields).length === 0) {
    throw httpError(400, 'Indica al menos un campo en fields');
  }
  return fields;
}

function manualField(value) {
  if (value == null || value === '') {
    return { value: null, status: 'missing', source: 'manual' };
  }
  return { value: String(value), status: 'extracted', source: 'manual' };
}

function recomputeIngestionStatus(fields, documentType, previousStatus) {
  const required = REQUIRED_FIELDS_BY_TYPE[documentType] ?? REQUIRED_FIELDS_BY_TYPE.passport;
  const missingRequired = required.filter(
    (k) => !fields[k] || fields[k].status !== 'extracted'
  );
  const hasLow = Object.values(fields).some((f) => f?.status === 'low_confidence');

  if (previousStatus === 'error' && missingRequired.length === 0 && !hasLow) {
    return 'processed';
  }
  if (missingRequired.length > 0 || hasLow) {
    return 'requires_review';
  }
  return 'processed';
}

function applyManualExtractedFields(existing, patch, ctx) {
  const base =
    normalizeExtractedData(existing, ctx) ||
    ({
      schemaVersion: EXTRACTED_DATA_SCHEMA_VERSION,
      documentType: ctx.documentType,
      documentId: ctx.documentId,
      caseId: ctx.caseId,
      ingestionStatus: 'requires_review',
      extractedAt: new Date().toISOString(),
      fields: {},
    });

  const fields = { ...(base.fields || {}) };
  for (const [key, value] of Object.entries(patch)) {
    fields[key] = manualField(value);
  }

  const docType = ctx.documentType.includes('nie') ? 'nie' : 'passport';
  const ingestionStatus = recomputeIngestionStatus(fields, docType, base.ingestionStatus);

  const required = REQUIRED_FIELDS_BY_TYPE[docType] ?? [];
  const missingRequired = required.filter(
    (k) => !fields[k] || fields[k].status !== 'extracted'
  );

  return {
    ...base,
    schemaVersion: EXTRACTED_DATA_SCHEMA_VERSION,
    documentType: ctx.documentType,
    documentId: ctx.documentId,
    caseId: ctx.caseId,
    ingestionStatus,
    extractedAt: base.extractedAt || new Date().toISOString(),
    manuallyEditedAt: new Date().toISOString(),
    fields,
    raw: {
      ...(base.raw || {}),
      manualEdit: true,
    },
    errors:
      ingestionStatus === 'processed'
        ? undefined
        : missingRequired.length > 0
          ? [
              {
                code: 'PARTIAL_EXTRACTION',
                message: `Campos pendientes: ${missingRequired.join(', ')}`,
              },
            ]
          : base.errors,
  };
}

async function updateDocumentExtractedData({ client, doc, fieldsPatch }) {
  if (!isIdentityDoc(doc)) {
    throw httpError(400, 'Solo se pueden editar datos de pasaporte o NIE');
  }

  const ctx = {
    documentType: doc.key || doc.type || 'passport',
    documentId: doc._id.toString(),
    caseId: client._id.toString(),
  };

  const updated = applyManualExtractedFields(doc.extractedData, fieldsPatch, ctx);
  doc.extractedData = updated;
  doc.ingestionStatus = updated.ingestionStatus;
  await doc.save();

  client.extractedData = mergeCaseExtractedData(client, updated);
  await client.save();

  return updated;
}

module.exports = {
  parseManualFieldsBody,
  applyManualExtractedFields,
  updateDocumentExtractedData,
  isIdentityDoc,
};
