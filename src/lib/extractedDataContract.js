/**
 * Nivel 1 — Contrato ExtractedData (espejo de pathwaysaas/lib/api/extractedData.ts).
 */

const EXTRACTED_DATA_SCHEMA_VERSION = '1.0';

const LEGACY_IDENTITY_KEYS = [
  'nombre',
  'apellidos',
  'numero_pasaporte',
  'nacionalidad',
  'fecha_nacimiento',
  'fecha_caducidad_pasaporte',
  'sexo',
  'numero_nie',
];

function fieldFromLegacy(value, notes) {
  if (value == null || value === '') {
    return { value: null, status: 'missing', source: 'ai', notes };
  }
  return { value: String(value), status: 'extracted', source: 'ai' };
}

function normalizeExtractedData(raw, ctx) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion === EXTRACTED_DATA_SCHEMA_VERSION && raw.ingestionStatus) {
    return raw;
  }

  const fields = {};
  for (const key of LEGACY_IDENTITY_KEYS) {
    if (key in raw) {
      fields[key] = fieldFromLegacy(
        raw[key],
        typeof raw.notas === 'string' ? raw.notas : undefined
      );
    }
  }
  if (raw.fecha_caducidad && !fields.fecha_caducidad_pasaporte) {
    fields.fecha_caducidad_pasaporte = fieldFromLegacy(raw.fecha_caducidad, undefined);
  }
  if (raw.genero && !fields.sexo) {
    fields.sexo = fieldFromLegacy(raw.genero, undefined);
  }

  const hasAny = Object.values(fields).some((f) => f?.value);
  const hasMissing = Object.values(fields).some((f) => f?.status === 'missing');
  const aiNotes = typeof raw.notas === 'string' ? raw.notas : undefined;

  return {
    schemaVersion: EXTRACTED_DATA_SCHEMA_VERSION,
    documentType: ctx.documentType,
    documentId: ctx.documentId,
    caseId: ctx.caseId,
    ingestionStatus:
      hasMissing || aiNotes || !hasAny
        ? 'requires_review'
        : hasAny
          ? 'processed'
          : 'requires_review',
    extractedAt: new Date().toISOString(),
    fields,
    raw: aiNotes ? { aiNotes } : undefined,
  };
}

const REQUIRED_FIELDS_BY_TYPE = {
  passport: ['nombre', 'apellidos', 'numero_pasaporte', 'fecha_nacimiento'],
  nie: ['numero_nie', 'nombre', 'apellidos'],
};

function buildExtractionField(value, { confidence, notes } = {}) {
  if (value == null || String(value).trim() === '') {
    return { value: null, status: 'missing', source: 'ai', notes };
  }
  const status =
    confidence != null && confidence < 0.6 ? 'low_confidence' : 'extracted';
  return {
    value: String(value).trim(),
    status,
    source: 'ai',
    confidence,
    notes,
  };
}

function buildExtractedDataFromAiPayload(aiPayload, ctx, { model, aiNotes, technicalFailure } = {}) {
  const fields = {};
  for (const key of LEGACY_IDENTITY_KEYS) {
    if (key in (aiPayload ?? {})) {
      fields[key] = buildExtractionField(aiPayload[key], {
        notes: aiPayload[key] == null ? aiNotes : undefined,
      });
    }
  }

  const required = REQUIRED_FIELDS_BY_TYPE[ctx.documentType] ?? [];
  const missingRequired = required.filter(
    (k) => !fields[k] || fields[k].status !== 'extracted'
  );
  const hasLow = Object.values(fields).some((f) => f?.status === 'low_confidence');
  const hasAnyValue = Object.values(fields).some((f) => f?.value);

  let ingestionStatus = 'processed';
  if (technicalFailure) {
    ingestionStatus = 'error';
  } else if (missingRequired.length > 0 || hasLow || aiNotes || !hasAnyValue) {
    // Campos ilegibles / vacíos → revisión manual, NO error técnico
    ingestionStatus = 'requires_review';
  }

  return {
    schemaVersion: EXTRACTED_DATA_SCHEMA_VERSION,
    documentType: ctx.documentType,
    documentId: ctx.documentId,
    caseId: ctx.caseId,
    ingestionStatus,
    extractedAt: new Date().toISOString(),
    model,
    fields,
    raw: aiNotes ? { aiNotes } : undefined,
    errors: technicalFailure
      ? [{ code: 'EXTRACTION_FAILED', message: aiNotes || 'Error técnico en extracción' }]
      : missingRequired.length > 0
        ? [
            {
              code: 'PARTIAL_EXTRACTION',
              message: `Campos pendientes: ${missingRequired.join(', ')}`,
            },
          ]
        : !hasAnyValue && aiNotes
          ? [{ code: 'NO_FIELDS_EXTRACTED', message: aiNotes }]
          : undefined,
  };
}

function flattenExtractedForLegacy(data) {
  if (!data?.fields) {
    if (data && typeof data === 'object' && !data.schemaVersion) return data;
    return null;
  }
  const out = {};
  for (const [key, field] of Object.entries(data.fields)) {
    if (key === 'imageQuality' || !field?.value) continue;
    out[key] = field.value;
  }
  if (out.fecha_caducidad_pasaporte && !out.fecha_caducidad) {
    out.fecha_caducidad = out.fecha_caducidad_pasaporte;
  }
  if (out.sexo && !out.genero) {
    out.genero = out.sexo;
  }
  if (data.raw?.aiNotes) out.notas = data.raw.aiNotes;
  if (data.raw?.alerta) out.alerta = data.raw.alerta;
  return Object.keys(out).length > 0 ? out : null;
}

function mergeCaseExtractedData(caseDoc, documentExtracted) {
  const flat = flattenExtractedForLegacy(documentExtracted);
  if (!flat) return caseDoc.extractedData ?? null;
  return { ...(caseDoc.extractedData ?? {}), ...flat };
}

module.exports = {
  EXTRACTED_DATA_SCHEMA_VERSION,
  LEGACY_IDENTITY_KEYS,
  normalizeExtractedData,
  buildExtractionField,
  buildExtractedDataFromAiPayload,
  flattenExtractedForLegacy,
  mergeCaseExtractedData,
};
