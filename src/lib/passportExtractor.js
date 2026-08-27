/**
 * Nivel 1 — Extracción robusta de pasaporte / NIE (GPT-4o u otro).
 * No falla el proceso si un campo es ilegible.
 */

const { buildExtractedDataFromAiPayload } = require('./extractedDataContract');
const { formatOpenAiVisionError } = require('./openaiVisionErrors');

const PASSPORT_EXTRACTION_SYSTEM_PROMPT = `Eres el motor de extracción de datos de PathWay. Recibes una imagen de documento de identidad (pasaporte o NIE). Devuelve SOLO un objeto JSON con estos campos:
"nombre", "apellidos", "numero_pasaporte", "nacionalidad", "fecha_nacimiento", "fecha_caducidad_pasaporte", "sexo", "numero_nie".
Si un dato es borroso, ilegible o no aparece, usa null en ese campo (no inventes).
Si hay campos null, añade "notas" en la raíz explicando qué requiere revisión manual.
Fechas siempre AAAA-MM-DD.`;

const IDENTITY_KEYS = [
  'nombre',
  'apellidos',
  'numero_pasaporte',
  'nacionalidad',
  'fecha_nacimiento',
  'fecha_caducidad_pasaporte',
  'sexo',
  'numero_nie',
];

function parseAiJson(content) {
  if (!content || typeof content !== 'string') return {};
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
  }
  return {};
}

function pickPayload(parsed) {
  const out = {};
  for (const key of IDENTITY_KEYS) {
    if (key in parsed) out[key] = parsed[key];
  }
  if (parsed.fecha_caducidad && !('fecha_caducidad_pasaporte' in out)) {
    out.fecha_caducidad_pasaporte = parsed.fecha_caducidad;
  }
  if (parsed.genero && !('sexo' in out)) {
    out.sexo = parsed.genero;
  }
  if (typeof parsed.notas === 'string') out.notas = parsed.notas;
  if (typeof parsed.alerta === 'string') out.alerta = parsed.alerta;
  return out;
}

/**
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.mimeType
 * @param {string} opts.documentType — passport | nie
 * @param {string} opts.documentId
 * @param {string} opts.caseId
 * @param {Function} opts.callVisionModel — async (buffer, mime, systemPrompt) => string JSON
 * @param {string} [opts.model]
 */
async function extractIdentityDocument({
  buffer,
  mimeType,
  documentType = 'passport',
  documentId,
  caseId,
  callVisionModel,
  model = 'gpt-4o',
}) {
  const ctx = { documentType, documentId, caseId };

  if (!buffer?.length) {
    return buildExtractedDataFromAiPayload({}, ctx, {
      model,
      aiNotes: 'Archivo vacío o no legible.',
    });
  }

  if (typeof callVisionModel !== 'function') {
    return buildExtractedDataFromAiPayload(
      {
        nombre: null,
        apellidos: null,
        numero_pasaporte: null,
        fecha_nacimiento: null,
      },
      ctx,
      {
        model,
        aiNotes: 'Motor de IA no configurado (OPENAI_API_KEY ausente o EXTRACTION_MOCK).',
      }
    );
  }

  try {
    const rawContent = await callVisionModel(
      buffer,
      mimeType,
      PASSPORT_EXTRACTION_SYSTEM_PROMPT
    );
    const parsed = parseAiJson(rawContent);
    const payload = pickPayload(parsed);
    const aiNotes = typeof payload.notas === 'string' ? payload.notas : undefined;
    const alerta = typeof payload.alerta === 'string' ? payload.alerta : undefined;
    delete payload.notas;
    delete payload.alerta;
    const data = buildExtractedDataFromAiPayload(payload, ctx, { model, aiNotes });
    if (alerta) {
      if (!data.raw) data.raw = {};
      data.raw.alerta = alerta;
    }
    if (process.env.NODE_ENV !== 'test' && data.ingestionStatus === 'requires_review') {
      console.warn('[passportExtractor][extraction]', {
        caseId,
        documentId,
        documentType,
        status: data.ingestionStatus,
        fieldsWithValue: Object.entries(data.fields || {})
          .filter(([, f]) => f?.value)
          .map(([k]) => k),
        note: data.raw?.aiNotes || data.errors?.[0]?.message,
      });
    }
    return data;
  } catch (err) {
    const message = formatOpenAiVisionError(err);
    if (process.env.NODE_ENV !== 'test') {
      console.error('[passportExtractor][vision-error]', {
        caseId,
        documentId,
        documentType,
        message,
      });
    }
    return buildExtractedDataFromAiPayload({}, ctx, {
      model,
      aiNotes: message,
      technicalFailure: true,
    });
  }
}

async function extractPassportFromImage(opts) {
  return extractIdentityDocument({
    ...opts,
    documentType: opts.documentType ?? 'passport',
  });
}

module.exports = {
  PASSPORT_EXTRACTION_SYSTEM_PROMPT,
  extractIdentityDocument,
  extractPassportFromImage,
  parseAiJson,
  pickPayload,
};
