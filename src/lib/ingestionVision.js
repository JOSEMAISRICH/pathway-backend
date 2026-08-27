/**
 * OpenAI GPT-4o visión — devuelve JSON string para extractIdentityDocument.
 */

const OpenAI = require('openai');
const { config } = require('../config');
const { httpError } = require('./httpError');
const { formatOpenAiVisionError } = require('./openaiVisionErrors');

function buildUserContent(buffer, mimeType, originalName) {
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/jpg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/gif'
  ) {
    return [
      {
        type: 'text',
        text: 'Procesa el documento adjunto y devuelve únicamente el objeto JSON solicitado.',
      },
      { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
    ];
  }

  if (mimeType === 'application/pdf') {
    return [
      {
        type: 'text',
        text: 'Procesa el documento adjunto (PDF) y devuelve únicamente el objeto JSON solicitado.',
      },
      {
        type: 'file',
        file: {
          filename: originalName || 'document.pdf',
          file_data: dataUrl,
        },
      },
    ];
  }

  throw httpError(415, `Tipo de archivo no soportado para visión: ${mimeType}`);
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} systemPrompt
 * @param {string} [originalName]
 * @returns {Promise<string>}
 */
async function callOpenAiVisionModel(buffer, mimeType, systemPrompt, originalName) {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY no configurada');
  }
  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const model =
    process.env.OPENAI_VISION_MODEL || config.openaiVisionModel || config.openaiModel || 'gpt-4o';

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: buildUserContent(buffer, mimeType, originalName),
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      throw new Error('La IA no devolvió contenido');
    }
    return text;
  } catch (err) {
    const message = formatOpenAiVisionError(err);
    if (process.env.NODE_ENV !== 'test') {
      console.error('[ingestionVision]', { model, message });
    }
    throw new Error(message);
  }
}

module.exports = { callOpenAiVisionModel, buildUserContent };
