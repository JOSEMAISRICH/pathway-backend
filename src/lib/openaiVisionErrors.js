/**
 * Mensajes legibles para fallos de OpenAI visión (sin exponer API keys).
 */

function sanitizeOpenAiMessage(message) {
  return String(message ?? '')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_KEY]')
    .trim();
}

function formatOpenAiVisionError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = sanitizeOpenAiMessage(raw);

  if (/429|quota|rate limit|exceeded your current quota/i.test(msg)) {
    return 'Cuota de OpenAI agotada (429). Revisa facturación en platform.openai.com o usa EXTRACTION_MOCK=true / SKIP_PASSPORT_EXTRACTION=true en desarrollo.';
  }
  if (/401|invalid_api_key|incorrect api key/i.test(msg)) {
    return 'OPENAI_API_KEY inválida o revocada. Comprueba la variable en .env del backend.';
  }
  if (/OPENAI_API_KEY no configurada/i.test(msg)) {
    return 'OPENAI_API_KEY no configurada. Añádela al .env o usa EXTRACTION_MOCK=true en desarrollo.';
  }
  if (/no devolvió contenido/i.test(msg)) {
    return 'OpenAI respondió vacío; reintenta o revisa el modelo (OPENAI_VISION_MODEL).';
  }
  return msg || 'Error desconocido en extracción con OpenAI.';
}

module.exports = { sanitizeOpenAiMessage, formatOpenAiVisionError };
